
-- ============ talude_maps ============
CREATE TABLE public.talude_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  image_path TEXT NOT NULL,
  image_width INTEGER,
  image_height INTEGER,
  periodicidade_dias INTEGER NOT NULL DEFAULT 180,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.talude_maps TO authenticated;
GRANT ALL ON public.talude_maps TO service_role;

ALTER TABLE public.talude_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own or admin select maps" ON public.talude_maps
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "own or admin insert maps" ON public.talude_maps
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "own or admin update maps" ON public.talude_maps
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "own or admin delete maps" ON public.talude_maps
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_talude_maps_updated
BEFORE UPDATE ON public.talude_maps
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ taludes ============
CREATE TABLE public.taludes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id UUID NOT NULL REFERENCES public.talude_maps(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  nome TEXT,
  status TEXT NOT NULL DEFAULT 'programado' CHECK (status IN ('programado','em_execucao','finalizado')),
  polygon JSONB NOT NULL DEFAULT '[]'::jsonb,
  data_programada DATE,
  data_execucao DATE,
  data_conclusao DATE,
  proxima_data DATE,
  periodicidade_dias INTEGER,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX taludes_map_id_idx ON public.taludes(map_id);
CREATE UNIQUE INDEX taludes_map_numero_uk ON public.taludes(map_id, numero);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.taludes TO authenticated;
GRANT ALL ON public.taludes TO service_role;

ALTER TABLE public.taludes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own or admin select taludes" ON public.taludes
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "own or admin insert taludes" ON public.taludes
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "own or admin update taludes" ON public.taludes
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "own or admin delete taludes" ON public.taludes
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_taludes_updated
BEFORE UPDATE ON public.taludes
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
