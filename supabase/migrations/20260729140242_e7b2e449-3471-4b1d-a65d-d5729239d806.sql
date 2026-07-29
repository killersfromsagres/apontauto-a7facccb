-- Colunas de calibração no mapa
ALTER TABLE public.talude_maps
  ADD COLUMN IF NOT EXISTS calibration jsonb,
  ADD COLUMN IF NOT EXISTS meters_per_unit numeric,
  ADD COLUMN IF NOT EXISTS calibrated_at timestamptz,
  ADD COLUMN IF NOT EXISTS calibrated_by uuid;

-- Dados profissionais do polígono
ALTER TABLE public.talude_marcacoes
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS nome text,
  ADD COLUMN IF NOT EXISTS setor text,
  ADD COLUMN IF NOT EXISTS risco text,
  ADD COLUMN IF NOT EXISTS inclinacao numeric,
  ADD COLUMN IF NOT EXISTS tipo_solo text,
  ADD COLUMN IF NOT EXISTS vegetacao text,
  ADD COLUMN IF NOT EXISTS servico_atual text,
  ADD COLUMN IF NOT EXISTS equipe text,
  ADD COLUMN IF NOT EXISTS data_prevista date,
  ADD COLUMN IF NOT EXISTS data_executada date,
  ADD COLUMN IF NOT EXISTS estado_operacional text,
  ADD COLUMN IF NOT EXISTS ultima_inspecao date,
  ADD COLUMN IF NOT EXISTS proxima_inspecao date,
  ADD COLUMN IF NOT EXISTS opacidade numeric NOT NULL DEFAULT 0.32,
  ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bloqueado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visivel boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rascunho boolean NOT NULL DEFAULT false;

-- Versões do mapa
CREATE TABLE IF NOT EXISTS public.talude_map_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES public.talude_maps(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  snapshot jsonb NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (map_id, version_number)
);

GRANT SELECT, INSERT ON public.talude_map_versions TO authenticated;
GRANT ALL ON public.talude_map_versions TO service_role;
ALTER TABLE public.talude_map_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "talude_versions_select" ON public.talude_map_versions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.talude_maps m WHERE m.id = map_id AND m.owner_id = auth.uid())
  );

CREATE POLICY "talude_versions_insert" ON public.talude_map_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (SELECT 1 FROM public.talude_maps m WHERE m.id = map_id AND m.owner_id = auth.uid())
    )
  );

-- Eventos de geometria
CREATE TABLE IF NOT EXISTS public.talude_geometry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES public.talude_maps(id) ON DELETE CASCADE,
  marcacao_id uuid,
  action text NOT NULL,
  old_polygon jsonb,
  new_polygon jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS talude_geometry_events_map_idx
  ON public.talude_geometry_events(map_id, created_at DESC);

GRANT SELECT, INSERT ON public.talude_geometry_events TO authenticated;
GRANT ALL ON public.talude_geometry_events TO service_role;
ALTER TABLE public.talude_geometry_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "talude_geo_events_select" ON public.talude_geometry_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.talude_maps m WHERE m.id = map_id AND m.owner_id = auth.uid())
  );

CREATE POLICY "talude_geo_events_insert" ON public.talude_geometry_events
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (SELECT 1 FROM public.talude_maps m WHERE m.id = map_id AND m.owner_id = auth.uid())
    )
  );