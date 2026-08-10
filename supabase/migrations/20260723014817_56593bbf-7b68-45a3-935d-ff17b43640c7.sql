
-- Remove login hidraulica
DELETE FROM auth.users WHERE email = 'hidraulica@apontauto.local';

-- Cria login corretivas / senha 123456 com acesso apenas ao módulo Corretiva
DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    'corretivas@apontauto.local',
    crypt('123456', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('login','corretivas','full_name','Equipe Corretivas'),
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(), new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', 'corretivas@apontauto.local'),
    'email', new_user_id::text, now(), now(), now()
  );

  INSERT INTO public.profiles (id, full_name, allowed_menus)
  VALUES (new_user_id, 'Equipe Corretivas', ARRAY['corretiva','corretiva-historico'])
  ON CONFLICT (id) DO UPDATE
    SET allowed_menus = EXCLUDED.allowed_menus,
        full_name = EXCLUDED.full_name;
END $$;
