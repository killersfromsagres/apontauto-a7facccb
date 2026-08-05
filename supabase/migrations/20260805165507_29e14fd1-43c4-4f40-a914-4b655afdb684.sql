ALTER TABLE public.backorder_os ADD COLUMN IF NOT EXISTS data_abertura TIMESTAMPTZ;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backorder_os TO authenticated;
GRANT ALL ON public.backorder_os TO service_role;