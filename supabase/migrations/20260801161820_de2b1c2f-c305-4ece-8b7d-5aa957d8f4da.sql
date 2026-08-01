TRUNCATE TABLE public.backorder_os;

CREATE INDEX IF NOT EXISTS idx_backorder_os_data_sol ON public.backorder_os (data_solicitacao DESC);
CREATE INDEX IF NOT EXISTS idx_backorder_os_flags ON public.backorder_os (finalizado, cancelado);
CREATE INDEX IF NOT EXISTS idx_backorder_os_equipe ON public.backorder_os (equipe);
CREATE INDEX IF NOT EXISTS idx_backorder_os_predio ON public.backorder_os (predio);

CREATE OR REPLACE FUNCTION public.backorder_dashboard_stats(
  p_equipe text DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_criticidade text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_solicitante text DEFAULT NULL,
  p_predio text DEFAULT NULL,
  p_ano integer DEFAULT NULL,
  p_dias integer DEFAULT NULL,
  p_row_limit integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.can_access_backorder('read') THEN
    RAISE EXCEPTION 'sem permissao para backorder';
  END IF;

  WITH base AS (
    SELECT
      b.*,
      CASE WHEN b.cancelado THEN 'cancelado'
           WHEN b.finalizado THEN 'concluido'
           ELSE 'aberto' END AS st,
      EXTRACT(YEAR FROM b.data_solicitacao)::int AS ano,
      to_char(b.data_solicitacao, 'YYYY-MM') AS mes
    FROM public.backorder_os b
    WHERE (p_equipe IS NULL OR b.equipe = p_equipe)
      AND (p_categoria IS NULL OR b.atividade = p_categoria)
      AND (p_criticidade IS NULL OR coalesce(nullif(b.criticidade,''),'NÃO INFORMADA') = p_criticidade)
      AND (p_solicitante IS NULL OR coalesce(nullif(b.outros,''),'NÃO INFORMADO') = p_solicitante)
      AND (p_predio IS NULL OR coalesce(nullif(b.predio,''),'—') = p_predio)
      AND (p_ano IS NULL OR EXTRACT(YEAR FROM b.data_solicitacao)::int = p_ano)
      AND (p_dias IS NULL OR b.data_solicitacao >= now() - (p_dias || ' days')::interval)
      AND (p_status IS NULL OR p_status = (CASE WHEN b.cancelado THEN 'cancelado' WHEN b.finalizado THEN 'concluido' ELSE 'aberto' END))
  )
  SELECT jsonb_build_object(
    'kpis', (SELECT jsonb_build_object(
        'total', count(*),
        'concluidos', count(*) FILTER (WHERE st = 'concluido'),
        'cancelados', count(*) FILTER (WHERE st = 'cancelado'),
        'abertos', count(*) FILTER (WHERE st = 'aberto'),
        'vencidos', count(*) FILTER (WHERE st = 'aberto' AND termino_sla IS NOT NULL AND termino_sla < now()),
        'vencendo48h', count(*) FILTER (WHERE st = 'aberto' AND termino_sla IS NOT NULL AND termino_sla >= now() AND termino_sla < now() + interval '48 hours'),
        'criticos', count(*) FILTER (WHERE st = 'aberto' AND upper(coalesce(criticidade,'')) LIKE 'ALTA%'),
        'tempoMedioDias', coalesce(round(avg(EXTRACT(EPOCH FROM (coalesce(data_conclusao, data_finalizacao) - data_solicitacao))/86400) FILTER (WHERE st='concluido' AND coalesce(data_conclusao, data_finalizacao) IS NOT NULL AND data_solicitacao IS NOT NULL), 1), 0),
        'primeiroAno', min(ano), 'ultimoAno', max(ano)
      ) FROM base),
    'porAno', coalesce((SELECT jsonb_agg(x ORDER BY x->>'ano') FROM (
        SELECT jsonb_build_object('ano', ano::text,
          'total', count(*),
          'concluidos', count(*) FILTER (WHERE st='concluido'),
          'cancelados', count(*) FILTER (WHERE st='cancelado'),
          'abertos', count(*) FILTER (WHERE st='aberto')) AS x
        FROM base WHERE ano IS NOT NULL GROUP BY ano) t), '[]'::jsonb),
    'porMes', coalesce((SELECT jsonb_agg(x ORDER BY x->>'mes') FROM (
        SELECT jsonb_build_object('mes', mes,
          'total', count(*),
          'concluidos', count(*) FILTER (WHERE st='concluido'),
          'cancelados', count(*) FILTER (WHERE st='cancelado')) AS x
        FROM base WHERE mes IS NOT NULL GROUP BY mes) t), '[]'::jsonb),
    'porEquipe', coalesce((SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('name', coalesce(nullif(equipe,''),'Outros'),
          'total', count(*),
          'concluidos', count(*) FILTER (WHERE st='concluido'),
          'cancelados', count(*) FILTER (WHERE st='cancelado'),
          'abertos', count(*) FILTER (WHERE st='aberto')) AS x
        FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 15) t), '[]'::jsonb),
    'porCategoria', coalesce((SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('name', coalesce(nullif(atividade,''),'OUTROS'), 'value', count(*)) AS x
        FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 12) t), '[]'::jsonb),
    'porCriticidade', coalesce((SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('name', coalesce(nullif(criticidade,''),'NÃO INFORMADA'), 'value', count(*)) AS x
        FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 8) t), '[]'::jsonb),
    'porSolicitante', coalesce((SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('name', coalesce(nullif(outros,''),'NÃO INFORMADO'),
          'total', count(*), 'abertos', count(*) FILTER (WHERE st='aberto')) AS x
        FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 12) t), '[]'::jsonb),
    'porPredio', coalesce((SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('name', coalesce(nullif(predio,''),'—'), 'value', count(*)) AS x
        FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 10) t), '[]'::jsonb),
    'rows', coalesce((SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('os', os, 'nome', nome, 'equipe', equipe, 'atividade', atividade,
          'predio', predio, 'andar', andar, 'espaco', espaco, 'criticidade', criticidade,
          'solicitante', outros, 'status', st, 'statusOrigem', status_origem,
          'dataSolicitacao', data_solicitacao, 'terminoSla', termino_sla,
          'dataConclusao', coalesce(data_conclusao, data_finalizacao)) AS x
        FROM base ORDER BY data_solicitacao DESC NULLS LAST LIMIT greatest(coalesce(p_row_limit,300),1)) t), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.backorder_dashboard_filtros()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.can_access_backorder('read') THEN
    RAISE EXCEPTION 'sem permissao para backorder';
  END IF;
  SELECT jsonb_build_object(
    'equipes', coalesce((SELECT jsonb_agg(DISTINCT equipe) FROM public.backorder_os WHERE nullif(equipe,'') IS NOT NULL), '[]'::jsonb),
    'categorias', coalesce((SELECT jsonb_agg(DISTINCT atividade) FROM public.backorder_os WHERE nullif(atividade,'') IS NOT NULL), '[]'::jsonb),
    'criticidades', coalesce((SELECT jsonb_agg(DISTINCT criticidade) FROM public.backorder_os WHERE nullif(criticidade,'') IS NOT NULL), '[]'::jsonb),
    'predios', coalesce((SELECT jsonb_agg(DISTINCT predio) FROM public.backorder_os WHERE nullif(predio,'') IS NOT NULL), '[]'::jsonb),
    'solicitantes', coalesce((SELECT jsonb_agg(DISTINCT outros) FROM public.backorder_os WHERE nullif(outros,'') IS NOT NULL), '[]'::jsonb),
    'anos', coalesce((SELECT jsonb_agg(DISTINCT EXTRACT(YEAR FROM data_solicitacao)::int) FROM public.backorder_os WHERE data_solicitacao IS NOT NULL), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backorder_dashboard_stats(text,text,text,text,text,text,integer,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.backorder_dashboard_filtros() TO authenticated;