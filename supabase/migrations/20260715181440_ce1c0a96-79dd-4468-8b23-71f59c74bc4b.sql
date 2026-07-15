
-- Add allowed_menus to profiles: NULL = all allowed, array = only these keys allowed
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allowed_menus text[] DEFAULT NULL;

-- Function callable by authenticated users to fetch their own allowed_menus
CREATE OR REPLACE FUNCTION public.get_my_allowed_menus()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT allowed_menus FROM public.profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_allowed_menus() TO authenticated;
