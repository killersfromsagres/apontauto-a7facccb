GRANT SELECT ON public.vw_gestao_os_consolidada TO authenticated;
GRANT SELECT ON public.vw_gestao_os_corretiva_novo TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestao_overview_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestao_overview_v2(integer, text, text, text, text, text) TO authenticated;
