CREATE OR REPLACE FUNCTION public.admin_readonly_query(_sql text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q text := btrim(coalesce(_sql, ''));
  low text;
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem consultar dados.';
  END IF;

  q := regexp_replace(q, ';+\s*$', '');
  low := lower(q);

  IF low !~ '^(select|with)\s' THEN
    RAISE EXCEPTION 'Somente consultas de leitura (SELECT) são permitidas.';
  END IF;
  IF position(';' in q) > 0 THEN
    RAISE EXCEPTION 'Apenas uma consulta por vez.';
  END IF;
  IF low ~ '\m(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|call|do|merge|refresh|comment|reindex|set|reset|listen|notify|lock)\M' THEN
    RAISE EXCEPTION 'Comando não permitido em consulta de leitura.';
  END IF;
  IF low ~ '\m(auth|vault|storage|pg_catalog|information_schema|pg_shadow|pg_authid)\s*\.' THEN
    RAISE EXCEPTION 'Esquema restrito.';
  END IF;
  IF low ~ 'pg_read_file|pg_ls_dir|dblink|pg_sleep|lo_import|lo_export' THEN
    RAISE EXCEPTION 'Função não permitida.';
  END IF;

  EXECUTE format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s limit 500) t', q) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_readonly_query(text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_readonly_query(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_readonly_query(text) TO service_role;