-- ============ 12.1 Cadastro de pontos de filtro ============
ALTER TABLE public.agua_filtro_ativos
  ADD COLUMN IF NOT EXISTS predio text,
  ADD COLUMN IF NOT EXISTS andar_setor text,
  ADD COLUMN IF NOT EXISTS espaco text,
  ADD COLUMN IF NOT EXISTS tipo_equipamento text,
  ADD COLUMN IF NOT EXISTS fabricante text,
  ADD COLUMN IF NOT EXISTS modelo_elemento text,
  ADD COLUMN IF NOT EXISTS patrimonio text,
  ADD COLUMN IF NOT EXISTS condicao_atual text NOT NULL DEFAULT 'boa',
  ADD COLUMN IF NOT EXISTS foto_url text,
  ADD COLUMN IF NOT EXISTS qr_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  ADD COLUMN IF NOT EXISTS responsavel text;

DO $$ BEGIN
  ALTER TABLE public.agua_filtro_ativos
    ADD CONSTRAINT agua_filtro_ativos_condicao_chk
    CHECK (condicao_atual IN ('boa','regular','ruim','critica'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS agua_filtro_ativos_qr_uidx
  ON public.agua_filtro_ativos (qr_token);

-- ============ 12.2 / 12.3 / 12.4 / 12.5 Solicitações ============
ALTER TABLE public.agua_filtro_solicitacoes
  ADD COLUMN IF NOT EXISTS solicitante_nome text,
  ADD COLUMN IF NOT EXISTS predio text,
  ADD COLUMN IF NOT EXISTS andar_setor text,
  ADD COLUMN IF NOT EXISTS espaco text,
  ADD COLUMN IF NOT EXISTS motivos text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS motivo_outro text,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS disponibilidade_acesso text,
  ADD COLUMN IF NOT EXISTS os_relacionada text,
  ADD COLUMN IF NOT EXISTS motivo_rejeicao text,
  -- programação
  ADD COLUMN IF NOT EXISTS responsavel_nome text,
  ADD COLUMN IF NOT EXISTS responsavel_2_nome text,
  ADD COLUMN IF NOT EXISTS programada_em timestamptz,
  ADD COLUMN IF NOT EXISTS veiculo_id uuid,
  ADD COLUMN IF NOT EXISTS material_descricao text,
  ADD COLUMN IF NOT EXISTS material_quantidade integer,
  ADD COLUMN IF NOT EXISTS material_reservado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS incluir_na_rota boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lembrete_em timestamptz,
  ADD COLUMN IF NOT EXISTS observacao_programacao text,
  -- conclusão
  ADD COLUMN IF NOT EXISTS foto_antes_url text,
  ADD COLUMN IF NOT EXISTS foto_depois_url text,
  ADD COLUMN IF NOT EXISTS filtro_utilizado text,
  ADD COLUMN IF NOT EXISTS lote text,
  ADD COLUMN IF NOT EXISTS quantidade_utilizada integer,
  ADD COLUMN IF NOT EXISTS colaborador_conclusao text,
  ADD COLUMN IF NOT EXISTS descarte_destino text,
  ADD COLUMN IF NOT EXISTS condicao_apos text,
  ADD COLUMN IF NOT EXISTS nova_proxima_troca date,
  ADD COLUMN IF NOT EXISTS assinatura_url text,
  -- validação / avaliação
  ADD COLUMN IF NOT EXISTS validada_em timestamptz,
  ADD COLUMN IF NOT EXISTS reaberturas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avaliacao_nota smallint,
  ADD COLUMN IF NOT EXISTS avaliacao_comentario text;

DO $$ BEGIN
  ALTER TABLE public.agua_filtro_solicitacoes
    ADD CONSTRAINT agua_filtro_solic_avaliacao_chk
    CHECK (avaliacao_nota IS NULL OR avaliacao_nota BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.agua_filtro_solicitacoes
    ADD CONSTRAINT agua_filtro_solic_veiculo_fk
    FOREIGN KEY (veiculo_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Workflow completo (mantém valores legados 'aberta' e 'em_atendimento')
ALTER TABLE public.agua_filtro_solicitacoes
  DROP CONSTRAINT IF EXISTS agua_filtro_solicitacoes_situacao_chk;
ALTER TABLE public.agua_filtro_solicitacoes
  ADD CONSTRAINT agua_filtro_solicitacoes_situacao_chk CHECK (situacao IN (
    'aberta','em_atendimento',
    'solicitada','em_triagem','aprovada','rejeitada','aguardando_material',
    'programada','em_deslocamento','em_execucao','concluida','validada',
    'reaberta','cancelada'
  ));

CREATE INDEX IF NOT EXISTS agua_filtro_solic_ativo_idx
  ON public.agua_filtro_solicitacoes (ativo_id, criado_em DESC);

-- Trilha: cobre os novos status
CREATE OR REPLACE FUNCTION public.tg_agua_filtro_trilha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.agua_filtro_eventos (solicitacao_id, tipo, situacao_nova, comentario, autor)
    VALUES (NEW.id, 'abertura', NEW.situacao, NEW.descricao, NEW.criado_por);
    RETURN NEW;
  END IF;

  IF NEW.situacao IS DISTINCT FROM OLD.situacao THEN
    INSERT INTO public.agua_filtro_eventos (
      solicitacao_id, tipo, situacao_anterior, situacao_nova, comentario, foto_url, autor
    ) VALUES (
      NEW.id,
      CASE NEW.situacao
        WHEN 'programada' THEN 'programacao'
        WHEN 'aprovada' THEN 'programacao'
        WHEN 'em_deslocamento' THEN 'execucao'
        WHEN 'em_execucao' THEN 'execucao'
        WHEN 'em_atendimento' THEN 'execucao'
        WHEN 'concluida' THEN 'conclusao'
        WHEN 'validada' THEN 'conclusao'
        WHEN 'cancelada' THEN 'cancelamento'
        ELSE 'triagem'
      END,
      OLD.situacao,
      COALESCE(NEW.motivo_rejeicao, NEW.observacao_conclusao, NEW.motivo_cancelamento),
      COALESCE(NEW.foto_depois_url, NEW.foto_conclusao_url),
      auth.uid()
    );
  END IF;

  IF NEW.situacao = 'concluida' AND OLD.situacao <> 'concluida' AND NEW.ativo_id IS NOT NULL THEN
    UPDATE public.agua_filtro_ativos
       SET ultima_troca = COALESCE(NEW.concluida_em::date, CURRENT_DATE),
           condicao_atual = COALESCE(NEW.condicao_apos, condicao_atual)
     WHERE id = NEW.ativo_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- SLA: recalcula considerando os estados finais novos
CREATE OR REPLACE FUNCTION public.tg_agua_filtro_sla()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE v_horas integer;
BEGIN
  v_horas := CASE NEW.prioridade WHEN 'alta' THEN 24 WHEN 'media' THEN 72 ELSE 168 END;

  IF TG_OP = 'INSERT' OR NEW.prioridade IS DISTINCT FROM OLD.prioridade THEN
    NEW.sla_horas := v_horas;
    NEW.vence_em := COALESCE(NEW.criado_em, now()) + (v_horas || ' hours')::interval;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.atualizado_em := now();
    IF NEW.situacao = 'concluida' AND OLD.situacao <> 'concluida' THEN
      NEW.concluida_em := COALESCE(NEW.concluida_em, now());
    END IF;
    IF NEW.situacao = 'validada' AND OLD.situacao <> 'validada' THEN
      NEW.validada_em := COALESCE(NEW.validada_em, now());
    END IF;
    IF NEW.situacao = 'reaberta' AND OLD.situacao <> 'reaberta' THEN
      NEW.reaberturas := OLD.reaberturas + 1;
      NEW.concluida_em := NULL;
      NEW.vence_em := now() + (v_horas || ' hours')::interval;
      NEW.sla_horas := v_horas;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============ 12.6 Agenda preventiva ============
CREATE TABLE IF NOT EXISTS public.agua_filtro_preventivas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ativo_id uuid NOT NULL REFERENCES public.agua_filtro_ativos(id) ON DELETE CASCADE,
  prevista_para date NOT NULL,
  status text NOT NULL DEFAULT 'programada',
  justificativa text,
  reagendada_de date,
  solicitacao_id uuid REFERENCES public.agua_filtro_solicitacoes(id) ON DELETE SET NULL,
  concluida_em timestamptz,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agua_filtro_prev_status_chk
    CHECK (status IN ('programada','vencendo','vencido','concluido','cancelado'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agua_filtro_preventivas TO authenticated;
GRANT ALL ON public.agua_filtro_preventivas TO service_role;

ALTER TABLE public.agua_filtro_preventivas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "agua_filtro_prev_select" ON public.agua_filtro_preventivas
    FOR SELECT TO authenticated USING (public.agua_can('read'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "agua_filtro_prev_insert" ON public.agua_filtro_preventivas
    FOR INSERT TO authenticated WITH CHECK (public.agua_can('create'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "agua_filtro_prev_update" ON public.agua_filtro_preventivas
    FOR UPDATE TO authenticated USING (public.agua_can('update')) WITH CHECK (public.agua_can('update'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "agua_filtro_prev_delete" ON public.agua_filtro_preventivas
    FOR DELETE TO authenticated USING (public.agua_is_gestor());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS agua_filtro_prev_ativo_data_uidx
  ON public.agua_filtro_preventivas (ativo_id, prevista_para);

DROP TRIGGER IF EXISTS trg_agua_filtro_prev_updated ON public.agua_filtro_preventivas;
CREATE TRIGGER trg_agua_filtro_prev_updated
  BEFORE UPDATE ON public.agua_filtro_preventivas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();