-- Fix for field execution material requests.
-- Material requests must persist before the OS is finalized and remain idempotent.

ALTER TABLE public.corretiva_os
  ADD COLUMN IF NOT EXISTS material_status text,
  ADD COLUMN IF NOT EXISTS pecas_solicitadas text;

ALTER TABLE public.corretiva_pecas
  ADD COLUMN IF NOT EXISTS modelo text,
  ADD COLUMN IF NOT EXISTS material_status text,
  ADD COLUMN IF NOT EXISTS material_request_date timestamptz,
  ADD COLUMN IF NOT EXISTS client_uuid text,
  ADD COLUMN IF NOT EXISTS enviado_por uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.corretiva_pecas
SET material_request_date = COALESCE(material_request_date, created_at)
WHERE material_request_date IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS corretiva_pecas_client_uuid_uq
  ON public.corretiva_pecas (client_uuid)
  WHERE client_uuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS corretiva_pecas_os_created_at_idx
  ON public.corretiva_pecas (os_id, created_at DESC);

CREATE INDEX IF NOT EXISTS corretiva_pecas_material_status_idx
  ON public.corretiva_pecas (material_status);

GRANT SELECT, INSERT, UPDATE ON public.corretiva_pecas TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.corretiva_os TO authenticated;

COMMENT ON COLUMN public.corretiva_os.material_status IS
  'Estado da solicitação de material da OS. Solicitar material não finaliza a OS.';

COMMENT ON COLUMN public.corretiva_pecas.client_uuid IS
  'Identificador idempotente do item de peça originado no dispositivo/offline draft.';

COMMENT ON COLUMN public.corretiva_pecas.material_request_date IS
  'Data/hora em que a peça foi registrada como solicitação de material.';
