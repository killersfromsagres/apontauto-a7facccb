-- Revoke public execution to satisfy linter warning 0028/0029
-- and ensure only the intended roles can execute it
REVOKE EXECUTE ON FUNCTION public.provision_chamados_client_login() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.provision_chamados_client_login() FROM authenticated;

-- Re-grant explicitly only to roles that actually need it
-- The server function uses context.supabase which is usually authenticated
GRANT EXECUTE ON FUNCTION public.provision_chamados_client_login() TO authenticated;
GRANT EXECUTE ON FUNCTION public.provision_chamados_client_login() TO service_role;
