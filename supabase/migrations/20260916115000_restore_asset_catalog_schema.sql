-- Restaura a estrutura usada pelo módulo Base de Ativos no Supabase atual.
-- Idempotente para permitir recuperação segura após migração/troca de projeto.

CREATE TABLE IF NOT EXISTS public.asset_catalogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  business_unit text,
  version integer NOT NULL DEFAULT 1,
  source_filename text,
  total_assets integer DEFAULT 0,
  is_active boolean DEFAULT false,
  imported_by uuid,
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
  CONSTRAINT assets_catalog_normalized_code_key UNIQUE (catalog_id, normalized_code)
);

CREATE TABLE IF NOT EXISTS public.assets_ref (
  ativo text PRIMARY KEY,
  denominacao text NOT NULL DEFAULT '',
  nivel text NOT NULL DEFAULT '',
  codigo_pai text,
  descricao_pai text NOT NULL DEFAULT '',
  unidade_negocio text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_catalogs_active
  ON public.asset_catalogs (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_asset_catalogs_imported_at
  ON public.asset_catalogs (imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_catalog_id ON public.assets (catalog_id);
CREATE INDEX IF NOT EXISTS idx_assets_normalized_code ON public.assets (normalized_code);
CREATE INDEX IF NOT EXISTS idx_assets_parent_code ON public.assets (catalog_id, parent_code);

DROP TRIGGER IF EXISTS trg_asset_catalogs_updated_at ON public.asset_catalogs;
CREATE TRIGGER trg_asset_catalogs_updated_at
BEFORE UPDATE ON public.asset_catalogs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_assets_updated_at ON public.assets;
CREATE TRIGGER trg_assets_updated_at
BEFORE UPDATE ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.asset_catalog_keep_single_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active IS TRUE THEN
    UPDATE public.asset_catalogs
       SET is_active = false
     WHERE id <> NEW.id
       AND is_active IS TRUE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_asset_catalog_single_active ON public.asset_catalogs;
CREATE TRIGGER trg_asset_catalog_single_active
BEFORE INSERT OR UPDATE OF is_active ON public.asset_catalogs
FOR EACH ROW
WHEN (NEW.is_active IS TRUE)
EXECUTE FUNCTION public.asset_catalog_keep_single_active();

ALTER TABLE public.asset_catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets_ref ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_catalogs_select_authenticated" ON public.asset_catalogs;
CREATE POLICY "asset_catalogs_select_authenticated"
ON public.asset_catalogs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "asset_catalogs_insert_admin" ON public.asset_catalogs;
CREATE POLICY "asset_catalogs_insert_admin"
ON public.asset_catalogs FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "asset_catalogs_update_admin" ON public.asset_catalogs;
CREATE POLICY "asset_catalogs_update_admin"
ON public.asset_catalogs FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "asset_catalogs_delete_admin" ON public.asset_catalogs;
CREATE POLICY "asset_catalogs_delete_admin"
ON public.asset_catalogs FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "assets_select_authenticated" ON public.assets;
CREATE POLICY "assets_select_authenticated"
ON public.assets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "assets_insert_admin" ON public.assets;
CREATE POLICY "assets_insert_admin"
ON public.assets FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "assets_update_admin" ON public.assets;
CREATE POLICY "assets_update_admin"
ON public.assets FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "assets_delete_admin" ON public.assets;
CREATE POLICY "assets_delete_admin"
ON public.assets FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "assets_ref_select_authenticated" ON public.assets_ref;
CREATE POLICY "assets_ref_select_authenticated"
ON public.assets_ref FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "assets_ref_insert_admin" ON public.assets_ref;
CREATE POLICY "assets_ref_insert_admin"
ON public.assets_ref FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "assets_ref_update_admin" ON public.assets_ref;
CREATE POLICY "assets_ref_update_admin"
ON public.assets_ref FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "assets_ref_delete_admin" ON public.assets_ref;
CREATE POLICY "assets_ref_delete_admin"
ON public.assets_ref FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

NOTIFY pgrst, 'reload schema';
