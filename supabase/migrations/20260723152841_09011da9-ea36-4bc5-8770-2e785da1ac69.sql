ALTER TABLE public.refrigeracao_fotos ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.refrigeracao_fotos ALTER COLUMN storage_path DROP NOT NULL;
ALTER TABLE public.corretiva_fotos ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.corretiva_fotos ALTER COLUMN storage_path DROP NOT NULL;