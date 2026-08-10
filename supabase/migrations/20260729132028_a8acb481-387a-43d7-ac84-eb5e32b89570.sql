CREATE TABLE public.image_uploads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  module_key text,
  entity_type text,
  entity_id text,
  sha256 text NOT NULL,
  size_bytes integer NOT NULL,
  mime_type text NOT NULL,
  url text,
  delete_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.image_uploads TO authenticated;
GRANT ALL ON public.image_uploads TO service_role;

ALTER TABLE public.image_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "image_uploads_select_own_or_admin"
  ON public.image_uploads FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX image_uploads_user_created_idx ON public.image_uploads (user_id, created_at DESC);
CREATE INDEX image_uploads_sha_idx ON public.image_uploads (sha256);