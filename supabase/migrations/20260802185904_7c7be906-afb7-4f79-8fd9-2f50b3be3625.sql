-- Correcting permissions for all Centro de Gestão functions and related views.
-- The user is reporting a 'permission denied for function gestao_overview_v2' error.
-- This script ensures that 'authenticated' users (like managers and admins) have explicit EXECUTE grants.

-- 1. Grant EXECUTE to 'authenticated' for the main overview function and all its variations/overloads.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT oid::regprocedure as sig FROM pg_proc WHERE proname = 'gestao_overview_v2')
    LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    END LOOP;
END $$;

-- 2. Ensure supporting functions are also callable
GRANT EXECUTE ON FUNCTION public.can_access_gestao(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_module(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gestao_status_canonico(text) TO authenticated, service_role;

-- 3. Ensure the underlying view and the tables it joins are accessible for the RPC to work.
-- Even though functions are SECURITY DEFINER, RLS on views can sometimes cause issues if not configured correctly.
GRANT SELECT ON public.vw_gestao_os_consolidada TO authenticated, service_role;
GRANT SELECT ON public.backorder_os TO authenticated, service_role;
GRANT SELECT ON public.corretiva_os TO authenticated, service_role;
GRANT SELECT ON public.refrigeracao_os TO authenticated, service_role;
GRANT SELECT ON public.corretiva_pecas TO authenticated, service_role;
GRANT SELECT ON public.refrigeracao_pecas TO authenticated, service_role;
GRANT SELECT ON public.corretiva_problemas TO authenticated, service_role;
GRANT SELECT ON public.refrigeracao_problemas TO authenticated, service_role;

-- 4. Audit tables used for indicators
GRANT SELECT ON public.vehicles TO authenticated, service_role;
GRANT SELECT ON public.fleet_checklists TO authenticated, service_role;
GRANT SELECT ON public.fleet_fuelings TO authenticated, service_role;
GRANT SELECT ON public.vehicle_occurrences TO authenticated, service_role;
GRANT SELECT ON public.agua_prog_entregas TO authenticated, service_role;
GRANT SELECT ON public.agua_filtro_ativos TO authenticated, service_role;
GRANT SELECT ON public.material_solicitacoes TO authenticated, service_role;
GRANT SELECT ON public.legal_items TO authenticated, service_role;
GRANT SELECT ON public.sst_colaboradores TO authenticated, service_role;
GRANT SELECT ON public.talude_pt_releases TO authenticated, service_role;
GRANT SELECT ON public.gestao_notas TO authenticated, service_role;
GRANT SELECT ON public.gestor_dashboard_preferences TO authenticated, service_role;
