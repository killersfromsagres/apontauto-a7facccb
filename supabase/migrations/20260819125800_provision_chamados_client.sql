-- 1. Create access module function for the client
CREATE OR REPLACE FUNCTION public.provision_chamados_client_login()
RETURNS void
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
    -- Only admin can run this (via user_roles)
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Apenas administradores podem provisionar este acesso.';
    END IF;

    -- Create user if not exists
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
    
    IF v_user_id IS NULL THEN
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            recovery_sent_at,
            last_sign_in_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            confirmation_token,
            email_change,
            email_change_token_new,
            recovery_token
        )
        VALUES (
            '00000000-0000-0000-0000-000000000000',
            gen_random_uuid(),
            'authenticated',
            'authenticated',
            v_email,
            crypt(v_password, gen_salt('bf')),
            now(),
            now(),
            now(),
            '{"provider":"email","providers":["email"]}',
            jsonb_build_object('login', v_login, 'full_name', 'Monitoramento de Chamados (Cliente)'),
            now(),
            now(),
            '',
            '',
            '',
            ''
        )
        RETURNING id INTO v_user_id;
    END IF;

    -- Assign role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'user')
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Assign specific module permissions (only view)
    DELETE FROM public.user_module_access WHERE user_id = v_user_id;
    
    INSERT INTO public.user_module_access (user_id, module_key)
    VALUES 
        (v_user_id, 'dashboard-chamados'),
        (v_user_id, 'corretiva-historico');
END;
$$;

-- 2. Grants for standard tables (Read only)
GRANT SELECT ON public.corretiva_os TO authenticated;
GRANT SELECT ON public.corretiva_fotos TO authenticated;
GRANT SELECT ON public.corretiva_pecas TO authenticated;
GRANT SELECT ON public.corretiva_problemas TO authenticated;

-- Ensure the provision function is accessible to authenticated users (admins)
GRANT EXECUTE ON FUNCTION public.provision_chamados_client_login() TO authenticated;
