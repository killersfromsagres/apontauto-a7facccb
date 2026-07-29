INSERT INTO public.pcm_roles (key, label, rank) VALUES
  ('tecnico_corretiva','Técnico de Corretiva',6),
  ('tecnico_climatizacao','Técnico de Climatização',6),
  ('tecnico_multidisciplinar','Técnico Multidisciplinar',6),
  ('gestor_taludes','Gestor de Taludes',5),
  ('operador_taludes','Operador de Taludes',6),
  ('bombeiros_pt','Bombeiros / PT',6),
  ('gestor_frota','Gestor de Frota',5),
  ('operador_frota','Operador de Frota',6)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.pcm_permissions (key, module_key, action, label)
SELECT m.k || ':' || a.k, m.k, a.k, m.k || ' — ' || a.k
FROM (VALUES
  ('abastecimento'),('frota-checklist'),('frota-historico'),('frota-gestao'),
  ('taludes-editor'),('taludes-clima'),('taludes-pt'),
  ('bi-studio'),('notificacoes-admin'),('auditoria'),('confiabilidade')
) AS m(k)
CROSS JOIN (VALUES ('read'),('create'),('update'),('delete'),('export'),('admin')) AS a(k)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT r.key, p.key FROM public.pcm_roles r
CROSS JOIN public.pcm_permissions p
WHERE r.key IN ('proprietario','administrador')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'gestor_pcm', p.key FROM public.pcm_permissions p
WHERE p.action <> 'admin' AND p.module_key <> 'configuracoes'
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'gestor_frota', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('abastecimento','frota-checklist','frota-historico','frota-gestao')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'operador_frota', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('abastecimento','frota-checklist','frota-historico')
  AND p.action IN ('read','create','update')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'tecnico_corretiva', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('corretiva','corretiva-pecas-status','corretiva-historico')
  AND p.action IN ('read','create','update')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'tecnico_climatizacao', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('refrigeracao','refrigeracao-pecas-status','refrigeracao-historico','preventiva-ac')
  AND p.action IN ('read','create','update')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'tecnico_multidisciplinar', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('corretiva','corretiva-historico','refrigeracao','refrigeracao-historico','preventiva-ac')
  AND p.action IN ('read','create','update')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'gestor_taludes', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('taludes','taludes-editor','taludes-clima','taludes-pt','clima-tempo')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'operador_taludes', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('taludes','taludes-clima')
  AND p.action IN ('read','create','update')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'bombeiros_pt', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('taludes-pt','taludes-clima')
  AND p.action IN ('read','create','update')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'auditor', p.key FROM public.pcm_permissions p
WHERE p.action IN ('read','export')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_access_module(module_key text, required_action text DEFAULT 'read')
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_action text := coalesce(nullif(btrim(required_action), ''), 'read');
  v_menus text[];
  v_has_profile boolean;
  v_restricted text[] := ARRAY[
    'abastecimento','frota-checklist','frota-historico','frota-gestao',
    'bi-studio','notificacoes-admin','auditoria','confiabilidade'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_role(v_uid, 'admin'::public.app_role) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.user_pcm_roles ur
      JOIN public.pcm_role_permissions rp ON rp.role_key = ur.role_key
      JOIN public.pcm_permissions p ON p.key = rp.permission_key
     WHERE ur.user_id = v_uid
       AND p.module_key = can_access_module.module_key
       AND p.action = v_action
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_module_access uma
     WHERE uma.user_id = v_uid
       AND uma.module_key = can_access_module.module_key
       AND (v_action = ANY (uma.actions) OR 'all' = ANY (uma.actions))
  ) THEN
    RETURN true;
  END IF;

  IF can_access_module.module_key = ANY (v_restricted) THEN
    RETURN false;
  END IF;

  SELECT p.allowed_menus, true INTO v_menus, v_has_profile
    FROM public.profiles p WHERE p.id = v_uid;

  IF coalesce(v_has_profile, false) THEN
    IF v_menus IS NULL THEN
      RETURN true;
    END IF;
    IF can_access_module.module_key = ANY (v_menus) THEN
      RETURN v_action <> 'admin';
    END IF;
  END IF;

  RETURN false;
END;
$$;

CREATE TABLE IF NOT EXISTS public.frota_veiculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placa text NOT NULL UNIQUE,
  modelo text,
  marca text,
  tipo text,
  ano integer,
  hodometro_atual numeric(12,1) NOT NULL DEFAULT 0,
  situacao text NOT NULL DEFAULT 'ativo',
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.frota_veiculos TO authenticated;
GRANT ALL ON public.frota_veiculos TO service_role;
ALTER TABLE public.frota_veiculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "frota_veiculos_read" ON public.frota_veiculos
  FOR SELECT TO authenticated
  USING (public.can_access_module('frota-gestao','read') OR public.can_access_module('abastecimento','read'));

CREATE POLICY "frota_veiculos_insert" ON public.frota_veiculos
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_module('frota-gestao','create'));

CREATE POLICY "frota_veiculos_update" ON public.frota_veiculos
  FOR UPDATE TO authenticated
  USING (public.can_access_module('frota-gestao','update'))
  WITH CHECK (public.can_access_module('frota-gestao','update'));

CREATE POLICY "frota_veiculos_delete" ON public.frota_veiculos
  FOR DELETE TO authenticated
  USING (public.can_access_module('frota-gestao','delete'));

CREATE TABLE IF NOT EXISTS public.frota_abastecimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id uuid REFERENCES public.frota_veiculos(id) ON DELETE SET NULL,
  placa text NOT NULL,
  data_abastecimento timestamptz NOT NULL DEFAULT now(),
  motorista text,
  hodometro numeric(12,1),
  litros numeric(10,2) NOT NULL,
  valor_litro numeric(10,3),
  valor_total numeric(12,2),
  combustivel text NOT NULL DEFAULT 'diesel',
  posto text,
  cupom text,
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS frota_abast_data_idx ON public.frota_abastecimentos (data_abastecimento DESC);
CREATE INDEX IF NOT EXISTS frota_abast_veiculo_idx ON public.frota_abastecimentos (veiculo_id);
CREATE INDEX IF NOT EXISTS frota_abast_placa_idx ON public.frota_abastecimentos (placa);
CREATE INDEX IF NOT EXISTS frota_abast_created_by_idx ON public.frota_abastecimentos (created_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.frota_abastecimentos TO authenticated;
GRANT ALL ON public.frota_abastecimentos TO service_role;
ALTER TABLE public.frota_abastecimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "frota_abast_read" ON public.frota_abastecimentos
  FOR SELECT TO authenticated
  USING (public.can_access_module('abastecimento','read'));

CREATE POLICY "frota_abast_insert" ON public.frota_abastecimentos
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_module('abastecimento','create') AND created_by = auth.uid());

CREATE POLICY "frota_abast_update" ON public.frota_abastecimentos
  FOR UPDATE TO authenticated
  USING (public.can_access_module('abastecimento','update'))
  WITH CHECK (public.can_access_module('abastecimento','update'));

CREATE POLICY "frota_abast_delete" ON public.frota_abastecimentos
  FOR DELETE TO authenticated
  USING (public.can_access_module('abastecimento','delete'));

CREATE TRIGGER frota_veiculos_updated_at BEFORE UPDATE ON public.frota_veiculos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER frota_abast_updated_at BEFORE UPDATE ON public.frota_abastecimentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();