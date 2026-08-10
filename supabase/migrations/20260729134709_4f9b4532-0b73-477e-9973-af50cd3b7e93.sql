CREATE OR REPLACE FUNCTION public.audit_redact(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE k text; v jsonb; out_j jsonb := '{}'::jsonb; t text;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN RETURN payload; END IF;
  FOR k, v IN SELECT key, value FROM jsonb_each(payload) LOOP
    IF k ~* '(senha|password|token|secret|segredo|api[_-]?key|chave|delete_url|authorization|credential)' THEN
      out_j := out_j || jsonb_build_object(k, '[REDACTED]');
    ELSIF k ~* '^cpf$' THEN
      t := nullif(regexp_replace(coalesce(v #>> '{}', ''), '\D', '', 'g'), '');
      out_j := out_j || jsonb_build_object(k, CASE WHEN t IS NULL THEN NULL
        ELSE repeat('*', greatest(length(t) - 3, 0)) || right(t, 3) END);
    ELSIF jsonb_typeof(v) = 'string' AND length(v #>> '{}') > 2000 THEN
      out_j := out_j || jsonb_build_object(k, '[TRUNCATED]');
    ELSIF jsonb_typeof(v) = 'string' AND (v #>> '{}') ~ '^data:[^;]+;base64,' THEN
      out_j := out_j || jsonb_build_object(k, '[BINARY]');
    ELSE
      out_j := out_j || jsonb_build_object(k, v);
    END IF;
  END LOOP;
  RETURN out_j;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.audit_redact(jsonb) FROM anon, public;