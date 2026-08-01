-- 1) Normalizador de status (coluna G)
CREATE OR REPLACE FUNCTION public.backorder_status_cat(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN s IS NULL OR s = '' THEN 'aberto'
    WHEN s LIKE '%CANCEL%' OR s LIKE '%RECUSAD%' OR s LIKE '%REPROVAD%' THEN 'cancelado'
    WHEN s LIKE '%NAO EXECUTAD%' OR s LIKE '%NAO REALIZAD%' THEN 'nao_executada'
    WHEN s LIKE '%NAO VALIDAD%' THEN 'nao_validado'
    WHEN s LIKE '%AGUARDANDO APROVA%' OR s LIKE '%AGUARD%APROVA%' OR s LIKE '%APROVACAO PENDENTE%' THEN 'aguardando_aprovacao'
    WHEN s LIKE '%EM EXECU%' OR s LIKE '%EXECUCAO%' OR s LIKE '%ANDAMENTO%' THEN 'em_execucao'
    WHEN s LIKE '%PROGRAMAD%' OR s LIKE '%AGENDAD%' THEN 'programado'
    WHEN s LIKE '%VALIDAD%' THEN 'validado'
    WHEN s LIKE '%CONCLU%' OR s LIKE '%FINALIZAD%' OR s LIKE '%ATENDID%' OR s LIKE '%RESOLVID%' THEN 'concluido'
    WHEN s LIKE '%FECHAD%' OR s LIKE '%ENCERRAD%' THEN 'fechado'
    WHEN s LIKE '%PENDENTE%' THEN 'pendente'
    WHEN s LIKE '%ABERT%' THEN 'aberto'
    ELSE 'aberto'
  END
  FROM (SELECT upper(translate(coalesce(trim(p_status),''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))) AS t(s);
$$;

-- 2) Coluna de status detalhado
ALTER TABLE public.backorder_os
  ADD COLUMN IF NOT EXISTS status_cat text NOT NULL DEFAULT 'aberto';

CREATE INDEX IF NOT EXISTS idx_backorder_os_status_cat
  ON public.backorder_os (status_cat, data_solicitacao DESC);
-- 3) Trigger: mantém status_cat/flags coerentes com o status de origem
CREATE OR REPLACE FUNCTION public.tg_backorder_status_cat()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status_cat IS NULL OR NEW.status_cat = '' OR NEW.status_cat = 'aberto' THEN
    NEW.status_cat := public.backorder_status_cat(NEW.status_origem);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS backorder_os_status_cat ON public.backorder_os;
CREATE TRIGGER backorder_os_status_cat
  BEFORE INSERT OR UPDATE ON public.backorder_os
  FOR EACH ROW EXECUTE FUNCTION public.tg_backorder_status_cat();

-- 4) Limpeza total corrigida (DELETE com WHERE explícito)
CREATE OR REPLACE FUNCTION public.backorder_clear_all()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n bigint;
BEGIN
  IF NOT public.can_access_backorder('update') THEN
    RAISE EXCEPTION 'Sem permissão para limpar o backorder';
  END IF;
  SELECT count(*) INTO n FROM public.backorder_os;
  DELETE FROM public.backorder_os WHERE os IS NOT NULL;
  RETURN n;
END;
$$;

-- 5) Dashboard v2 — recorte por ano + status detalhado + solicitantes
CREATE OR REPLACE FUNCTION public.backorder_dashboard_v2(
  p_ano integer DEFAULT NULL,
  p_equipe text DEFAULT NULL,
  p_status_cat text DEFAULT NULL,
  p_predio text DEFAULT NULL,
  p_solicitante text DEFAULT NULL,
  p_criticidade text DEFAULT NULL,
  p_row_limit integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
      'abertos', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao')),
      'concluidos', count(*) FILTER (WHERE sc IN ('concluido','fechado','validado')),
      'cancelados', count(*) FILTER (WHERE sc IN ('cancelado','nao_executada')),
      'aguardandoAprovacao', count(*) FILTER (WHERE sc = 'aguardando_aprovacao'),
      'vencidos', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao') AND termino_sla IS NOT NULL AND termino_sla < now()),
      'vencendo48h', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao') AND termino_sla >= now() AND termino_sla < now() + interval '48 hours'),
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
        'abertos', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao'))) AS x
      FROM base WHERE ano IS NOT NULL GROUP BY ano) t),'[]'::jsonb),
    'porMes', coalesce((SELECT jsonb_agg(x ORDER BY x->>'mes') FROM (
      SELECT jsonb_build_object('mes', mes,'total',count(*),
        'concluidos', count(*) FILTER (WHERE sc IN ('concluido','fechado','validado')),
        'cancelados', count(*) FILTER (WHERE sc IN ('cancelado','nao_executada')),
        'aguardando', count(*) FILTER (WHERE sc='aguardando_aprovacao'),
        'abertos', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao'))) AS x
      FROM base WHERE mes IS NOT NULL GROUP BY mes) t),'[]'::jsonb),
    'porEquipe', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('name', coalesce(nullif(equipe,''),'Outros'),'total',count(*),
        'concluidos', count(*) FILTER (WHERE sc IN ('concluido','fechado','validado')),
        'cancelados', count(*) FILTER (WHERE sc IN ('cancelado','nao_executada')),
        'abertos', count(*) FILTER (WHERE sc IN ('aberto','pendente','programado','em_execucao'))) AS x
      FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 12) t),'[]'::jsonb),
    'porCategoria', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('name', coalesce(nullif(atividade,''),'Outros'),'value',count(*)) AS x
      FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 12) t),'[]'::jsonb),
    'porCriticidade', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('name', coalesce(nullif(criticidade,''),'NÃO INFORMADA'),'value',count(*)) AS x
      FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 8) t),'[]'::jsonb),
    'porPredio', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('name', coalesce(nullif(predio,''),'—'),'value',count(*)) AS x
      FROM base GROUP BY 1 ORDER BY count(*) DESC LIMIT 10) t),'[]'::jsonb),
    'avaliacaoPendente', coalesce((SELECT jsonb_agg(x ORDER BY (x->>'total')::int DESC) FROM (
      SELECT jsonb_build_object('nome', solic,
        'total', count(*),
        'concluidos', count(*) FILTER (WHERE sc IN ('concluido','fechado','validado')),
        'aguardando', count(*) FILTER (WHERE sc='aguardando_aprovacao'),
        'oss', (array_agg(os ORDER BY data_solicitacao DESC))[1:25]) AS x
      FROM base WHERE sc IN ('concluido','fechado','validado','aguardando_aprovacao')
      GROUP BY solic) t),'[]'::jsonb),
    'cancelados', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('os', os,'nome',nome,'equipe',equipe,'predio',predio,
        'solicitante', solic,'statusOrigem',status_origem,'statusCat',sc,
        'dataSolicitacao', data_solicitacao,'dataConclusao', coalesce(data_conclusao,data_finalizacao)) AS x
      FROM base WHERE sc IN ('cancelado','nao_executada')
      ORDER BY data_solicitacao DESC LIMIT 500) t),'[]'::jsonb),
    'rows', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('os', os,'nome',nome,'equipe',equipe,'atividade',atividade,
        'predio',predio,'andar',andar,'espaco',espaco,'criticidade',criticidade,
        'solicitante', solic,'statusCat',sc,'statusOrigem',status_origem,
        'dataSolicitacao', data_solicitacao,'terminoSla',termino_sla,
        'dataConclusao', coalesce(data_conclusao,data_finalizacao)) AS x
      FROM base ORDER BY data_solicitacao DESC NULLS LAST LIMIT greatest(coalesce(p_row_limit,300),1)) t),'[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

-- 6) Filtros incluindo status detalhado
CREATE OR REPLACE FUNCTION public.backorder_dashboard_filtros()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.can_access_backorder('read') THEN
    RAISE EXCEPTION 'sem permissao para backorder';
  END IF;
  SELECT jsonb_build_object(
    'equipes', coalesce((SELECT jsonb_agg(DISTINCT equipe) FROM public.backorder_os WHERE nullif(equipe,'') IS NOT NULL),'[]'::jsonb),
    'categorias', coalesce((SELECT jsonb_agg(DISTINCT atividade) FROM public.backorder_os WHERE nullif(atividade,'') IS NOT NULL),'[]'::jsonb),
    'criticidades', coalesce((SELECT jsonb_agg(DISTINCT criticidade) FROM public.backorder_os WHERE nullif(criticidade,'') IS NOT NULL),'[]'::jsonb),
    'predios', coalesce((SELECT jsonb_agg(DISTINCT predio) FROM public.backorder_os WHERE nullif(predio,'') IS NOT NULL),'[]'::jsonb),
    'solicitantes', coalesce((SELECT jsonb_agg(DISTINCT outros) FROM public.backorder_os WHERE nullif(outros,'') IS NOT NULL),'[]'::jsonb),
    'statusCats', coalesce((SELECT jsonb_agg(DISTINCT coalesce(nullif(status_cat,''),'aberto')) FROM public.backorder_os),'[]'::jsonb),
    'anos', coalesce((SELECT jsonb_agg(DISTINCT EXTRACT(YEAR FROM data_solicitacao)::int) FROM public.backorder_os WHERE data_solicitacao IS NOT NULL),'[]'::jsonb)
  ) INTO r;
  RETURN r;
END;
$$;

-- 7) Limpeza solicitada da base atual
DELETE FROM public.backorder_os WHERE os IS NOT NULL;
