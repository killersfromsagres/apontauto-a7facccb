
-- Limpa módulo antigo (mapas + programação + evidências clima)
DROP TABLE IF EXISTS public.taludes CASCADE;
DROP TABLE IF EXISTS public.taludes_programacao CASCADE;
DROP TABLE IF EXISTS public.taludes_chuva_evidencias CASCADE;
DROP TABLE IF EXISTS public.taludes_clima_snapshot CASCADE;
DROP TABLE IF EXISTS public.taludes_clima_config CASCADE;
DROP TABLE IF EXISTS public.talude_marcacoes CASCADE;
DROP TABLE IF EXISTS public.talude_maps CASCADE;
DROP TYPE IF EXISTS public.talude_tipo_servico CASCADE;
DROP TYPE IF EXISTS public.talude_situacao CASCADE;

-- Mapas
CREATE TABLE public.talude_maps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  observacao TEXT,
  image_url TEXT NOT NULL,
  image_width INTEGER NOT NULL,
  image_height INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_maps TO authenticated;
GRANT ALL ON public.talude_maps TO service_role;
ALTER TABLE public.talude_maps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own maps: select" ON public.talude_maps FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Own maps: insert" ON public.talude_maps FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Own maps: update" ON public.talude_maps FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Own maps: delete" ON public.talude_maps FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE TRIGGER talude_maps_touch BEFORE UPDATE ON public.talude_maps FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Marcações
CREATE TABLE public.talude_marcacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id UUID NOT NULL REFERENCES public.talude_maps(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  data DATE NOT NULL DEFAULT (now()::date),
  rotulo TEXT,
  observacao TEXT,
  cor TEXT NOT NULL DEFAULT '#f59e0b',
  polygon JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (map_id, numero)
);
CREATE INDEX talude_marcacoes_map_idx ON public.talude_marcacoes(map_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_marcacoes TO authenticated;
GRANT ALL ON public.talude_marcacoes TO service_role;
ALTER TABLE public.talude_marcacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own marc: select" ON public.talude_marcacoes FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Own marc: insert" ON public.talude_marcacoes FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Own marc: update" ON public.talude_marcacoes FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Own marc: delete" ON public.talude_marcacoes FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE TRIGGER talude_marcacoes_touch BEFORE UPDATE ON public.talude_marcacoes FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
