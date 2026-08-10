-- =========================================================
-- Catálogo versionado de ativos (PCM)
-- Idempotente: pode ser reexecutado com segurança.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.asset_catalogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  business_unit text,
  version integer NOT NULL DEFAULT 1,
  source_filename text,
  total_assets integer DEFAULT 0,
  is_active boolean DEFAULT false,
  imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL REFERENCES public.asset_catalogs(id) ON DELETE CASCADE,
  code text NOT NULL,
  normalized_code text NOT NULL,
  name text NOT NULL DEFAULT '',
  level text NOT NULL DEFAULT '',
  parent_code text,
  parent_name text NOT NULL DEFAULT '',
  business_unit text NOT NULL DEFAULT '',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assets_catalog_code_unique UNIQUE (catalog_id, normalized_code)
);

CREATE INDEX IF NOT EXISTS assets_normalized_code_idx ON public.assets (normalized_code);
CREATE INDEX IF NOT EXISTS assets_parent_code_idx ON public.assets (parent_code);
CREATE INDEX IF NOT EXISTS assets_level_idx ON public.assets (level);
CREATE INDEX IF NOT EXISTS assets_catalog_id_idx ON public.assets (catalog_id);
CREATE UNIQUE INDEX IF NOT EXISTS asset_catalogs_single_active_idx
  ON public.asset_catalogs (is_active) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.spreadsheet_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  catalog_id uuid REFERENCES public.asset_catalogs(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'asset-import',
  file_name text NOT NULL DEFAULT '',
  file_size bigint NOT NULL DEFAULT 0,
  file_type text NOT NULL DEFAULT '',
  sheet_name text,
  status text NOT NULL DEFAULT 'pending',
  progress integer NOT NULL DEFAULT 0,
  column_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_rows integer NOT NULL DEFAULT 0,
  processed_rows integer NOT NULL DEFAULT 0,
  matched_rows integer NOT NULL DEFAULT 0,
  unmatched_rows integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spreadsheet_jobs_user_idx ON public.spreadsheet_jobs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.spreadsheet_unmatched (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.spreadsheet_jobs(id) ON DELETE CASCADE,
  sheet_name text NOT NULL DEFAULT '',
  row_number integer NOT NULL DEFAULT 0,
  code text NOT NULL DEFAULT '',
  raw_row jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  resolved_code text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spreadsheet_unmatched_job_idx ON public.spreadsheet_unmatched (job_id);

-- ---------- grants ----------
GRANT SELECT ON public.asset_catalogs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.asset_catalogs TO authenticated;
GRANT ALL ON public.asset_catalogs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.spreadsheet_jobs TO authenticated;
GRANT ALL ON public.spreadsheet_jobs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.spreadsheet_unmatched TO authenticated;
GRANT ALL ON public.spreadsheet_unmatched TO service_role;

-- ---------- RLS ----------
ALTER TABLE public.asset_catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spreadsheet_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spreadsheet_unmatched ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_catalogs_select_authenticated" ON public.asset_catalogs;
CREATE POLICY "asset_catalogs_select_authenticated" ON public.asset_catalogs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "asset_catalogs_admin_write" ON public.asset_catalogs;
CREATE POLICY "asset_catalogs_admin_write" ON public.asset_catalogs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "assets_select_authenticated" ON public.assets;
CREATE POLICY "assets_select_authenticated" ON public.assets
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "assets_admin_write" ON public.assets;
CREATE POLICY "assets_admin_write" ON public.assets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "spreadsheet_jobs_own_or_admin" ON public.spreadsheet_jobs;
CREATE POLICY "spreadsheet_jobs_own_or_admin" ON public.spreadsheet_jobs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "spreadsheet_jobs_insert_own" ON public.spreadsheet_jobs;
CREATE POLICY "spreadsheet_jobs_insert_own" ON public.spreadsheet_jobs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "spreadsheet_jobs_update_own" ON public.spreadsheet_jobs;
CREATE POLICY "spreadsheet_jobs_update_own" ON public.spreadsheet_jobs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "spreadsheet_jobs_delete_own" ON public.spreadsheet_jobs;
CREATE POLICY "spreadsheet_jobs_delete_own" ON public.spreadsheet_jobs
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "spreadsheet_unmatched_own_or_admin" ON public.spreadsheet_unmatched;
CREATE POLICY "spreadsheet_unmatched_own_or_admin" ON public.spreadsheet_unmatched
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.spreadsheet_jobs j
    WHERE j.id = job_id
      AND (j.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.spreadsheet_jobs j
    WHERE j.id = job_id
      AND (j.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ));

-- ---------- triggers ----------
DROP TRIGGER IF EXISTS tg_asset_catalogs_updated_at ON public.asset_catalogs;
CREATE TRIGGER tg_asset_catalogs_updated_at BEFORE UPDATE ON public.asset_catalogs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS tg_assets_updated_at ON public.assets;
CREATE TRIGGER tg_assets_updated_at BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS tg_spreadsheet_jobs_updated_at ON public.spreadsheet_jobs;
CREATE TRIGGER tg_spreadsheet_jobs_updated_at BEFORE UPDATE ON public.spreadsheet_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Ativar um catálogo desativa os demais (evita corrida com o índice único parcial).
CREATE OR REPLACE FUNCTION public.tg_asset_catalog_single_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active THEN
    UPDATE public.asset_catalogs SET is_active = false
     WHERE id <> NEW.id AND is_active;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_asset_catalogs_single_active ON public.asset_catalogs;
CREATE TRIGGER tg_asset_catalogs_single_active BEFORE INSERT OR UPDATE OF is_active ON public.asset_catalogs
  FOR EACH ROW WHEN (NEW.is_active) EXECUTE FUNCTION public.tg_asset_catalog_single_active();

-- ---------- migração da base legada assets_ref ----------
DO $$
DECLARE v_catalog uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.asset_catalogs) THEN
    INSERT INTO public.asset_catalogs (name, source_filename, is_active, version, metadata)
    VALUES ('Base inicial (assets_ref)', 'assets_ref', true, 1, jsonb_build_object('origin', 'legacy-assets_ref'))
    RETURNING id INTO v_catalog;

    INSERT INTO public.assets (catalog_id, code, normalized_code, name, level, parent_code, parent_name, business_unit)
    SELECT
      v_catalog,
      a.ativo,
      upper(btrim(a.ativo)),
      coalesce(a.denominacao, ''),
      coalesce(a.nivel, ''),
      nullif(upper(btrim(coalesce(a.codigo_pai, ''))), ''),
      coalesce(a.descricao_pai, ''),
      coalesce(a.unidade_negocio, '')
    FROM public.assets_ref a
    WHERE btrim(coalesce(a.ativo, '')) <> ''
    ON CONFLICT (catalog_id, normalized_code) DO NOTHING;

    UPDATE public.asset_catalogs c
       SET total_assets = (SELECT count(*) FROM public.assets WHERE catalog_id = c.id)
     WHERE c.id = v_catalog;
  END IF;
END $$;