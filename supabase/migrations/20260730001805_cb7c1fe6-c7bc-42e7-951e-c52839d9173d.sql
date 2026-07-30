REVOKE EXECUTE ON FUNCTION public.agua_perm(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.agua_meu_nome() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.agua_escopo_restrito() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.agua_filtro_escopo_restrito() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.agua_rota_minha(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.agua_rota_ativa(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.agua_perm(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agua_meu_nome() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agua_escopo_restrito() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agua_filtro_escopo_restrito() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agua_rota_minha(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agua_rota_ativa(uuid) TO authenticated, service_role;