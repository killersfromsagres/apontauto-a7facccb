CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  module_key text,
  severity text NOT NULL DEFAULT 'info',
  link_url text,
  target_user_id uuid,
  created_by uuid,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, user_id)
);

CREATE INDEX notifications_created_at_idx ON public.notifications (created_at DESC);
CREATE INDEX notifications_target_user_idx ON public.notifications (target_user_id);
CREATE INDEX notification_reads_user_idx ON public.notification_reads (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
GRANT SELECT, INSERT, DELETE ON public.notification_reads TO authenticated;
GRANT ALL ON public.notification_reads TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_destinatario" ON public.notifications
FOR SELECT TO authenticated
USING (
  target_user_id = auth.uid()
  OR (
    target_user_id IS NULL
    AND (module_key IS NULL OR public.can_access_module(module_key, 'read'))
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "notifications_insert_admin" ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.can_access_module('notificacoes-admin', 'read')
);

CREATE POLICY "notifications_update_admin" ON public.notifications
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.can_access_module('notificacoes-admin', 'read')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.can_access_module('notificacoes-admin', 'read')
);

CREATE POLICY "notifications_delete_admin" ON public.notifications
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.can_access_module('notificacoes-admin', 'read')
);

CREATE POLICY "notification_reads_select_own" ON public.notification_reads
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "notification_reads_insert_own" ON public.notification_reads
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "notification_reads_delete_own" ON public.notification_reads
FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER trg_notifications_updated_at
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();