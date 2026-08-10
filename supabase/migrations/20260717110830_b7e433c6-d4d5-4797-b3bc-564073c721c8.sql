CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      _role = 'admin'::public.app_role
      AND EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE u.id = _user_id
          AND lower(coalesce(u.email, '')) = 'gabrielvlp33@gmail.com'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role = _role
    );
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) = 'gabrielvlp33@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_my_allowed_menus()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'admin'::public.app_role) THEN NULL::text[]
    WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()) THEN (
      SELECT p.allowed_menus FROM public.profiles p WHERE p.id = auth.uid()
    )
    ELSE ARRAY[]::text[]
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_allowed_menus() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_allowed_menus() TO authenticated, service_role;