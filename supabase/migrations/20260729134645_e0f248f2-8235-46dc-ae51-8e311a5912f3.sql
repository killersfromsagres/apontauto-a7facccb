DELETE FROM public.pcm_role_permissions rp
 USING public.pcm_permissions p
 WHERE p.key = rp.permission_key
   AND p.module_key IN ('abastecimento','frota-checklist','frota-historico','frota-gestao')
   AND rp.role_key NOT IN ('proprietario','administrador','gestor_pcm','gestor_frota','operador_frota');

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT r.role_key, p.key FROM public.pcm_permissions p
  CROSS JOIN (VALUES ('proprietario'),('administrador'),('gestor_pcm'),('gestor_frota')) AS r(role_key)
 WHERE p.module_key IN ('abastecimento','frota-checklist','frota-historico','frota-gestao')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'operador_frota', p.key FROM public.pcm_permissions p
 WHERE p.module_key IN ('abastecimento','frota-checklist','frota-historico')
   AND p.action IN ('read','create','update')
ON CONFLICT DO NOTHING;

DELETE FROM public.user_module_access uma
 WHERE uma.module_key IN ('abastecimento','frota-checklist','frota-historico','frota-gestao')
   AND EXISTS (SELECT 1 FROM public.user_module_access o
      WHERE o.user_id = uma.user_id
        AND o.module_key IN ('corretiva','refrigeracao','preventiva-ac','corretiva-historico','refrigeracao-historico'));