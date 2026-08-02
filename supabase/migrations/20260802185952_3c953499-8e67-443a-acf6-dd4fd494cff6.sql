-- GRANTs for authenticated role were missing or not propagating correctly.
-- This migration explicitly grants SELECT on all relevant tables to 'authenticated'.

GRANT SELECT ON public.backorder_os TO authenticated;
GRANT SELECT ON public.corretiva_os TO authenticated;
GRANT SELECT ON public.refrigeracao_os TO authenticated;
GRANT SELECT ON public.corretiva_pecas TO authenticated;
GRANT SELECT ON public.refrigeracao_pecas TO authenticated;
GRANT SELECT ON public.corretiva_problemas TO authenticated;
GRANT SELECT ON public.refrigeracao_problemas TO authenticated;
GRANT SELECT ON public.vehicles TO authenticated;
GRANT SELECT ON public.fleet_checklists TO authenticated;
GRANT SELECT ON public.fleet_fuelings TO authenticated;
GRANT SELECT ON public.vehicle_occurrences TO authenticated;
GRANT SELECT ON public.agua_prog_entregas TO authenticated;
GRANT SELECT ON public.agua_filtro_ativos TO authenticated;
GRANT SELECT ON public.material_solicitacoes TO authenticated;
GRANT SELECT ON public.legal_items TO authenticated;
GRANT SELECT ON public.sst_colaboradores TO authenticated;
GRANT SELECT ON public.talude_pt_releases TO authenticated;
GRANT SELECT ON public.gestao_notas TO authenticated;
GRANT SELECT ON public.gestor_dashboard_preferences TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.user_pcm_roles TO authenticated;
GRANT SELECT ON public.pcm_role_permissions TO authenticated;
GRANT SELECT ON public.pcm_permissions TO authenticated;
GRANT SELECT ON public.user_module_access TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;

-- And the view itself
GRANT SELECT ON public.vw_gestao_os_consolidada TO authenticated;
