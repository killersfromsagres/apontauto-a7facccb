INSERT INTO public.user_module_access (user_id, module_key, actions)
VALUES
  ('35f7359f-f14c-42a3-a796-0dd06e436247', 'frota-checklist', ARRAY['read','create','update','export']),
  ('35f7359f-f14c-42a3-a796-0dd06e436247', 'frota-historico', ARRAY['read','export']),
  ('35f7359f-f14c-42a3-a796-0dd06e436247', 'abastecimento', ARRAY['read','create','update','export'])
ON CONFLICT (user_id, module_key) DO UPDATE SET actions = EXCLUDED.actions;