DROP POLICY IF EXISTS audit_events_read ON public.audit_events;
CREATE POLICY audit_events_read ON public.audit_events
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR can_access_module('auditoria', 'read')
  OR EXISTS (SELECT 1 FROM public.user_pcm_roles ur
              WHERE ur.user_id = auth.uid()
                AND ur.role_key = ANY (ARRAY['auditor','proprietario']))
);