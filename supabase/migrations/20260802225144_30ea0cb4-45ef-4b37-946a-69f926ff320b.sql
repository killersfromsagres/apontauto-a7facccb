DO $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = 'corretivas@apontauto.local';
  IF v_uid IS NULL THEN
    RAISE NOTICE 'login corretivas nao encontrado';
    RETURN;
  END IF;

  UPDATE auth.users
     SET email = 'manutencao@apontauto.local',
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object('email', 'manutencao@apontauto.local', 'nome', 'Manutenção'),
         updated_at = now()
   WHERE id = v_uid;

  UPDATE auth.identities
     SET identity_data = coalesce(identity_data, '{}'::jsonb)
           || jsonb_build_object('email', 'manutencao@apontauto.local'),
         updated_at = now()
   WHERE user_id = v_uid AND provider = 'email';
END $$;