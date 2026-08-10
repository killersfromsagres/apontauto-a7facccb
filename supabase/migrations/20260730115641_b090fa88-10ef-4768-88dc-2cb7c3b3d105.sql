-- Item 24 — evita N+1 na reordenação da programação.
CREATE OR REPLACE FUNCTION public.agua_reordenar_programacao(itens jsonb)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH dados AS (
    SELECT (e->>'id')::uuid AS id, (e->>'ordem')::int AS ordem
    FROM jsonb_array_elements(COALESCE(itens, '[]'::jsonb)) AS e
  ), atualizado AS (
    UPDATE public.agua_programacao p
    SET ordem = d.ordem
    FROM dados d
    WHERE p.id = d.id AND p.ordem IS DISTINCT FROM d.ordem
    RETURNING p.id
  )
  SELECT count(*)::int FROM atualizado;
$$;

REVOKE ALL ON FUNCTION public.agua_reordenar_programacao(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agua_reordenar_programacao(jsonb) TO authenticated;
