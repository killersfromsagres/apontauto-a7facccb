-- ============ Módulo Entrega de Água (Frota e Abastecimento) ============

CREATE OR REPLACE FUNCTION public.agua_can(required_action text DEFAULT 'read')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.frota_can(required_action)
      OR public.can_access_module('abastecimento-agua', required_action);
$$;

CREATE OR REPLACE FUNCTION public.agua_is_gestor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.frota_is_gestor()
      OR public.can_access_module('abastecimento-agua', 'update');
$$;

-- ---------- Lotes de importação ----------
CREATE TABLE IF NOT EXISTS public.agua_import_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo_nome text NOT NULL,
  arquivo_hash text NOT NULL,
  total_linhas integer NOT NULL DEFAULT 0,
  total_pontos integer NOT NULL DEFAULT 0,
  total_visitas integer NOT NULL DEFAULT 0,
  divergencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'aplicado',
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  desfeito_em timestamptz,
  desfeito_por uuid
);
CREATE INDEX IF NOT EXISTS agua_import_lotes_hash_idx ON public.agua_import_lotes(arquivo_hash);

GRANT SELECT, INSERT, UPDATE ON public.agua_import_lotes TO authenticated;
GRANT ALL ON public.agua_import_lotes TO service_role;
ALTER TABLE public.agua_import_lotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agua_lotes_select" ON public.agua_import_lotes FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_lotes_insert" ON public.agua_import_lotes FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_lotes_update" ON public.agua_import_lotes FOR UPDATE TO authenticated USING (public.agua_is_gestor()) WITH CHECK (public.agua_is_gestor());

-- ---------- Pontos ----------
CREATE TABLE IF NOT EXISTS public.agua_pontos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  predio text NOT NULL,
  andar text NOT NULL DEFAULT '',
  espaco text NOT NULL DEFAULT '',
  bags_padrao integer NOT NULL DEFAULT 1 CHECK (bags_padrao >= 0),
  janela_inicio time,
  janela_fim time,
  ordem integer NOT NULL DEFAULT 0,
  responsavel text,
  veiculo text,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  lote_id uuid REFERENCES public.agua_import_lotes(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agua_pontos_lote_idx ON public.agua_pontos(lote_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agua_pontos TO authenticated;
GRANT ALL ON public.agua_pontos TO service_role;
ALTER TABLE public.agua_pontos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agua_pontos_select" ON public.agua_pontos FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_pontos_insert" ON public.agua_pontos FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_pontos_update" ON public.agua_pontos FOR UPDATE TO authenticated USING (public.agua_is_gestor()) WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_pontos_delete" ON public.agua_pontos FOR DELETE TO authenticated USING (public.agua_is_gestor());

CREATE TRIGGER agua_pontos_touch BEFORE UPDATE ON public.agua_pontos
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- Programação semanal ----------
CREATE TABLE IF NOT EXISTS public.agua_programacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ponto_id uuid NOT NULL REFERENCES public.agua_pontos(id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
  ordem integer NOT NULL DEFAULT 0,
  bags integer NOT NULL DEFAULT 1 CHECK (bags >= 0),
  origem text NOT NULL DEFAULT 'aba_diaria',
  ativo boolean NOT NULL DEFAULT true,
  lote_id uuid REFERENCES public.agua_import_lotes(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ponto_id, dia_semana)
);
CREATE INDEX IF NOT EXISTS agua_programacao_dia_idx ON public.agua_programacao(dia_semana) WHERE ativo;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agua_programacao TO authenticated;
GRANT ALL ON public.agua_programacao TO service_role;
ALTER TABLE public.agua_programacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agua_prog_select" ON public.agua_programacao FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_prog_insert" ON public.agua_programacao FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_prog_update" ON public.agua_programacao FOR UPDATE TO authenticated USING (public.agua_is_gestor()) WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_prog_delete" ON public.agua_programacao FOR DELETE TO authenticated USING (public.agua_is_gestor());

CREATE TRIGGER agua_prog_touch BEFORE UPDATE ON public.agua_programacao
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- Visitas executadas ----------
CREATE TABLE IF NOT EXISTS public.agua_visitas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ponto_id uuid NOT NULL REFERENCES public.agua_pontos(id) ON DELETE CASCADE,
  data date NOT NULL,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','concluida','parcial','nao_realizada','cancelada')),
  motivo text,
  bags_previstas integer NOT NULL DEFAULT 1 CHECK (bags_previstas >= 0),
  bags_entregues integer CHECK (bags_entregues >= 0),
  foto_url text,
  observacao text,
  responsavel text,
  veiculo text,
  executado_por uuid,
  executado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ponto_id, data)
);
CREATE INDEX IF NOT EXISTS agua_visitas_data_idx ON public.agua_visitas(data DESC);
CREATE INDEX IF NOT EXISTS agua_visitas_status_idx ON public.agua_visitas(status);

GRANT SELECT, INSERT, UPDATE ON public.agua_visitas TO authenticated;
GRANT ALL ON public.agua_visitas TO service_role;
ALTER TABLE public.agua_visitas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agua_visitas_select" ON public.agua_visitas FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_visitas_insert" ON public.agua_visitas FOR INSERT TO authenticated WITH CHECK (public.agua_can('create') OR public.agua_can('update') OR public.agua_is_gestor());
CREATE POLICY "agua_visitas_update" ON public.agua_visitas FOR UPDATE TO authenticated USING (public.agua_can('update') OR public.agua_is_gestor()) WITH CHECK (public.agua_can('update') OR public.agua_is_gestor());

CREATE TRIGGER agua_visitas_touch BEFORE UPDATE ON public.agua_visitas
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- Eventos (auditoria imutável) ----------
CREATE TABLE IF NOT EXISTS public.agua_visita_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visita_id uuid NOT NULL REFERENCES public.agua_visitas(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  usuario_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agua_visita_eventos_visita_idx ON public.agua_visita_eventos(visita_id, criado_em DESC);

GRANT SELECT, INSERT ON public.agua_visita_eventos TO authenticated;
GRANT ALL ON public.agua_visita_eventos TO service_role;
ALTER TABLE public.agua_visita_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agua_eventos_select" ON public.agua_visita_eventos FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_eventos_insert" ON public.agua_visita_eventos FOR INSERT TO authenticated WITH CHECK (public.agua_can('read'));

-- ---------- Permissão do módulo no catálogo PCM ----------
INSERT INTO public.pcm_permissions (key, module_key, action, label)
SELECT 'abastecimento-agua:' || a, 'abastecimento-agua', a,
       'Entrega de Água — ' || a
FROM unnest(ARRAY['read','create','update','delete']) AS a
ON CONFLICT (key) DO NOTHING;