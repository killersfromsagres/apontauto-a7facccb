CREATE OR REPLACE FUNCTION public.backorder_dashboard_v2(p_ano integer DEFAULT NULL::integer, p_equipe text DEFAULT NULL::text, p_status_cat text DEFAULT NULL::text, p_predio text DEFAULT NULL::text, p_solicitante text DEFAULT NULL::text, p_criticidade text DEFAULT NULL::text, p_row_limit integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT public.can_access_backorder('read') THEN
    RAISE EXCEPTION 'sem permissao para backorder';
  END IF;

  WITH base AS (
    SELECT b.*,
      coalesce(nullif(b.status_cat,''),'aberto') AS sc,
      EXTRACT(YEAR FROM b.data_solicitacao)::int AS ano,
      to_char(b.data_solicitacao,'YYYY-MM') AS mes,
      coalesce(nullif(b.outros,''),'NÃO INFORMADO') AS solic
    FROM public.backorder_os b
    WHERE (p_ano IS NULL OR EXTRACT(YEAR FROM b.data_solicitacao)::int = p_ano)
      AND (p_equipe IS NULL OR b.equipe = p_equipe)
      AND (p_status_cat IS NULL OR coalesce(nullif(b.status_cat,''),'aberto') = p_status_cat)
      AND (p_predio IS NULL OR coalesce(nullif(b.predio,''),'—') = p_predio)
      AND (p_solicitante IS NULL OR coalesce(nullif(b.outros,''),'NÃO INFORMADO') = p_solicitante)
      AND (p_criticidade IS NULL OR coalesce(nullif(b.criticidade,''),'NÃO INFORMADA') = p_criticidade)
  )
  SELECT jsonb_build_object(
    'kpis', (SELECT jsonb_build_object(
      'total', count(*),
      'abertos', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao','aguardando_aprovacao','nao_validado')),
      'backorder', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao','aguardando_aprovacao','nao_validado') AND data_solicitacao < now() - interval '30 days'),
      'concluidos', count(*) FILTER (WHERE sc IN ('concluido','fechado','validado')),
      'cancelados', count(*) FILTER (WHERE sc IN ('cancelado','nao_executada')),
      'aguardandoAprovacao', count(*) FILTER (WHERE sc = 'aguardando_aprovacao'),
      'vencidos', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao','aguardando_aprovacao','nao_validado') AND termino_sla IS NOT NULL AND termino_sla < now()),
      'vencendo48h', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao','aguardando_aprovacao','nao_validado') AND termino_sla >= now() AND termino_sla < now() + interval '48 hours'),
      'criticos', count(*) FILTER (WHERE upper(coalesce(criticidade,'')) LIKE 'ALTA%'),
      'tempoMedioDias', coalesce(round(avg(EXTRACT(EPOCH FROM (coalesce(data_conclusao,data_finalizacao) - data_solicitacao))/86400)
        FILTER (WHERE sc IN ('concluido','fechado','validado') AND coalesce(data_conclusao,data_finalizacao) IS NOT NULL),1),0),
      'primeiroAno', min(ano), 'ultimoAno', max(ano)
    ) FROM base),
    'porStatus', coalesce((SELECT jsonb_object_agg(sc, n) FROM (SELECT sc, count(*) n FROM base GROUP BY sc) t),'{}'::jsonb),
    'porAno', coalesce((SELECT jsonb_agg(x ORDER BY x->>'ano') FROM (
      SELECT jsonb_build_object('ano', ano::text,'total',count(*),
        'concluidos', count(*) FILTER (WHERE sc IN ('concluido','fechado','validado')),
        'cancelados', count(*) FILTER (WHERE sc IN ('cancelado','nao_executada')),
        'aguardando', count(*) FILTER (WHERE sc='aguardando_aprovacao'),
        'abertos', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao','aguardando_aprovacao','nao_validado'))) AS x
      FROM base WHERE ano IS NOT NULL GROUP BY ano) t),'[]'::jsonb),
    'porMes', coalesce((SELECT jsonb_agg(x ORDER BY x->>'mes') FROM (
      SELECT jsonb_build_object('mes', mes,'total',count(*),
        'concluidos', count(*) FILTER (WHERE sc IN ('concluido','fechado','validado')),
        'cancelados', count(*) FILTER (WHERE sc IN ('cancelado','nao_executada')),
        'aguardando', count(*) FILTER (WHERE sc='aguardando_aprovacao'),
        'abertos', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao','aguardando_aprovacao','nao_validado'))) AS x
      FROM base WHERE mes IS NOT NULL GROUP BY mes) t),'[]'::jsonb),
    'porEquipe', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('name', coalesce(nullif(equipe,''),'Outros'),'total',count(*),
        'concluidos', count(*) FILTER (WHERE sc IN ('concluido','fechado','validado')),
        'cancelados', count(*) FILTER (WHERE sc IN ('cancelado','nao_executada')),
        'abertos', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao','aguardando_aprovacao','nao_validado'))) AS x
      FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 12) t),'[]'::jsonb),
    'porCategoria', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('name', coalesce(nullif(atividade,''),'Outros'),'value',count(*)) AS x
      FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 12) t),'[]'::jsonb),
    'porCriticidade', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('name', coalesce(nullif(criticidade,''),'NÃO INFORMADA'),'value',count(*)) AS x
      FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 8) t),'[]'::jsonb),
    'porPredio', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('name', coalesce(nullif(predio,''),'—'),'value',count(*)) AS x
      FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 12) t),'[]'::jsonb),
    'avaliacaoPendente', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('nome', solic,
        'total', count(*),
        'concluidos', count(*) FILTER (WHERE sc IN ('concluido','fechado','validado')),
        'aguardando', count(*) FILTER (WHERE sc='aguardando_aprovacao'),
        'oss', (array_agg(os ORDER BY data_solicitacao DESC))[1:40]) AS x
      FROM base WHERE sc IN ('concluido','fechado','validado','aguardando_aprovacao')
      GROUP BY solic ORDER BY count(*) DESC LIMIT 200) t),'[]'::jsonb),
    'cancelados', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('os', os,'nome',nome,'equipe',equipe,'predio',predio,
        'solicitante', solic,'statusOrigem',status_origem,'statusCat',sc,
        'dataSolicitacao', data_solicitacao,'dataConclusao', coalesce(data_conclusao,data_finalizacao)) AS x
      FROM base WHERE sc IN ('cancelado','nao_executada') ORDER BY data_solicitacao DESC LIMIT 500) t),'[]'::jsonb),
    'rows', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('os', os,'nome',nome,'equipe',equipe,'atividade',atividade,
        'predio',predio,'andar',andar,'espaco',espaco,'criticidade',criticidade,
        'solicitante', solic,'statusCat',sc,'statusOrigem',status_origem,
        'dataSolicitacao', data_solicitacao,'terminoSla',termino_sla,
        'dataConclusao', coalesce(data_conclusao,data_finalizacao)) AS x
      FROM base ORDER BY data_solicitacao DESC LIMIT greatest(coalesce(p_row_limit,300),1)) t),'[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$function$;