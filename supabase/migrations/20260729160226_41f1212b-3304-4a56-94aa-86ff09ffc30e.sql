CREATE TABLE public.client_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  origin text NOT NULL DEFAULT 'client',
  level text NOT NULL DEFAULT 'error',
  message text NOT NULL,
  detail text,
  route text,
  module_key text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.client_error_logs TO authenticated;
GRANT ALL ON public.client_error_logs TO service_role;

ALTER TABLE public.client_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth can log errors" ON public.client_error_logs
  FOR INSERT TO authenticated WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "tech panel can read errors" ON public.client_error_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.can_access_module('observabilidade', 'read'));

CREATE INDEX idx_client_error_logs_created ON public.client_error_logs (created_at DESC);
CREATE INDEX idx_client_error_logs_level ON public.client_error_logs (level, created_at DESC);

CREATE TABLE public.integration_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  message text,
  duration_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.integration_heartbeats TO authenticated;
GRANT ALL ON public.integration_heartbeats TO service_role;

ALTER TABLE public.integration_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth can send heartbeat" ON public.integration_heartbeats
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "tech panel can read heartbeats" ON public.integration_heartbeats
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.can_access_module('observabilidade', 'read'));

CREATE INDEX idx_integration_heartbeats_recent ON public.integration_heartbeats (integration, created_at DESC);

INSERT INTO public.pcm_permissions (key, module_key, action, label)
VALUES ('observabilidade:read', 'observabilidade', 'read', 'Painel técnico — leitura')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT r.key, 'observabilidade:read' FROM public.pcm_roles r WHERE r.key IN ('admin','pcm_gestor')
ON CONFLICT DO NOTHING;