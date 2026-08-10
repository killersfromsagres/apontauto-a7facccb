-- Seed do usuário de campo dedicado à Refrigeração.
-- Login: climatizacao / Senha inicial: 123456 (recomendado trocar depois).
DO $$
DECLARE
  uid uuid;
  existing_uid uuid;
BEGIN
  SELECT id INTO existing_uid FROM auth.users WHERE email = 'climatizacao@apontauto.local';
  IF existing_uid IS NULL THEN
    uid := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user
    ) VALUES (
      uid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'climatizacao@apontauto.local',
      crypt('123456', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Climatização"}'::jsonb,
      false, false
    );
    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at
    ) VALUES (
      gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', 'climatizacao@apontauto.local'),
      'email', now(), now(), now()
    );
  ELSE
    uid := existing_uid;
  END IF;

  INSERT INTO public.profiles (id, full_name, allowed_menus)
  VALUES (uid, 'Climatização', ARRAY['refrigeracao'])
  ON CONFLICT (id) DO UPDATE SET allowed_menus = ARRAY['refrigeracao'];
END $$;