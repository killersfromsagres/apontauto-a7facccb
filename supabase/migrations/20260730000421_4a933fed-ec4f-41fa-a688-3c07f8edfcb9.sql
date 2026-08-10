-- ============================================================
-- ITEM 13 — Banco de dados do módulo Abastecimento de Água
-- Migração incremental sobre o schema agua_* existente
-- ============================================================

-- ---------- 13.1 pontos de entrega ----------
ALTER TABLE public.agua_pontos
  ADD COLUMN IF NOT EXISTS bag_tipo_id uuid REFERENCES public.agua_bag_tipos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contato_nome text,
  ADD COLUMN IF NOT EXISTS qr_token_hash text,
  ADD COLUMN IF NOT EXISTS arquivado_em timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS agua_pontos_local_norm_uidx
  ON public.agua_pontos (
    lower(btrim(coalesce(predio, ''))),
    lower(btrim(coalesce(andar, ''))),
    lower(btrim(coalesce(espaco, '')))
  ) WHERE arquivado_em IS NULL AND mesclado_para IS NULL;

CREATE INDEX IF NOT EXISTS agua_pontos_ativo_idx ON public.agua_pontos (ativo) WHERE arquivado_em IS NULL;
CREATE INDEX IF NOT EXISTS agua_pontos_bag_tipo_idx ON public.agua_pontos (bag_tipo_id);

-- ---------- 13.2 regras de programação ----------
ALTER TABLE public.agua_programacao
  ADD COLUMN IF NOT EXISTS janela_inicio time,
  ADD COLUMN IF NOT EXISTS janela_fim time,
  ADD COLUMN IF NOT EXISTS vigencia_inicio date,
  ADD COLUMN IF NOT EXISTS vigencia_fim date,
  ADD COLUMN IF NOT EXISTS criado_por uuid;

CREATE INDEX IF NOT EXISTS agua_programacao_vigencia_idx
  ON public.agua_programacao (vigencia_inicio, vigencia_fim) WHERE ativo;

-- ---------- 13.3 modelos de rota ----------
CREATE TABLE IF NOT EXISTS public.agua_rota_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL,
  nome text NOT NULL,
  equipe text,
  turno text NOT NULL DEFAULT 'manha',
  veiculo_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  versao integer NOT NULL DEFAULT 1,
  observacao text,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agua_rota_templates_chave_uidx
  ON public.agua_rota_templates (lower(btrim(chave)), coalesce(lower(btrim(equipe)), ''), turno);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agua_rota_templates TO authenticated;
GRANT ALL ON public.agua_rota_templates TO service_role;
ALTER TABLE public.agua_rota_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agua_rota_templates_select" ON public.agua_rota_templates
  FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_rota_templates_insert" ON public.agua_rota_templates
  FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_rota_templates_update" ON public.agua_rota_templates
  FOR UPDATE TO authenticated USING (public.agua_is_gestor()) WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_rota_templates_delete" ON public.agua_rota_templates
  FOR DELETE TO authenticated USING (public.agua_is_gestor());

CREATE TRIGGER agua_rota_templates_touch BEFORE UPDATE ON public.agua_rota_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- 13.4 paradas do modelo de rota ----------
CREATE TABLE IF NOT EXISTS public.agua_rota_template_paradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.agua_rota_templates(id) ON DELETE CASCADE,
  ponto_id uuid NOT NULL REFERENCES public.agua_pontos(id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
  ordem integer NOT NULL DEFAULT 0,
  bags_previstas numeric NOT NULL DEFAULT 0,
  tempo_estimado_min integer NOT NULL DEFAULT 10,
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, ponto_id, dia_semana)
);

CREATE INDEX IF NOT EXISTS agua_rota_template_paradas_dia_idx
  ON public.agua_rota_template_paradas (template_id, dia_semana, ordem);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agua_rota_template_paradas TO authenticated;
GRANT ALL ON public.agua_rota_template_paradas TO service_role;
ALTER TABLE public.agua_rota_template_paradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agua_rota_template_paradas_select" ON public.agua_rota_template_paradas
  FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_rota_template_paradas_insert" ON public.agua_rota_template_paradas
  FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_rota_template_paradas_update" ON public.agua_rota_template_paradas
  FOR UPDATE TO authenticated USING (public.agua_is_gestor()) WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_rota_template_paradas_delete" ON public.agua_rota_template_paradas
  FOR DELETE TO authenticated USING (public.agua_is_gestor());

CREATE TRIGGER agua_rota_template_paradas_touch BEFORE UPDATE ON public.agua_rota_template_paradas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- 13.5 rotas executadas ----------
ALTER TABLE public.agua_rotas
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.agua_rota_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_versao integer,
  ADD COLUMN IF NOT EXISTS geracao_job_id uuid REFERENCES public.agua_geracao_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS veiculo_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agua_rotas_template_idx ON public.agua_rotas (template_id, data);
CREATE INDEX IF NOT EXISTS agua_rotas_status_idx ON public.agua_rotas (status, data DESC);

-- ---------- 13.6 paradas executadas ----------
ALTER TABLE public.agua_visitas
  ADD COLUMN IF NOT EXISTS offline_idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS agua_visitas_offline_key_uidx
  ON public.agua_visitas (offline_idempotency_key)
  WHERE offline_idempotency_key IS NOT NULL;

-- ---------- 13.9 movimentações de bags ----------
ALTER TABLE public.agua_bag_movimentos
  ADD COLUMN IF NOT EXISTS veiculo_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;

-- ---------- 13.14 lotes de importação ----------
ALTER TABLE public.agua_import_lotes
  ADD COLUMN IF NOT EXISTS pontos_novos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pontos_atualizados integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS relatorio jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS rollback_permitido boolean NOT NULL DEFAULT true;

-- ---------- 13.15 eventos e auditoria ----------
CREATE TRIGGER agua_pontos_audit AFTER INSERT OR UPDATE OR DELETE ON public.agua_pontos
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_programacao_audit AFTER INSERT OR UPDATE OR DELETE ON public.agua_programacao
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_rotas_audit AFTER INSERT OR UPDATE OR DELETE ON public.agua_rotas
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_visitas_audit AFTER INSERT OR UPDATE OR DELETE ON public.agua_visitas
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_retificacoes_audit AFTER INSERT ON public.agua_retificacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_bag_movimentos_audit AFTER INSERT OR UPDATE OR DELETE ON public.agua_bag_movimentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_fotos_audit AFTER INSERT OR DELETE ON public.agua_fotos
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_whatsapp_envios_audit AFTER INSERT OR UPDATE ON public.agua_whatsapp_envios
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_import_lotes_audit AFTER INSERT OR UPDATE OR DELETE ON public.agua_import_lotes
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_filtro_ativos_audit AFTER INSERT OR UPDATE OR DELETE ON public.agua_filtro_ativos
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_filtro_solicitacoes_audit AFTER INSERT OR UPDATE OR DELETE ON public.agua_filtro_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');
CREATE TRIGGER agua_rota_templates_audit AFTER INSERT OR UPDATE OR DELETE ON public.agua_rota_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento-agua');