DROP FUNCTION IF EXISTS public.provision_chamados_client_login();

CREATE OR REPLACE FUNCTION public.provision_chamados_client_login()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_login TEXT := 'chamados';
    v_password TEXT := '123456';
    v_email TEXT := 'chamados@apontauto.local';
BEGIN
    -- Security Check: Only admin can run this
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Apenas administradores podem provisionar este acesso.';
    END IF;

    -- 1. Create/Find User in auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
    
    IF v_user_id IS NULL THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, 
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
            created_at, updated_at, confirmation_token, recovery_token
        )
        VALUES (
            '00000000-0000-0000-0000-000000000000',
            gen_random_uuid(),
            'authenticated',
            'authenticated',
            v_email,
            crypt(v_password, gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}',
            jsonb_build_object('login', v_login, 'full_name', 'Monitoramento de Chamados (Cliente)'),
            now(),
            now(),
            '',
            ''
        )
        RETURNING id INTO v_user_id;
    END IF;

    -- 2. Assign role 'user'
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'user')
    ON CONFLICT (user_id, role) DO NOTHING;

    -- 3. Reset and Assign specific module permissions
    DELETE FROM public.user_module_access WHERE user_id = v_user_id;
    
    INSERT INTO public.user_module_access (user_id, module_key, actions)
    VALUES 
        (v_user_id, 'dashboard-chamados', ARRAY['read']),
        (v_user_id, 'corretiva-historico', ARRAY['read']);

    RETURN jsonb_build_object('ok', true, 'user_id', v_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_chamados_client_login() TO authenticated;
GRANT EXECUTE ON FUNCTION public.provision_chamados_client_login() TO service_role;
