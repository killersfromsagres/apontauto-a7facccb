CREATE OR REPLACE FUNCTION public.provision_encarregados_login(_admin_id uuid, _password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _user_id uuid;
    _email text := 'encarregados@apontauto.local';
    _login text := 'encarregados';
    _full_name text := 'Encarregados';
    _modules text[] := ARRAY[
        'dashboard',
        'programacao-gps', 'backlog-inteligente', 'capacidade', 'apontamentos', 
        'refrigeracao', 'refrigeracao-pecas-status', 'refrigeracao-historico',
        'programacao', 'corretiva', 'corretiva-pecas-status', 'corretiva-historico',
        'abastecimento', 'agua-execucao'
    ];
    _actions text[] := ARRAY['read'];
BEGIN
    -- Only admin can run this
    IF NOT public.has_role(_admin_id, 'admin') THEN
        RAISE EXCEPTION 'Apenas administradores podem executar esta ação.';
    END IF;

    -- Look for existing user
    SELECT id INTO _user_id FROM auth.users WHERE email = _email;

    IF _user_id IS NULL THEN
        -- Create user
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, 
            email_confirmed_at, recovery_sent_at, last_sign_in_at, 
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
            confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', _email, crypt(_password, gen_salt('bf')),
            now(), now(), now(),
            jsonb_build_object('provider', 'email', 'providers', array['email']),
            jsonb_build_object('login', _login, 'full_name', _full_name),
            now(), now(), '', '', '', ''
        ) RETURNING id INTO _user_id;
    ELSE
        -- Update password
        UPDATE auth.users 
        SET encrypted_password = crypt(_password, gen_salt('bf')),
            updated_at = now(),
            raw_user_meta_data = jsonb_build_object('login', _login, 'full_name', _full_name)
        WHERE id = _user_id;
    END IF;

    -- Profile
    INSERT INTO public.profiles (id, full_name, allowed_menus)
    VALUES (_user_id, _full_name, _modules)
    ON CONFLICT (id) DO UPDATE SET 
        full_name = EXCLUDED.full_name,
        allowed_menus = EXCLUDED.allowed_menus;

    -- Role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'user')
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Module Access
    DELETE FROM public.user_module_access WHERE user_id = _user_id;
    INSERT INTO public.user_module_access (user_id, module_key, actions, granted_by)
    SELECT _user_id, unnest(_modules), _actions, _admin_id;

    RETURN json_build_object('ok', true, 'user_id', _user_id, 'email', _email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_encarregados_login(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provision_encarregados_login(uuid, text) TO service_role;
