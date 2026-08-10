-- =========================================================
-- FASE 8 — FROTA, CHECKLIST E ABASTECIMENTO
-- =========================================================

CREATE OR REPLACE FUNCTION public.frota_can(required_action text DEFAULT 'read')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_access_module('abastecimento', required_action)
      OR public.can_access_module('frota-checklist', required_action)
      OR public.can_access_module('frota-historico', required_action)
      OR public.can_access_module('frota-gestao', required_action);
$$;

CREATE OR REPLACE FUNCTION public.frota_is_gestor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.can_access_module('frota-gestao', 'read');
$$;

-- ---------- VEÍCULOS ----------
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefix text NOT NULL UNIQUE,
  plate text UNIQUE,
  brand text NOT NULL,
  model text NOT NULL,
  version text,
  year_model integer,
  year_manufacture integer,
  color text,
  renavam text,
  chassis_last6 text,
  fuel_type text NOT NULL DEFAULT 'flex',
  current_odometer_km numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'disponivel',
  block_reason text,
  thumbnail_url text,
  model_glb_url text,
  model_poster_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicles_status_chk CHECK (status IN ('disponivel','em_uso','bloqueado','manutencao','inativo'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicles_read" ON public.vehicles FOR SELECT TO authenticated USING (public.frota_can('read'));
CREATE POLICY "vehicles_insert" ON public.vehicles FOR INSERT TO authenticated WITH CHECK (public.frota_is_gestor());
CREATE POLICY "vehicles_update" ON public.vehicles FOR UPDATE TO authenticated USING (public.frota_can('update')) WITH CHECK (public.frota_can('update'));
CREATE POLICY "vehicles_delete" ON public.vehicles FOR DELETE TO authenticated USING (public.frota_is_gestor());
CREATE TRIGGER vehicles_updated_at BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER vehicles_audit AFTER INSERT OR UPDATE OR DELETE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('frota-gestao');

INSERT INTO public.vehicles (prefix, brand, model, version, year_model, year_manufacture, fuel_type, status)
VALUES
  ('FRT-01', 'Fiat', 'Fiorino', 'Endurance', 2025, 2025, 'flex', 'disponivel'),
  ('FRT-02', 'Fiat', 'Fiorino', 'Endurance', 2025, 2025, 'flex', 'disponivel'),
  ('FRT-03', 'Volkswagen', 'Saveiro', 'Robust', 2021, 2021, 'flex', 'disponivel');

-- ---------- CHECKLISTS ----------
CREATE TABLE public.vehicle_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol text NOT NULL UNIQUE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  checklist_type text NOT NULL DEFAULT 'pre_uso',
  odometer_km numeric NOT NULL,
  fuel_level_pct integer,
  location text,
  purpose text,
  work_order_number text,
  overall_status text NOT NULL DEFAULT 'conforme',
  integrity_score integer NOT NULL DEFAULT 100,
  critical_block boolean NOT NULL DEFAULT false,
  declaration_accepted boolean NOT NULL DEFAULT false,
  signature_url text,
  notes text,
  integrity_hash text,
  submitted_by uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  synced_from_offline boolean NOT NULL DEFAULT false,
  device_id_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vc_type_chk CHECK (checklist_type IN ('pre_uso','pos_uso','periodico','devolucao')),
  CONSTRAINT vc_status_chk CHECK (overall_status IN ('conforme','com_ressalvas','nao_conforme'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_checklists TO authenticated;
GRANT ALL ON public.vehicle_checklists TO service_role;
ALTER TABLE public.vehicle_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vc_read" ON public.vehicle_checklists FOR SELECT TO authenticated USING (public.frota_can('read'));
CREATE POLICY "vc_insert" ON public.vehicle_checklists FOR INSERT TO authenticated
  WITH CHECK (public.frota_can('create') AND submitted_by = auth.uid());
CREATE POLICY "vc_update" ON public.vehicle_checklists FOR UPDATE TO authenticated
  USING (public.frota_is_gestor()) WITH CHECK (public.frota_is_gestor());
CREATE POLICY "vc_delete" ON public.vehicle_checklists FOR DELETE TO authenticated USING (public.frota_is_gestor());
CREATE INDEX vc_vehicle_idx ON public.vehicle_checklists (vehicle_id, submitted_at DESC);
CREATE TRIGGER vc_audit AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_checklists
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('frota-checklist');

-- ---------- COLABORADORES DO CHECKLIST ----------
CREATE TABLE public.vehicle_checklist_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.vehicle_checklists(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.sst_colaboradores(id) ON DELETE SET NULL,
  role_in_checklist text NOT NULL DEFAULT 'principal',
  full_name_snapshot text NOT NULL,
  cpf_last4 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vcc_role_chk CHECK (role_in_checklist IN ('principal','acompanhante'))
);
GRANT SELECT, INSERT, DELETE ON public.vehicle_checklist_collaborators TO authenticated;
GRANT ALL ON public.vehicle_checklist_collaborators TO service_role;
ALTER TABLE public.vehicle_checklist_collaborators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vcc_read" ON public.vehicle_checklist_collaborators FOR SELECT TO authenticated USING (public.frota_can('read'));
CREATE POLICY "vcc_insert" ON public.vehicle_checklist_collaborators FOR INSERT TO authenticated WITH CHECK (public.frota_can('create'));
CREATE POLICY "vcc_delete" ON public.vehicle_checklist_collaborators FOR DELETE TO authenticated USING (public.frota_is_gestor());

-- CPF completo isolado: só gestores de frota/admin conseguem ler.
CREATE TABLE public.vehicle_checklist_collaborator_pii (
  collaborator_id uuid PRIMARY KEY REFERENCES public.vehicle_checklist_collaborators(id) ON DELETE CASCADE,
  cpf_normalized text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.vehicle_checklist_collaborator_pii TO authenticated;
GRANT ALL ON public.vehicle_checklist_collaborator_pii TO service_role;
ALTER TABLE public.vehicle_checklist_collaborator_pii ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vccp_read" ON public.vehicle_checklist_collaborator_pii FOR SELECT TO authenticated USING (public.frota_is_gestor());
CREATE POLICY "vccp_insert" ON public.vehicle_checklist_collaborator_pii FOR INSERT TO authenticated WITH CHECK (public.frota_can('create'));

-- ---------- ITENS ----------
CREATE TABLE public.vehicle_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.vehicle_checklists(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  category text NOT NULL,
  label text NOT NULL,
  status text NOT NULL,
  severity text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vci_status_chk CHECK (status IN ('conforme','nao_conforme','nao_se_aplica')),
  CONSTRAINT vci_sev_chk CHECK (severity IS NULL OR severity IN ('baixa','media','alta','critica'))
);
GRANT SELECT, INSERT, DELETE ON public.vehicle_checklist_items TO authenticated;
GRANT ALL ON public.vehicle_checklist_items TO service_role;
ALTER TABLE public.vehicle_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vci_read" ON public.vehicle_checklist_items FOR SELECT TO authenticated USING (public.frota_can('read'));
CREATE POLICY "vci_insert" ON public.vehicle_checklist_items FOR INSERT TO authenticated WITH CHECK (public.frota_can('create'));
CREATE POLICY "vci_delete" ON public.vehicle_checklist_items FOR DELETE TO authenticated USING (public.frota_is_gestor());
CREATE INDEX vci_checklist_idx ON public.vehicle_checklist_items (checklist_id);

-- ---------- FOTOS ----------
CREATE TABLE public.vehicle_checklist_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.vehicle_checklists(id) ON DELETE CASCADE,
  checklist_item_id uuid REFERENCES public.vehicle_checklist_items(id) ON DELETE SET NULL,
  photo_slot text NOT NULL,
  url text NOT NULL,
  thumbnail_url text,
  image_hash text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid,
  removed_at timestamptz,
  removed_by uuid,
  removal_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.vehicle_checklist_photos TO authenticated;
GRANT ALL ON public.vehicle_checklist_photos TO service_role;
ALTER TABLE public.vehicle_checklist_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vcp_read" ON public.vehicle_checklist_photos FOR SELECT TO authenticated USING (public.frota_can('read'));
CREATE POLICY "vcp_insert" ON public.vehicle_checklist_photos FOR INSERT TO authenticated
  WITH CHECK (public.frota_can('create') AND uploaded_by = auth.uid());
-- Exclusão lógica com motivo: apenas gestor/admin.
CREATE POLICY "vcp_soft_delete" ON public.vehicle_checklist_photos FOR UPDATE TO authenticated
  USING (public.frota_is_gestor()) WITH CHECK (public.frota_is_gestor());
CREATE INDEX vcp_checklist_idx ON public.vehicle_checklist_photos (checklist_id);
CREATE TRIGGER vcp_audit AFTER UPDATE ON public.vehicle_checklist_photos
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('frota-checklist');

-- ---------- ABASTECIMENTOS ----------
CREATE TABLE public.vehicle_fuelings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  fueled_at timestamptz NOT NULL DEFAULT now(),
  driver_name text,
  odometer_km numeric NOT NULL,
  fuel_type text NOT NULL DEFAULT 'gasolina',
  liters numeric NOT NULL CHECK (liters > 0),
  price_per_liter numeric,
  total_value numeric,
  station text,
  receipt_number text,
  odometer_photo_url text,
  receipt_photo_url text,
  full_tank boolean NOT NULL DEFAULT true,
  notes text,
  anomalies jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_fuelings TO authenticated;
GRANT ALL ON public.vehicle_fuelings TO service_role;
ALTER TABLE public.vehicle_fuelings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vf_read" ON public.vehicle_fuelings FOR SELECT TO authenticated USING (public.frota_can('read'));
CREATE POLICY "vf_insert" ON public.vehicle_fuelings FOR INSERT TO authenticated
  WITH CHECK (public.frota_can('create') AND created_by = auth.uid());
CREATE POLICY "vf_update" ON public.vehicle_fuelings FOR UPDATE TO authenticated
  USING (public.frota_is_gestor()) WITH CHECK (public.frota_is_gestor());
CREATE POLICY "vf_delete" ON public.vehicle_fuelings FOR DELETE TO authenticated USING (public.frota_is_gestor());
CREATE INDEX vf_vehicle_idx ON public.vehicle_fuelings (vehicle_id, fueled_at DESC);
CREATE TRIGGER vf_updated_at BEFORE UPDATE ON public.vehicle_fuelings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER vf_audit AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_fuelings
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('abastecimento');

-- ---------- OCORRÊNCIAS ----------
CREATE TABLE public.vehicle_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  checklist_id uuid REFERENCES public.vehicle_checklists(id) ON DELETE SET NULL,
  occurrence_type text NOT NULL DEFAULT 'nao_conformidade',
  severity text NOT NULL DEFAULT 'media',
  description text NOT NULL,
  state text NOT NULL DEFAULT 'aberta',
  assignee text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution_notes text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vo_state_chk CHECK (state IN ('aberta','em_analise','resolvida','cancelada')),
  CONSTRAINT vo_sev_chk CHECK (severity IN ('baixa','media','alta','critica'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_occurrences TO authenticated;
GRANT ALL ON public.vehicle_occurrences TO service_role;
ALTER TABLE public.vehicle_occurrences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vo_read" ON public.vehicle_occurrences FOR SELECT TO authenticated USING (public.frota_can('read'));
CREATE POLICY "vo_insert" ON public.vehicle_occurrences FOR INSERT TO authenticated WITH CHECK (public.frota_can('create'));
CREATE POLICY "vo_update" ON public.vehicle_occurrences FOR UPDATE TO authenticated
  USING (public.frota_is_gestor()) WITH CHECK (public.frota_is_gestor());
CREATE POLICY "vo_delete" ON public.vehicle_occurrences FOR DELETE TO authenticated USING (public.frota_is_gestor());
CREATE INDEX vo_vehicle_idx ON public.vehicle_occurrences (vehicle_id, opened_at DESC);
CREATE TRIGGER vo_updated_at BEFORE UPDATE ON public.vehicle_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER vo_audit AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('frota-gestao');

-- Bloqueio automático do veículo em não conformidade crítica.
CREATE OR REPLACE FUNCTION public.tg_vehicle_checklist_block()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.vehicles
     SET current_odometer_km = GREATEST(current_odometer_km, NEW.odometer_km),
         status = CASE WHEN NEW.critical_block THEN 'bloqueado' ELSE status END,
         block_reason = CASE WHEN NEW.critical_block
           THEN 'Aguardando avaliação — checklist ' || NEW.protocol ELSE block_reason END
   WHERE id = NEW.vehicle_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER vc_block_vehicle AFTER INSERT ON public.vehicle_checklists
  FOR EACH ROW EXECUTE FUNCTION public.tg_vehicle_checklist_block();