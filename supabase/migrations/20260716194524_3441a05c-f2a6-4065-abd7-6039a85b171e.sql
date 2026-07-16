
-- Programação de Taludes tables
CREATE TYPE public.talude_tipo_servico AS ENUM ('rocada','contencao','drenagem','inspecao','plantio','outro');
CREATE TYPE public.talude_situacao AS ENUM ('programado','realizado','adiado_chuva','cancelado');

CREATE TABLE public.taludes_programacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  os_atividade text NOT NULL,
  talude text NOT NULL,
  tipo_servico public.talude_tipo_servico NOT NULL DEFAULT 'inspecao',
  data_programada date NOT NULL,
  equipe text NOT NULL DEFAULT '',
  situacao public.talude_situacao NOT NULL DEFAULT 'programado',
  observacoes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taludes_programacao TO authenticated;
GRANT ALL ON public.taludes_programacao TO service_role;
ALTER TABLE public.taludes_programacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read taludes_programacao" ON public.taludes_programacao FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert taludes_programacao" ON public.taludes_programacao FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "auth update taludes_programacao" ON public.taludes_programacao FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete taludes_programacao" ON public.taludes_programacao FOR DELETE TO authenticated USING (true);
CREATE TRIGGER trg_taludes_programacao_updated BEFORE UPDATE ON public.taludes_programacao FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.taludes_clima_snapshot (
  data date PRIMARY KEY,
  temp_max numeric,
  temp_min numeric,
  precipitacao_mm_prev numeric,
  precipitacao_mm_real numeric,
  prob_chuva_prev numeric,
  condicao text,
  choveu boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.taludes_clima_snapshot TO authenticated;
GRANT ALL ON public.taludes_clima_snapshot TO service_role;
ALTER TABLE public.taludes_clima_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read clima snapshot" ON public.taludes_clima_snapshot FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth upsert clima snapshot" ON public.taludes_clima_snapshot FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update clima snapshot" ON public.taludes_clima_snapshot FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.taludes_clima_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  latitude numeric NOT NULL DEFAULT -23.6939,
  longitude numeric NOT NULL DEFAULT -46.5650,
  limite_prob_chuva numeric NOT NULL DEFAULT 60,
  limite_mm_chuva numeric NOT NULL DEFAULT 1.0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.taludes_clima_config TO authenticated;
GRANT ALL ON public.taludes_clima_config TO service_role;
ALTER TABLE public.taludes_clima_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read clima config" ON public.taludes_clima_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write clima config" ON public.taludes_clima_config FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.taludes_clima_config (id) VALUES (true) ON CONFLICT DO NOTHING;
CREATE TRIGGER trg_taludes_clima_config_updated BEFORE UPDATE ON public.taludes_clima_config FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
