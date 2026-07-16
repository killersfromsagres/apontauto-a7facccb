
-- 1) has_role: remove EXECUTE público/anon; mantém para authenticated (RLS precisa)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 2) Revoga grants desnecessários do papel anon em tabelas sensíveis (defense in depth)
REVOKE ALL ON public.user_roles                    FROM anon;
REVOKE ALL ON public.profiles                      FROM anon;
REVOKE ALL ON public.reminders                     FROM anon;
REVOKE ALL ON public.legal_items                   FROM anon;
REVOKE ALL ON public.legal_item_executions         FROM anon;
REVOKE ALL ON public.legal_item_attachments        FROM anon;
REVOKE ALL ON public.app_settings                  FROM anon;
REVOKE ALL ON public.assets_ref                    FROM anon;
REVOKE ALL ON public.backorder_os                  FROM anon;
REVOKE ALL ON public.backorder_atividade_override  FROM anon;
REVOKE ALL ON public.backorder_prioridade_config   FROM anon;
REVOKE ALL ON public.lavanderia_colaboradores      FROM anon;
REVOKE ALL ON public.lavanderia_pecas              FROM anon;
REVOKE ALL ON public.lavanderia_eventos            FROM anon;
REVOKE ALL ON public.taludes                       FROM anon;
REVOKE ALL ON public.talude_maps                   FROM anon;
REVOKE ALL ON public.taludes_programacao           FROM anon;
REVOKE ALL ON public.taludes_clima_config          FROM anon;
REVOKE ALL ON public.taludes_clima_snapshot        FROM anon;

-- 3) user_roles: políticas explícitas admin-only para INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "admins insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "admins update roles" ON public.user_roles;
DROP POLICY IF EXISTS "admins delete roles" ON public.user_roles;

CREATE POLICY "admins insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admins update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admins delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) profiles: SELECT restrito a próprio ou admin
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
CREATE POLICY "own or admin select profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 5) reminders: ownership em INSERT/UPDATE/DELETE (SELECT continua compartilhado com a equipe)
DROP POLICY IF EXISTS "Reminders insertable by authenticated" ON public.reminders;
DROP POLICY IF EXISTS "Reminders updatable by authenticated" ON public.reminders;
DROP POLICY IF EXISTS "Reminders deletable by authenticated" ON public.reminders;

CREATE POLICY "reminders insert own" ON public.reminders
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "reminders update own or admin" ON public.reminders
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "reminders delete own or admin" ON public.reminders
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 6) taludes_programacao: UPDATE/DELETE restritos a dono ou admin
DROP POLICY IF EXISTS "auth update taludes_programacao" ON public.taludes_programacao;
DROP POLICY IF EXISTS "auth delete taludes_programacao" ON public.taludes_programacao;

CREATE POLICY "programacao update own or admin" ON public.taludes_programacao
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "programacao delete own or admin" ON public.taludes_programacao
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 7) legal_items: SELECT permanece compartilhado; INSERT/UPDATE/DELETE restritos
DROP POLICY IF EXISTS "Legal items insertable by authenticated" ON public.legal_items;
DROP POLICY IF EXISTS "Legal items updatable by authenticated" ON public.legal_items;
DROP POLICY IF EXISTS "Legal items deletable by authenticated" ON public.legal_items;

CREATE POLICY "legal_items insert own" ON public.legal_items
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "legal_items update own or admin" ON public.legal_items
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "legal_items delete admin" ON public.legal_items
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 8) legal_item_executions: ownership por executado_por
DROP POLICY IF EXISTS "Executions insertable by authenticated" ON public.legal_item_executions;
DROP POLICY IF EXISTS "Executions updatable by authenticated" ON public.legal_item_executions;
DROP POLICY IF EXISTS "Executions deletable by authenticated" ON public.legal_item_executions;

CREATE POLICY "executions insert own" ON public.legal_item_executions
  FOR INSERT TO authenticated
  WITH CHECK (executado_por = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "executions update own or admin" ON public.legal_item_executions
  FOR UPDATE TO authenticated
  USING (executado_por = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (executado_por = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "executions delete own or admin" ON public.legal_item_executions
  FOR DELETE TO authenticated
  USING (executado_por = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 9) legal_item_attachments: ownership por uploaded_by; SELECT segue compartilhado
DROP POLICY IF EXISTS "Attachments insertable by authenticated" ON public.legal_item_attachments;
DROP POLICY IF EXISTS "Attachments deletable by authenticated" ON public.legal_item_attachments;

CREATE POLICY "attachments insert own" ON public.legal_item_attachments
  FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "attachments delete own or admin" ON public.legal_item_attachments
  FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 10) Storage bucket legal-certificates: exige anexo correspondente para acesso
DROP POLICY IF EXISTS "Legal certs read auth" ON storage.objects;
DROP POLICY IF EXISTS "Legal certs insert auth" ON storage.objects;
DROP POLICY IF EXISTS "Legal certs update auth" ON storage.objects;
DROP POLICY IF EXISTS "Legal certs delete auth" ON storage.objects;

CREATE POLICY "legal-certs read via attachment" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'legal-certificates'
    AND EXISTS (
      SELECT 1 FROM public.legal_item_attachments a
      WHERE a.storage_path = storage.objects.name
    )
  );

-- INSERT: qualquer autenticado pode subir; a linha em legal_item_attachments
-- exige uploaded_by = auth.uid(), então o arquivo fica "vinculado" pelo caminho.
CREATE POLICY "legal-certs insert auth" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'legal-certificates');

CREATE POLICY "legal-certs update own or admin" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'legal-certificates'
    AND EXISTS (
      SELECT 1 FROM public.legal_item_attachments a
      WHERE a.storage_path = storage.objects.name
        AND (a.uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  )
  WITH CHECK (bucket_id = 'legal-certificates');

CREATE POLICY "legal-certs delete own or admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'legal-certificates'
    AND EXISTS (
      SELECT 1 FROM public.legal_item_attachments a
      WHERE a.storage_path = storage.objects.name
        AND (a.uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
    )
  );

-- 11) Índices de performance em colunas de filtro/ordenação usadas com frequência
CREATE INDEX IF NOT EXISTS idx_backorder_os_finalizado_data      ON public.backorder_os (finalizado, data_solicitacao);
CREATE INDEX IF NOT EXISTS idx_backorder_os_prioridade           ON public.backorder_os (is_prioridade) WHERE is_prioridade = true;
CREATE INDEX IF NOT EXISTS idx_reminders_data                    ON public.reminders (data);
CREATE INDEX IF NOT EXISTS idx_reminders_created_by              ON public.reminders (created_by);
CREATE INDEX IF NOT EXISTS idx_legal_items_created_by            ON public.legal_items (created_by);
CREATE INDEX IF NOT EXISTS idx_legal_item_executions_item        ON public.legal_item_executions (item_id, data_execucao DESC);
CREATE INDEX IF NOT EXISTS idx_legal_item_attachments_item       ON public.legal_item_attachments (item_id);
CREATE INDEX IF NOT EXISTS idx_taludes_programacao_user_data     ON public.taludes_programacao (user_id, data_programada);
CREATE INDEX IF NOT EXISTS idx_taludes_owner                     ON public.taludes (owner_id);
CREATE INDEX IF NOT EXISTS idx_taludes_map                       ON public.taludes (map_id);
CREATE INDEX IF NOT EXISTS idx_lavanderia_eventos_data           ON public.lavanderia_eventos (data DESC);
CREATE INDEX IF NOT EXISTS idx_lavanderia_eventos_codigo         ON public.lavanderia_eventos (codigo);
CREATE INDEX IF NOT EXISTS idx_user_roles_user                   ON public.user_roles (user_id);
