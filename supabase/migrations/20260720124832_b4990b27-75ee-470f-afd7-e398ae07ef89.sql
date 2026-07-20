
DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM auth.users WHERE email = 'colaboradores@apontauto.local';
  IF v_id IS NULL THEN
    v_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, reauthentication_token, phone_change, phone_change_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      'colaboradores@apontauto.local', crypt('123456', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Colaboradores"}'::jsonb, false,
      '', '', '', '', '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_id, v_id::text, jsonb_build_object('sub', v_id::text, 'email', 'colaboradores@apontauto.local', 'email_verified', true), 'email', now(), now(), now());
  ELSE
    UPDATE auth.users
       SET encrypted_password = crypt('123456', gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           confirmation_token = '', recovery_token = '',
           email_change_token_new = '', email_change = '',
           email_change_token_current = '', reauthentication_token = '',
           phone_change = '', phone_change_token = '',
           updated_at = now()
     WHERE id = v_id;
  END IF;

  -- Ensure profile exists with all menus allowed (full access, non-admin).
  INSERT INTO public.profiles (id, full_name, allowed_menus)
  VALUES (v_id, 'Colaboradores', NULL)
  ON CONFLICT (id) DO UPDATE SET allowed_menus = NULL;
END $$;

-- Also normalize any NULL auth tokens across the board (fixes GoTrue scan bug).
UPDATE auth.users SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, '');
