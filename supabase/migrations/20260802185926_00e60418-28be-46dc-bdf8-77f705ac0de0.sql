-- Definitive fix for Centro de Gestão permissions.
-- We are encountering "permission denied for function gestao_overview_v2".
-- This migration forces EXECUTE permissions on all relevant functions and SELECT on all relevant views/tables.

-- 1. Grant EXECUTE to authenticated and service_role for all overloads of gestao_overview_v2
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN (SELECT oid::regprocedure as sig FROM pg_proc WHERE proname = 'gestao_overview_v2')
    LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', func_record.sig);
    END LOOP;
END $$;

-- 2. Grant EXECUTE to authenticated and service_role for security helpers
GRANT EXECUTE ON FUNCTION public.can_access_gestao(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_module(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 3. The function uses the view vw_gestao_os_consolidada which is defined as security_invoker = on.
-- This means the caller MUST have SELECT permission on the view and ALL underlying tables.
GRANT SELECT ON public.vw_gestao_os_consolidada TO authenticated, service_role;

-- 4. Grant SELECT on all source tables used by the view and the overview function
GRANT SELECT ON public.backorder_os TO authenticated, service_role;
GRANT SELECT ON public.corretiva_os TO authenticated, service_role;
GRANT SELECT ON public.refrigeracao_os TO authenticated, service_role;
GRANT SELECT ON public.corretiva_pecas TO authenticated, service_role;
GRANT SELECT ON public.refrigeracao_pecas TO authenticated, service_role;
GRANT SELECT ON public.corretiva_problemas TO authenticated, service_role;
GRANT SELECT ON public.refrigeracao_problemas TO authenticated, service_role;
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
GRANT SELECT ON public.user_roles TO authenticated, service_role;
GRANT SELECT ON public.user_pcm_roles TO authenticated, service_role;
GRANT SELECT ON public.pcm_role_permissions TO authenticated, service_role;
GRANT SELECT ON public.pcm_permissions TO authenticated, service_role;
GRANT SELECT ON public.user_module_access TO authenticated, service_role;

-- 5. Ensure the helper function pcm_fill_metrics is also available as it's often used in PCM Home
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN (SELECT oid::regprocedure as sig FROM pg_proc WHERE proname = 'pcm_fill_metrics')
    LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', func_record.sig);
    END LOOP;
END $$;
