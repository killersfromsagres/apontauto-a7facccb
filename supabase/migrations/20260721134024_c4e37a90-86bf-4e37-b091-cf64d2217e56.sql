ALTER TABLE public.app_settings ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.app_settings ALTER COLUMN id TYPE text USING id::text;