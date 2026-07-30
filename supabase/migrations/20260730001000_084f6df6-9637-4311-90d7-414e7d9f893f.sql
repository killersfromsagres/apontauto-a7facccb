-- ============================================================
-- ITEM 14 — Enums e máquinas de estado do módulo de Água
-- ============================================================

-- ---------- 14.1 enum de rota ----------
CREATE TYPE public.agua_rota_status AS ENUM (
  'rascunho', 'planejada', 'atribuida', 'pronta', 'em_andamento',
  'pausada', 'concluida', 'concluida_com_divergencia', 'cancelada'
);

-- ---------- 14.2 enum de parada ----------
CREATE TYPE public.agua_visita_status AS ENUM (
  'pendente', 'em_deslocamento', 'em_atendimento', 'concluida', 'parcial',
  'sem_necessidade', 'acesso_bloqueado', 'local_fechado', 'falta_bags',
  'endereco_divergente', 'reprogramada', 'nao_realizada', 'cancelada'
);

-- ---------- 14.3 enum de solicitação de filtro ----------
CREATE TYPE public.agua_filtro_situacao AS ENUM (
  'solicitada', 'em_triagem', 'aprovada', 'rejeitada', 'aguardando_material',
  'programada', 'em_deslocamento', 'em_execucao', 'concluida', 'validada',
  'reaberta', 'cancelada', 'aberta', 'em_atendimento'
);

-- ---------- conversão das colunas existentes ----------
ALTER TABLE public.agua_rotas DROP CONSTRAINT IF EXISTS agua_rotas_status_check;
ALTER TABLE public.agua_visitas DROP CONSTRAINT IF EXISTS agua_visitas_status_check;
ALTER TABLE public.agua_filtro_solicitacoes
  DROP CONSTRAINT IF EXISTS agua_filtro_solicitacoes_situacao_chk;
DROP INDEX IF EXISTS public.agua_filtro_solic_vence_idx;

ALTER TABLE public.agua_rotas ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.agua_rotas
  ALTER COLUMN status TYPE public.agua_rota_status
  USING (CASE lower(btrim(coalesce(status, 'planejada')))
    WHEN 'finalizada' THEN 'concluida'
    WHEN 'aberta' THEN 'planejada'
    WHEN 'draft' THEN 'rascunho'
    WHEN 'scheduled' THEN 'planejada'
    WHEN 'assigned' THEN 'atribuida'
    WHEN 'ready' THEN 'pronta'
    WHEN 'in_progress' THEN 'em_andamento'
    WHEN 'paused' THEN 'pausada'
    WHEN 'completed' THEN 'concluida'
    WHEN 'cancelled' THEN 'cancelada'
    WHEN '' THEN 'planejada'
    ELSE lower(btrim(status))
  END)::public.agua_rota_status;
ALTER TABLE public.agua_rotas ALTER COLUMN status SET DEFAULT 'planejada'::public.agua_rota_status;
ALTER TABLE public.agua_rotas ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.agua_visitas ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.agua_visitas
  ALTER COLUMN status TYPE public.agua_visita_status
  USING (CASE lower(btrim(coalesce(status, 'pendente')))
    WHEN '' THEN 'pendente'
    WHEN 'pending' THEN 'pendente'
    WHEN 'travelling' THEN 'em_deslocamento'
    WHEN 'in_service' THEN 'em_atendimento'
    WHEN 'completed' THEN 'concluida'
    WHEN 'partial' THEN 'parcial'
    WHEN 'no_need' THEN 'sem_necessidade'
    WHEN 'access_blocked' THEN 'acesso_bloqueado'
    WHEN 'closed' THEN 'local_fechado'
    WHEN 'out_of_stock' THEN 'falta_bags'
    WHEN 'location_mismatch' THEN 'endereco_divergente'
    WHEN 'rescheduled' THEN 'reprogramada'
    WHEN 'cancelled' THEN 'cancelada'
    ELSE lower(btrim(status))
  END)::public.agua_visita_status;
ALTER TABLE public.agua_visitas ALTER COLUMN status SET DEFAULT 'pendente'::public.agua_visita_status;
ALTER TABLE public.agua_visitas ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.agua_filtro_solicitacoes ALTER COLUMN situacao DROP DEFAULT;
ALTER TABLE public.agua_filtro_solicitacoes
  ALTER COLUMN situacao TYPE public.agua_filtro_situacao
  USING (CASE lower(btrim(coalesce(situacao, 'solicitada')))
    WHEN '' THEN 'solicitada'
    ELSE lower(btrim(situacao))
  END)::public.agua_filtro_situacao;
ALTER TABLE public.agua_filtro_solicitacoes
  ALTER COLUMN situacao SET DEFAULT 'solicitada'::public.agua_filtro_situacao;
ALTER TABLE public.agua_filtro_solicitacoes ALTER COLUMN situacao SET NOT NULL;

CREATE INDEX agua_filtro_solic_vence_idx ON public.agua_filtro_solicitacoes (vence_em)
  WHERE situacao NOT IN ('concluida','validada','cancelada','rejeitada');

-- ============================================================
-- Máquinas de estado validadas no servidor
-- ============================================================

CREATE OR REPLACE FUNCTION public.tg_agua_rota_transicao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE permitido public.agua_rota_status[];
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  permitido := CASE OLD.status::text
    WHEN 'rascunho' THEN ARRAY['planejada','cancelada']
    WHEN 'planejada' THEN ARRAY['rascunho','atribuida','pronta','cancelada']
    WHEN 'atribuida' THEN ARRAY['planejada','pronta','cancelada']
    WHEN 'pronta' THEN ARRAY['atribuida','em_andamento','cancelada']
    WHEN 'em_andamento' THEN ARRAY['pausada','concluida','concluida_com_divergencia','cancelada']
    WHEN 'pausada' THEN ARRAY['em_andamento','cancelada']
    WHEN 'concluida' THEN ARRAY['concluida_com_divergencia']
    WHEN 'concluida_com_divergencia' THEN ARRAY['concluida']
    ELSE ARRAY[]::text[]
  END::public.agua_rota_status[];

  -- gestor pode cancelar de qualquer estado não encerrado
  IF NEW.status = 'cancelada' AND OLD.status NOT IN ('concluida','concluida_com_divergencia','cancelada')
     AND public.agua_is_gestor() THEN
    RETURN NEW;
  END IF;

  IF NOT (NEW.status = ANY (permitido)) THEN
    RAISE EXCEPTION 'Transição de rota inválida: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agua_rotas_transicao BEFORE UPDATE OF status ON public.agua_rotas
  FOR EACH ROW EXECUTE FUNCTION public.tg_agua_rota_transicao();

CREATE OR REPLACE FUNCTION public.tg_agua_visita_transicao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  finais public.agua_visita_status[] := ARRAY[
    'concluida','parcial','sem_necessidade','acesso_bloqueado','local_fechado',
    'falta_bags','endereco_divergente','reprogramada','nao_realizada','cancelada'
  ]::public.agua_visita_status[];
  permitido public.agua_visita_status[];
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  permitido := CASE
    WHEN OLD.status = 'pendente' THEN ARRAY['em_deslocamento','em_atendimento']::public.agua_visita_status[] || finais
    WHEN OLD.status = 'em_deslocamento' THEN ARRAY['pendente','em_atendimento']::public.agua_visita_status[] || finais
    WHEN OLD.status = 'em_atendimento' THEN ARRAY['em_deslocamento']::public.agua_visita_status[] || finais
    -- reabertura de parada encerrada exige gestor (retificação registrada à parte)
    WHEN OLD.status = ANY (finais) AND public.agua_is_gestor()
      THEN ARRAY['pendente','em_deslocamento','em_atendimento']::public.agua_visita_status[] || finais
    ELSE ARRAY[]::public.agua_visita_status[]
  END;

  IF NOT (NEW.status = ANY (permitido)) THEN
    RAISE EXCEPTION 'Transição de parada inválida: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agua_visitas_transicao BEFORE UPDATE OF status ON public.agua_visitas
  FOR EACH ROW EXECUTE FUNCTION public.tg_agua_visita_transicao();

CREATE OR REPLACE FUNCTION public.tg_agua_filtro_transicao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE permitido public.agua_filtro_situacao[];
BEGIN
  IF NEW.situacao = OLD.situacao THEN RETURN NEW; END IF;

  permitido := CASE OLD.situacao::text
    WHEN 'solicitada' THEN ARRAY['em_triagem','aprovada','rejeitada','cancelada']
    WHEN 'aberta' THEN ARRAY['em_triagem','aprovada','rejeitada','cancelada']
    WHEN 'em_triagem' THEN ARRAY['aprovada','rejeitada','aguardando_material','cancelada']
    WHEN 'aprovada' THEN ARRAY['aguardando_material','programada','cancelada']
    WHEN 'aguardando_material' THEN ARRAY['programada','cancelada']
    WHEN 'programada' THEN ARRAY['em_deslocamento','em_execucao','aguardando_material','cancelada']
    WHEN 'em_deslocamento' THEN ARRAY['em_execucao','programada','cancelada']
    WHEN 'em_execucao' THEN ARRAY['concluida','aguardando_material','cancelada']
    WHEN 'em_atendimento' THEN ARRAY['concluida','aguardando_material','cancelada']
    WHEN 'concluida' THEN ARRAY['validada','reaberta']
    WHEN 'validada' THEN ARRAY['reaberta']
    WHEN 'reaberta' THEN ARRAY['em_triagem','programada','em_execucao','cancelada']
    ELSE ARRAY[]::text[]
  END::public.agua_filtro_situacao[];

  IF NOT (NEW.situacao = ANY (permitido)) THEN
    RAISE EXCEPTION 'Transição de solicitação inválida: % -> %', OLD.situacao, NEW.situacao
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agua_filtro_transicao BEFORE UPDATE OF situacao ON public.agua_filtro_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_agua_filtro_transicao();