ALTER TABLE public.taludes
  ADD COLUMN IF NOT EXISTS area_m2 numeric,
  ADD COLUMN IF NOT EXISTS perimetro_m numeric;

ALTER TABLE public.talude_maps
  ADD COLUMN IF NOT EXISTS escala_m_por_px numeric;