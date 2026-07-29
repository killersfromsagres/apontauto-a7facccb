CREATE TABLE IF NOT EXISTS public.terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  user_agent text NULL,
  ip_hash text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT terms_acceptances_unique_version UNIQUE (user_id, terms_version, privacy_version)
);

GRANT SELECT, INSERT ON public.terms_acceptances TO authenticated;
GRANT ALL ON public.terms_acceptances TO service_role;

ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "terms_acceptances_select_own" ON public.terms_acceptances;
CREATE POLICY "terms_acceptances_select_own"
  ON public.terms_acceptances FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "terms_acceptances_insert_own" ON public.terms_acceptances;
CREATE POLICY "terms_acceptances_insert_own"
  ON public.terms_acceptances FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS terms_acceptances_user_idx ON public.terms_acceptances (user_id, accepted_at DESC);