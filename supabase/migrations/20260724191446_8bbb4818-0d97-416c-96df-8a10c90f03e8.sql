-- Drop legacy tables
DROP TABLE IF EXISTS public.taludes_chuva_evidencias CASCADE;
DROP TABLE IF EXISTS public.taludes_clima_snapshot CASCADE;
DROP TABLE IF EXISTS public.taludes_clima_config CASCADE;
DROP TABLE IF EXISTS public.taludes_programacao CASCADE;
DROP TABLE IF EXISTS public.taludes CASCADE;
DROP TABLE IF EXISTS public.talude_maps CASCADE;
DROP TYPE IF EXISTS public.talude_tipo_servico CASCADE;
DROP TYPE IF EXISTS public.talude_situacao CASCADE;

-- New: talude_maps
CREATE TABLE public.talude_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  observacao text,
  image_url text NOT NULL,
  image_width integer NOT NULL,
  image_height integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_maps TO authenticated;
GRANT ALL ON public.talude_maps TO service_role;
ALTER TABLE public.talude_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner select maps" ON public.talude_maps FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "owner insert maps" ON public.talude_maps FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner update maps" ON public.talude_maps FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner delete maps" ON public.talude_maps FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE TRIGGER trg_talude_maps_updated_at BEFORE UPDATE ON public.talude_maps
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_talude_maps_owner ON public.talude_maps(owner_id, created_at DESC);

-- New: talude_marcacoes
CREATE TABLE public.talude_marcacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES public.talude_maps(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numero integer NOT NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  rotulo text,
  observacao text,
  cor text NOT NULL DEFAULT '#f59e0b',
  polygon jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_marcacoes TO authenticated;
GRANT ALL ON public.talude_marcacoes TO service_role;
ALTER TABLE public.talude_marcacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner select marc" ON public.talude_marcacoes FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "owner insert marc" ON public.talude_marcacoes FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner update marc" ON public.talude_marcacoes FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner delete marc" ON public.talude_marcacoes FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE TRIGGER trg_talude_marc_updated_at BEFORE UPDATE ON public.talude_marcacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_talude_marc_map ON public.talude_marcacoes(map_id, numero);