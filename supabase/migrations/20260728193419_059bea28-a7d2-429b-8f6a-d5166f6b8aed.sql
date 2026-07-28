-- ============ RBAC ============
CREATE TABLE IF NOT EXISTS public.pcm_roles (
  key text PRIMARY KEY,
  label text NOT NULL,
  rank integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pcm_permissions (
  key text PRIMARY KEY,
  module_key text NOT NULL,
  action text NOT NULL,
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pcm_role_permissions (
  role_key text NOT NULL REFERENCES public.pcm_roles(key) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.pcm_permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role_key, permission_key)
);

CREATE TABLE IF NOT EXISTS public.user_pcm_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role_key text NOT NULL REFERENCES public.pcm_roles(key) ON DELETE CASCADE,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_key)
);

CREATE TABLE IF NOT EXISTS public.user_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module_key text NOT NULL,
  actions text[] NOT NULL DEFAULT ARRAY['read']::text[],
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_key)
);

CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  event_type text NOT NULL,
  entity_type text NOT NULL DEFAULT '',
  entity_id text,
  module_key text,
  action text,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON public.audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON public.audit_events (entity_type, entity_id);

GRANT SELECT ON public.pcm_roles TO authenticated;
GRANT SELECT ON public.pcm_permissions TO authenticated;
GRANT SELECT ON public.pcm_role_permissions TO authenticated;
GRANT SELECT ON public.user_pcm_roles TO authenticated;
GRANT SELECT ON public.user_module_access TO authenticated;
GRANT SELECT, INSERT ON public.audit_events TO authenticated;
GRANT ALL ON public.pcm_roles, public.pcm_permissions, public.pcm_role_permissions,
              public.user_pcm_roles, public.user_module_access, public.audit_events TO service_role;

ALTER TABLE public.pcm_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pcm_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pcm_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_pcm_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- ============ Seeds ============
INSERT INTO public.pcm_roles (key, label, rank) VALUES
  ('proprietario','Proprietário',1),
  ('administrador','Administrador',2),
  ('gestor_pcm','Gestor PCM',3),
  ('planejador','Planejador',4),
  ('supervisor','Supervisor',5),
  ('tecnico','Técnico',6),
  ('almoxarifado','Almoxarifado',7),
  ('sst','Segurança do Trabalho',8),
  ('auditor','Auditor',9),
  ('visualizador','Visualizador',10)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.pcm_permissions (key, module_key, action, label)
SELECT m.k || ':' || a.k, m.k, a.k, m.k || ' — ' || a.k
FROM (VALUES
  ('dashboard'),('dashboard-chamados'),('programacao'),('preventiva'),('taludes'),
  ('apontamentos'),('clima-tempo'),('backorder'),('corretiva'),('corretiva-pecas-status'),
  ('corretiva-historico'),('corretiva-gestor'),('refrigeracao'),('refrigeracao-pecas-status'),
  ('refrigeracao-historico'),('refrigeracao-gestor'),('preventiva-ac'),('assets-fill'),
  ('assets-catalog'),('assets-unmatched'),('assets-history'),('seguranca-trabalho'),
  ('painel-legal'),('lavanderia'),('controle-materiais'),('configuracoes')
) AS m(k)
CROSS JOIN (VALUES ('read'),('create'),('update'),('delete'),('export'),('admin')) AS a(k)
ON CONFLICT (key) DO NOTHING;

-- Proprietário e administrador: tudo
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT r.key, p.key FROM public.pcm_roles r
CROSS JOIN public.pcm_permissions p
WHERE r.key IN ('proprietario','administrador')
ON CONFLICT DO NOTHING;

-- Auditor e visualizador: somente leitura/exportação
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT r.key, p.key FROM public.pcm_roles r
CROSS JOIN public.pcm_permissions p
WHERE r.key = 'auditor' AND p.action IN ('read','export')
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'visualizador', p.key FROM public.pcm_permissions p WHERE p.action = 'read'
ON CONFLICT DO NOTHING;

-- Almoxarifado
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'almoxarifado', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('controle-materiais','corretiva-pecas-status','refrigeracao-pecas-status')
ON CONFLICT DO NOTHING;

-- Segurança do trabalho
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'sst', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('seguranca-trabalho','painel-legal')
ON CONFLICT DO NOTHING;

-- Gestor PCM / planejador / supervisor: operação ampla, sem admin
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT r.key, p.key FROM public.pcm_roles r
CROSS JOIN public.pcm_permissions p
WHERE r.key IN ('gestor_pcm','planejador','supervisor')
  AND p.action <> 'admin'
  AND p.module_key <> 'configuracoes'
ON CONFLICT DO NOTHING;

-- Técnico: campo
INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT 'tecnico', p.key FROM public.pcm_permissions p
WHERE p.module_key IN ('corretiva','refrigeracao','preventiva-ac','corretiva-historico','refrigeracao-historico')
  AND p.action IN ('read','create','update')
ON CONFLICT DO NOTHING;

-- ============ Função central de autorização ============
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
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- administrador legado
  IF public.has_role(v_uid, 'admin'::public.app_role) THEN
    RETURN true;
  END IF;

  -- perfil RBAC
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

  -- liberação individual de módulo
  IF EXISTS (
    SELECT 1 FROM public.user_module_access uma
     WHERE uma.user_id = v_uid
       AND uma.module_key = can_access_module.module_key
       AND (v_action = ANY (uma.actions) OR 'all' = ANY (uma.actions))
  ) THEN
    RETURN true;
  END IF;

  -- compatibilidade com allowed_menus (não remove acesso de quem já usa o sistema)
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

REVOKE ALL ON FUNCTION public.can_access_module(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_module(text, text) TO authenticated, service_role;

-- ============ Auditoria genérica ============
CREATE OR REPLACE FUNCTION public.tg_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_module text := coalesce(TG_ARGV[0], TG_TABLE_NAME);
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_events(user_id, event_type, entity_type, entity_id, module_key, action, new_data)
    VALUES (auth.uid(), 'insert', TG_TABLE_NAME, (to_jsonb(NEW)->>'id'), v_module, 'create', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_events(user_id, event_type, entity_type, entity_id, module_key, action, old_data, new_data)
    VALUES (auth.uid(), 'update', TG_TABLE_NAME, (to_jsonb(NEW)->>'id'), v_module, 'update', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    INSERT INTO public.audit_events(user_id, event_type, entity_type, entity_id, module_key, action, old_data)
    VALUES (auth.uid(), 'delete', TG_TABLE_NAME, (to_jsonb(OLD)->>'id'), v_module, 'delete', to_jsonb(OLD));
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS audit_user_pcm_roles ON public.user_pcm_roles;
CREATE TRIGGER audit_user_pcm_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_pcm_roles
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('usuarios');

DROP TRIGGER IF EXISTS audit_user_module_access ON public.user_module_access;
CREATE TRIGGER audit_user_module_access
AFTER INSERT OR UPDATE OR DELETE ON public.user_module_access
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('usuarios');

DROP TRIGGER IF EXISTS audit_controle_materiais_meta ON public.controle_materiais_meta;
CREATE TRIGGER audit_controle_materiais_meta
AFTER INSERT OR UPDATE OR DELETE ON public.controle_materiais_meta
FOR EACH ROW EXECUTE FUNCTION public.tg_audit_event('controle-materiais');

-- ============ Políticas RBAC ============
DROP POLICY IF EXISTS "pcm_roles_read" ON public.pcm_roles;
CREATE POLICY "pcm_roles_read" ON public.pcm_roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "pcm_permissions_read" ON public.pcm_permissions;
CREATE POLICY "pcm_permissions_read" ON public.pcm_permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "pcm_role_permissions_read" ON public.pcm_role_permissions;
CREATE POLICY "pcm_role_permissions_read" ON public.pcm_role_permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "user_pcm_roles_read_self_or_admin" ON public.user_pcm_roles;
CREATE POLICY "user_pcm_roles_read_self_or_admin" ON public.user_pcm_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "user_module_access_read_self_or_admin" ON public.user_module_access;
CREATE POLICY "user_module_access_read_self_or_admin" ON public.user_module_access
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "audit_events_read" ON public.audit_events;
CREATE POLICY "audit_events_read" ON public.audit_events
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.user_pcm_roles ur WHERE ur.user_id = auth.uid() AND ur.role_key IN ('auditor','proprietario'))
);

DROP POLICY IF EXISTS "audit_events_insert_self" ON public.audit_events;
CREATE POLICY "audit_events_insert_self" ON public.audit_events
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- ============ Endurecimento de políticas amplas ============
-- Controle de materiais
DROP POLICY IF EXISTS "Autenticados gerenciam controle de materiais" ON public.controle_materiais_meta;
CREATE POLICY "controle_materiais_read" ON public.controle_materiais_meta
FOR SELECT TO authenticated USING (public.can_access_module('controle-materiais','read'));
CREATE POLICY "controle_materiais_write" ON public.controle_materiais_meta
FOR ALL TO authenticated
USING (public.can_access_module('controle-materiais','update'))
WITH CHECK (public.can_access_module('controle-materiais','update'));

DROP POLICY IF EXISTS "Autenticados gerenciam centros de custo" ON public.controle_centros_custo;
CREATE POLICY "centros_custo_read" ON public.controle_centros_custo
FOR SELECT TO authenticated USING (public.can_access_module('controle-materiais','read'));
CREATE POLICY "centros_custo_write" ON public.controle_centros_custo
FOR ALL TO authenticated
USING (public.can_access_module('controle-materiais','update'))
WITH CHECK (public.can_access_module('controle-materiais','update'));

DROP POLICY IF EXISTS "Autenticados leem envios" ON public.controle_envios_facilities;
DROP POLICY IF EXISTS "Autenticados registram envios" ON public.controle_envios_facilities;
CREATE POLICY "envios_facilities_read" ON public.controle_envios_facilities
FOR SELECT TO authenticated USING (public.can_access_module('controle-materiais','read'));
CREATE POLICY "envios_facilities_insert" ON public.controle_envios_facilities
FOR INSERT TO authenticated WITH CHECK (public.can_access_module('controle-materiais','create'));

-- Itens legais
DROP POLICY IF EXISTS "Legal items readable by authenticated" ON public.legal_items;
CREATE POLICY "legal_items_read" ON public.legal_items
FOR SELECT TO authenticated USING (public.can_access_module('painel-legal','read'));

DROP POLICY IF EXISTS "Executions readable by authenticated" ON public.legal_item_executions;
CREATE POLICY "legal_executions_read" ON public.legal_item_executions
FOR SELECT TO authenticated USING (public.can_access_module('painel-legal','read'));

DROP POLICY IF EXISTS "Attachments readable by authenticated" ON public.legal_item_attachments;
CREATE POLICY "legal_attachments_read" ON public.legal_item_attachments
FOR SELECT TO authenticated USING (public.can_access_module('painel-legal','read'));

-- Lavanderia
DROP POLICY IF EXISTS "lav_colab_auth_all" ON public.lavanderia_colaboradores;
CREATE POLICY "lav_colab_read" ON public.lavanderia_colaboradores
FOR SELECT TO authenticated USING (public.can_access_module('lavanderia','read'));
CREATE POLICY "lav_colab_write" ON public.lavanderia_colaboradores
FOR ALL TO authenticated
USING (public.can_access_module('lavanderia','update'))
WITH CHECK (public.can_access_module('lavanderia','update'));

DROP POLICY IF EXISTS "lav_pecas_auth_all" ON public.lavanderia_pecas;
CREATE POLICY "lav_pecas_read" ON public.lavanderia_pecas
FOR SELECT TO authenticated USING (public.can_access_module('lavanderia','read'));
CREATE POLICY "lav_pecas_write" ON public.lavanderia_pecas
FOR ALL TO authenticated
USING (public.can_access_module('lavanderia','update'))
WITH CHECK (public.can_access_module('lavanderia','update'));

DROP POLICY IF EXISTS "lav_eventos_auth_all" ON public.lavanderia_eventos;
CREATE POLICY "lav_eventos_read" ON public.lavanderia_eventos
FOR SELECT TO authenticated USING (public.can_access_module('lavanderia','read'));
CREATE POLICY "lav_eventos_write" ON public.lavanderia_eventos
FOR ALL TO authenticated
USING (public.can_access_module('lavanderia','update'))
WITH CHECK (public.can_access_module('lavanderia','update'));