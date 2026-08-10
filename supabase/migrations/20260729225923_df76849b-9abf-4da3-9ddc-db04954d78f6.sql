ALTER TABLE public.agua_visitas
  ADD COLUMN IF NOT EXISTS bags_recolhidas integer,
  ADD COLUMN IF NOT EXISTS estoque_antes integer,
  ADD COLUMN IF NOT EXISTS estoque_depois integer,
  ADD COLUMN IF NOT EXISTS condicao text,
  ADD COLUMN IF NOT EXISTS recebido_por text,
  ADD COLUMN IF NOT EXISTS fotos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS assinatura_url text,
  ADD COLUMN IF NOT EXISTS local_confirmado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS deslocamento_em timestamptz,
  ADD COLUMN IF NOT EXISTS atendimento_em timestamptz;

ALTER TABLE public.agua_visitas DROP CONSTRAINT IF EXISTS agua_visitas_status_check;
ALTER TABLE public.agua_visitas ADD CONSTRAINT agua_visitas_status_check CHECK (status = ANY (ARRAY[
  'pendente','em_deslocamento','em_atendimento','concluida','parcial','nao_realizada',
  'sem_necessidade','acesso_bloqueado','local_fechado','falta_bags','endereco_divergente',
  'reprogramada','cancelada']));

ALTER TABLE public.agua_visitas DROP CONSTRAINT IF EXISTS agua_visitas_bags_recolhidas_check;
ALTER TABLE public.agua_visitas ADD CONSTRAINT agua_visitas_bags_recolhidas_check CHECK (bags_recolhidas IS NULL OR bags_recolhidas >= 0);

CREATE TABLE IF NOT EXISTS public.agua_retificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visita_id uuid NOT NULL REFERENCES public.agua_visitas(id) ON DELETE CASCADE,
  campo text NOT NULL,
  valor_anterior jsonb,
  valor_novo jsonb,
  motivo text NOT NULL,
  usuario_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agua_retificacoes_visita_idx ON public.agua_retificacoes (visita_id, criado_em DESC);
GRANT SELECT, INSERT ON public.agua_retificacoes TO authenticated;
GRANT ALL ON public.agua_retificacoes TO service_role;
ALTER TABLE public.agua_retificacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agua_retificacoes_select ON public.agua_retificacoes;
CREATE POLICY agua_retificacoes_select ON public.agua_retificacoes FOR SELECT TO authenticated USING (public.agua_can('read'));
DROP POLICY IF EXISTS agua_retificacoes_insert ON public.agua_retificacoes;
CREATE POLICY agua_retificacoes_insert ON public.agua_retificacoes FOR INSERT TO authenticated WITH CHECK (public.agua_can('update') OR public.agua_is_gestor());

ALTER TABLE public.agua_rotas
  ADD COLUMN IF NOT EXISTS hodometro_inicial integer,
  ADD COLUMN IF NOT EXISTS hodometro_final integer,
  ADD COLUMN IF NOT EXISTS foto_carga_url text,
  ADD COLUMN IF NOT EXISTS foto_carga_final_url text,
  ADD COLUMN IF NOT EXISTS checklist_confirmado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS saida_real timestamptz,
  ADD COLUMN IF NOT EXISTS observacao_inicial text,
  ADD COLUMN IF NOT EXISTS observacao_final text,
  ADD COLUMN IF NOT EXISTS bags_restantes integer,
  ADD COLUMN IF NOT EXISTS bags_recolhidas integer,
  ADD COLUMN IF NOT EXISTS bags_danificadas integer,
  ADD COLUMN IF NOT EXISTS bags_ajustes integer,
  ADD COLUMN IF NOT EXISTS divergencia_bags integer,
  ADD COLUMN IF NOT EXISTS divergencia_justificativa text,
  ADD COLUMN IF NOT EXISTS confirmado_principal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmado_secundario boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.agua_rota_ocorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL REFERENCES public.agua_rotas(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'divergencia_bags',
  descricao text,
  divergencia integer,
  situacao text NOT NULL DEFAULT 'aberta',
  tratativa text,
  usuario_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agua_rota_ocorrencias_situacao_check CHECK (situacao = ANY (ARRAY['aberta','em_tratativa','resolvida']))
);
CREATE INDEX IF NOT EXISTS agua_rota_ocorrencias_rota_idx ON public.agua_rota_ocorrencias (rota_id, criado_em DESC);
GRANT SELECT, INSERT, UPDATE ON public.agua_rota_ocorrencias TO authenticated;
GRANT ALL ON public.agua_rota_ocorrencias TO service_role;
ALTER TABLE public.agua_rota_ocorrencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agua_rota_ocorrencias_select ON public.agua_rota_ocorrencias;
CREATE POLICY agua_rota_ocorrencias_select ON public.agua_rota_ocorrencias FOR SELECT TO authenticated USING (public.agua_can('read'));
DROP POLICY IF EXISTS agua_rota_ocorrencias_insert ON public.agua_rota_ocorrencias;
CREATE POLICY agua_rota_ocorrencias_insert ON public.agua_rota_ocorrencias FOR INSERT TO authenticated WITH CHECK (public.agua_can('update') OR public.agua_is_gestor());
DROP POLICY IF EXISTS agua_rota_ocorrencias_update ON public.agua_rota_ocorrencias;
CREATE POLICY agua_rota_ocorrencias_update ON public.agua_rota_ocorrencias FOR UPDATE TO authenticated USING (public.agua_is_gestor()) WITH CHECK (public.agua_is_gestor());

DROP TRIGGER IF EXISTS agua_rota_ocorrencias_touch ON public.agua_rota_ocorrencias;
CREATE TRIGGER agua_rota_ocorrencias_touch BEFORE UPDATE ON public.agua_rota_ocorrencias
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();