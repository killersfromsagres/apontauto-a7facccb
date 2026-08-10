INSERT INTO public.profiles (id, allowed_menus)
SELECT u.id, ARRAY['corretiva','corretiva-historico']::text[]
FROM auth.users u
WHERE u.email = 'hidraulica@apontauto.local'
ON CONFLICT (id) DO UPDATE SET allowed_menus = EXCLUDED.allowed_menus;