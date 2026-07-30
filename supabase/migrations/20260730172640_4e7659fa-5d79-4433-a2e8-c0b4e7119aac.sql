DO $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'materiais@apontauto.local';
  IF v_uid IS NULL THEN RAISE EXCEPTION 'usuario materiais nao encontrado'; END IF;

  INSERT INTO public.profiles (id, full_name)
  VALUES (v_uid, 'Materiais')
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM public.user_module_access WHERE user_id = v_uid;

  INSERT INTO public.user_module_access (user_id, module_key, actions)
  VALUES
    (v_uid, 'dashboard', ARRAY['read']),
    (v_uid, 'solicitacao-materiais', ARRAY['read','create','update','export']),
    (v_uid, 'controle-materiais', ARRAY['read','create','update','export']),
    (v_uid, 'materiais-os', ARRAY['read','create','update','export']),
    (v_uid, 'painel-legal', ARRAY['read','export'])
  ON CONFLICT DO NOTHING;
END $$;