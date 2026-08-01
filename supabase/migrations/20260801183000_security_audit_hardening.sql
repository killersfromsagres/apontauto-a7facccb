-- 8. SEGURANÇA: HARDENING E AUDITORIA

-- 8.1 Gestão de Credenciais
-- Implementa infraestrutura para convites e expiração de senhas
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS force_password_change boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_password_change timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.user_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    role public.app_role NOT NULL DEFAULT 'user',
    token text UNIQUE NOT NULL,
    invited_by uuid REFERENCES auth.users(id),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
    created_at timestamptz DEFAULT now(),
    accepted_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_invitations TO authenticated;
GRANT ALL ON public.user_invitations TO service_role;
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invitations" ON public.user_invitations
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 8.2 Hardening de Funções SECURITY DEFINER
-- Garante search_path seguro e revoga acesso PUBLIC
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.prosecdef = true AND n.nspname = 'public'
    LOOP
        EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', 
            func_record.nspname, func_record.proname, func_record.args);
        EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC', 
            func_record.nspname, func_record.proname, func_record.args);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role', 
            func_record.nspname, func_record.proname, func_record.args);
    END LOOP;
END $$;

-- 8.4 Mascaramento de Dados e Auditoria Administrativa
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid REFERENCES auth.users(id),
    action text NOT NULL,
    target_table text,
    target_id uuid,
    details jsonb,
    created_at timestamptz DEFAULT now()
);

GRANT INSERT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can see all logs" ON public.admin_audit_logs
    FOR SELECT TO service_role USING (true);

-- Função para mascarar CPF (Item 8.4)
CREATE OR REPLACE FUNCTION public.mask_cpf(cpf text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE 
    WHEN length(cpf) = 11 THEN '***.' || substr(cpf, 4, 3) || '.' || substr(cpf, 7, 3) || '-**'
    ELSE cpf
  END;
$$;
