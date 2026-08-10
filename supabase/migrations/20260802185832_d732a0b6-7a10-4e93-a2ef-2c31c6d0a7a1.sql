-- Force GRANTs on all functions and views related to Centro de Gestão
-- This ensures that even if a previous migration had a specific argument signature mismatch,
-- the current one is correctly granted to the 'authenticated' role.

GRANT EXECUTE ON FUNCTION public.gestao_overview_v2(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_gestao(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_module(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Ensure the view used by the function is accessible to 'authenticated'
-- The function is SECURITY DEFINER, but RLS on the view might still apply 
-- depending on how it's written.
GRANT SELECT ON public.vw_gestao_os_consolidada TO authenticated;

-- Ensure RLS on user_roles and other tables doesn't block has_role
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.user_pcm_roles TO authenticated;
GRANT SELECT ON public.user_module_access TO authenticated;
GRANT SELECT ON public.pcm_role_permissions TO authenticated;
GRANT SELECT ON public.pcm_permissions TO authenticated;

-- Also check if there are any other signatures for gestao_overview_v2
-- (e.g. if it was created without arguments or with a different default)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT oid::regprocedure as sig FROM pg_proc WHERE proname = 'gestao_overview_v2')
    LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END LOOP;
END $$;
