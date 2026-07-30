
-- ABASTECIMENTOS (controle financeiro)
CREATE TABLE public.fleet_fuelings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  fueled_at timestamptz NOT NULL DEFAULT now(),
  driver_name text,
  station text,
  fuel_type text NOT NULL DEFAULT 'gasolina',
  liters numeric(10,3) NOT NULL CHECK (liters > 0),
  total_cost numeric(12,2) NOT NULL CHECK (total_cost >= 0),
  odometer_km integer NOT NULL CHECK (odometer_km >= 0),
  invoice_number text,
  payment_method text,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_fuelings TO authenticated;
GRANT ALL ON public.fleet_fuelings TO service_role;
ALTER TABLE public.fleet_fuelings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fuelings_select" ON public.fleet_fuelings FOR SELECT TO authenticated USING (true);
CREATE POLICY "fuelings_insert" ON public.fleet_fuelings FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "fuelings_update" ON public.fleet_fuelings FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "fuelings_delete" ON public.fleet_fuelings FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX fleet_fuelings_vehicle_idx ON public.fleet_fuelings (vehicle_id, fueled_at DESC);

-- CHECKLISTS VEICULARES
CREATE TABLE public.fleet_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'saida',
  driver_name text NOT NULL,
  odometer_km integer NOT NULL CHECK (odometer_km >= 0),
  fuel_level_pct integer CHECK (fuel_level_pct BETWEEN 0 AND 100),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  overall_status text NOT NULL DEFAULT 'ok',
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_checklists TO authenticated;
GRANT ALL ON public.fleet_checklists TO service_role;
ALTER TABLE public.fleet_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklists_select" ON public.fleet_checklists FOR SELECT TO authenticated USING (true);
CREATE POLICY "checklists_insert" ON public.fleet_checklists FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "checklists_update" ON public.fleet_checklists FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "checklists_delete" ON public.fleet_checklists FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX fleet_checklists_vehicle_idx ON public.fleet_checklists (vehicle_id, created_at DESC);

-- FOTOS DO CHECKLIST
CREATE TABLE public.fleet_checklist_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.fleet_checklists(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'geral',
  storage_path text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_checklist_photos TO authenticated;
GRANT ALL ON public.fleet_checklist_photos TO service_role;
ALTER TABLE public.fleet_checklist_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_photos_select" ON public.fleet_checklist_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "checklist_photos_insert" ON public.fleet_checklist_photos FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "checklist_photos_delete" ON public.fleet_checklist_photos FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX fleet_checklist_photos_checklist_idx ON public.fleet_checklist_photos (checklist_id);

CREATE TRIGGER fleet_fuelings_updated_at BEFORE UPDATE ON public.fleet_fuelings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER fleet_checklists_updated_at BEFORE UPDATE ON public.fleet_checklists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- STORAGE: bucket privado frota-fotos
CREATE POLICY "frota_fotos_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'frota-fotos');
CREATE POLICY "frota_fotos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'frota-fotos' AND owner = auth.uid());
CREATE POLICY "frota_fotos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'frota-fotos' AND owner = auth.uid());
