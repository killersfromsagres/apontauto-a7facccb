-- 1) Extensão da tabela notifications
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'informacao',
  ADD COLUMN IF NOT EXISTS target_mode text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS deep_link text,
  ADD COLUMN IF NOT EXISTS starts_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS requires_ack boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_target_mode_chk,
  DROP CONSTRAINT IF EXISTS notifications_status_chk,
  DROP CONSTRAINT IF EXISTS notifications_category_chk;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_target_mode_chk
    CHECK (target_mode IN ('all','users','roles','modules','teams')),
  ADD CONSTRAINT notifications_status_chk
    CHECK (status IN ('draft','scheduled','published','paused','cancelled')),
  ADD CONSTRAINT notifications_category_chk
    CHECK (category IN ('informacao','sucesso','atencao','critico','manutencao','clima','pt','seguranca'));

-- 2) Público-alvo
CREATE TABLE IF NOT EXISTS public.notification_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid,
  role_key text,
  module_key text,
  team_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_targets_notif_idx ON public.notification_targets (notification_id);
CREATE INDEX IF NOT EXISTS notification_targets_user_idx ON public.notification_targets (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_targets TO authenticated;
GRANT ALL ON public.notification_targets TO service_role;
ALTER TABLE public.notification_targets ENABLE ROW LEVEL SECURITY;

-- 3) Recibos
CREATE TABLE IF NOT EXISTS public.notification_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  acknowledged_at timestamptz,
  UNIQUE (notification_id, user_id)
);
CREATE INDEX IF NOT EXISTS notification_receipts_user_idx ON public.notification_receipts (user_id);

GRANT SELECT, INSERT, UPDATE ON public.notification_receipts TO authenticated;
GRANT ALL ON public.notification_receipts TO service_role;
ALTER TABLE public.notification_receipts ENABLE ROW LEVEL SECURITY;

-- 4) Função de visibilidade (security definer)
CREATE OR REPLACE FUNCTION public.notification_is_for_me(_notification_id uuid, _target_mode text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN _target_mode = 'all' THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.notification_targets t
       WHERE t.notification_id = _notification_id
         AND (
           t.user_id = auth.uid()
           OR (t.role_key IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.user_pcm_roles ur
                 WHERE ur.user_id = auth.uid() AND ur.role_key = t.role_key))
           OR (t.module_key IS NOT NULL AND public.can_access_module(t.module_key, 'read'))
           OR (t.team_key IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.maintenance_teams mt
                 WHERE mt.user_id = auth.uid() AND lower(mt.name) = lower(t.team_key)))
         )
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_notifications()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.can_access_module('notificacoes-admin', 'read');
$$;

-- 5) Políticas
DROP POLICY IF EXISTS "notifications_select_destinatario" ON public.notifications;
CREATE POLICY "notifications_select_destinatario" ON public.notifications
FOR SELECT TO authenticated
USING (
  public.can_manage_notifications()
  OR (
    status = 'published'
    AND starts_at <= now()
    AND (expires_at IS NULL OR expires_at > now())
    AND (target_user_id IS NULL OR target_user_id = auth.uid())
    AND public.notification_is_for_me(id, target_mode)
  )
);

DROP POLICY IF EXISTS "notification_targets_select" ON public.notification_targets;
CREATE POLICY "notification_targets_select" ON public.notification_targets
FOR SELECT TO authenticated
USING (public.can_manage_notifications() OR user_id = auth.uid());

DROP POLICY IF EXISTS "notification_targets_write" ON public.notification_targets;
CREATE POLICY "notification_targets_write" ON public.notification_targets
FOR ALL TO authenticated
USING (public.can_manage_notifications())
WITH CHECK (public.can_manage_notifications());

DROP POLICY IF EXISTS "notification_receipts_select_own" ON public.notification_receipts;
CREATE POLICY "notification_receipts_select_own" ON public.notification_receipts
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.can_manage_notifications());

DROP POLICY IF EXISTS "notification_receipts_insert_own" ON public.notification_receipts;
CREATE POLICY "notification_receipts_insert_own" ON public.notification_receipts
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notification_receipts_update_own" ON public.notification_receipts;
CREATE POLICY "notification_receipts_update_own" ON public.notification_receipts
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 6) Realtime
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;