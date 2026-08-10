CREATE OR REPLACE FUNCTION public.tg_audit_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_module text := coalesce(TG_ARGV[0], TG_TABLE_NAME);
  v_origin text := coalesce(nullif(current_setting('app.origin', true), ''), 'web');
  v_meta jsonb := jsonb_build_object('origin', v_origin);
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_events(user_id, event_type, entity_type, entity_id, module_key, action, new_data, metadata)
    VALUES (auth.uid(), 'insert', TG_TABLE_NAME, (to_jsonb(NEW)->>'id'), v_module, 'create', public.audit_redact(to_jsonb(NEW)), v_meta);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_events(user_id, event_type, entity_type, entity_id, module_key, action, old_data, new_data, metadata)
    VALUES (auth.uid(), 'update', TG_TABLE_NAME, (to_jsonb(NEW)->>'id'), v_module, 'update', public.audit_redact(to_jsonb(OLD)), public.audit_redact(to_jsonb(NEW)), v_meta);
    RETURN NEW;
  ELSE
    INSERT INTO public.audit_events(user_id, event_type, entity_type, entity_id, module_key, action, old_data, metadata)
    VALUES (auth.uid(), 'delete', TG_TABLE_NAME, (to_jsonb(OLD)->>'id'), v_module, 'delete', public.audit_redact(to_jsonb(OLD)), v_meta);
    RETURN OLD;
  END IF;
END;
$function$;

CREATE INDEX IF NOT EXISTS idx_audit_events_user ON public.audit_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_module ON public.audit_events (module_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON public.audit_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_uma_user_module ON public.user_module_access (user_id, module_key);
CREATE INDEX IF NOT EXISTS idx_user_pcm_roles_user ON public.user_pcm_roles (user_id, role_key);