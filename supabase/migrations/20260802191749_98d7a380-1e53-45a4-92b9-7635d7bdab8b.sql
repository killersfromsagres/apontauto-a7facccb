-- 4. Create OsConsolidada Record Function for Dashboard Lists
-- This replaces the direct view access for lists, allowing high-performance filtering.

CREATE OR REPLACE FUNCTION public.gestao_os_consolidada(
  p_dias integer DEFAULT 30,
  p_modulo text DEFAULT NULL,
  p_equipe text DEFAULT NULL,
  p_predio text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_criticidade text DEFAULT NULL,
  p_limit integer DEFAULT 800
)
RETURNS SETOF public.vw_gestao_os_consolidada
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.vw_gestao_os_consolidada
  WHERE 
    (p_modulo IS NULL OR origem = p_modulo)
    AND (p_equipe IS NULL OR equipe = p_equipe)
    AND (p_predio IS NULL OR predio = p_predio)
    AND (p_status IS NULL OR status_canonico = p_status)
    AND (p_criticidade IS NULL OR criticidade = p_criticidade)
    AND (
      status_canonico NOT IN ('concluida', 'cancelada')
      OR criado_em >= (now() - (coalesce(p_dias, 30) || ' days')::interval)
    )
  ORDER BY 
    CASE 
      WHEN status_canonico NOT IN ('concluida','cancelada') THEN 0
      ELSE 1
    END,
    CASE 
      WHEN criticidade IN ('alta','critica','crítica') THEN 0
      WHEN criticidade = 'media' THEN 1
      ELSE 2
    END,
    criado_em DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.gestao_os_consolidada(integer, text, text, text, text, text, integer) TO authenticated, service_role;
