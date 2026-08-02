-- Phase 8 Revision: Refactoring Centro de Gestão for Robustness and Performance
-- Goal: Fix "aggregate functions are not allowed in GROUP BY" and optimize aggregations.

-- 1. Redefine status mapping (IMMUTABLE for indexing)
CREATE OR REPLACE FUNCTION public.gestao_status_canonico(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_status IS NULL OR btrim(p_status) = '' THEN 'aberta'
    WHEN lower(unaccent_safe.s) ~ '(cancel|nao executad|não executad)' THEN 'cancelada'
    WHEN lower(unaccent_safe.s) ~ '(conclu|finaliz|fechad|encerrad|validad|atendid)' THEN 'concluida'
    WHEN lower(unaccent_safe.s) ~ '(execu|andamento|iniciad|progress)' THEN 'andamento'
    WHEN lower(unaccent_safe.s) ~ '(aguard|aprova|pendente|analise|análise|programad)' THEN 'pendente'
    ELSE 'aberta'
  END
  FROM (SELECT btrim(p_status) AS s) unaccent_safe
$$;

-- 2. Consolidated View (security_invoker=on for RLS protection)
-- We rebuild it with clean aliases and robust lateral joins.
-- Using DROP VIEW CASCADE to ensure we can recreate it with new owner/structure.
DROP VIEW IF EXISTS public.vw_gestao_os_consolidada CASCADE;

CREATE OR REPLACE VIEW public.vw_gestao_os_consolidada
WITH (security_invoker = on) AS
WITH bo AS (
  SELECT
    'backorder'::text AS origem,
    b.os::text        AS id,
    b.os::text        AS numero_os,
    coalesce(nullif(btrim(b.nome), ''), b.atividade) AS descricao,
    b.ativo,
    NULL::text        AS patrimonio,
    b.predio, b.andar, b.espaco AS local,
    coalesce(nullif(btrim(b.equipe), ''), 'Não atribuída') AS equipe,
    NULL::text        AS tecnico,
    CASE WHEN b.is_prioridade THEN 'alta' ELSE coalesce(b.prioridade_nivel::text, 'normal') END AS prioridade,
    coalesce(nullif(btrim(b.criticidade), ''), 'media') AS criticidade,
    CASE
      WHEN b.cancelado THEN 'cancelada'
      WHEN b.finalizado THEN 'concluida'
      ELSE public.gestao_status_canonico(b.status_origem)
    END AS status_canonico,
    coalesce(nullif(btrim(b.status_origem), ''), 'indefinido') AS status_origem,
    b.data_solicitacao AS criado_em,
    NULL::timestamptz  AS inicio,
    coalesce(b.data_conclusao, b.data_finalizacao) AS conclusao,
    b.termino_sla      AS prazo_sla
  FROM public.backorder_os b
),
cor AS (
  SELECT
    'corretiva'::text AS origem,
    c.id::text AS id,
    c.numero_os,
    c.nome_os AS descricao,
    c.ativo,
    c.patrimonio,
    c.predio,
    c.andar,
    c.local,
    coalesce(nullif(btrim(c.equipe), ''), 'Não atribuída') AS equipe,
    c.assinatura_nome AS tecnico,
    coalesce(nullif(btrim(c.tipo), ''), 'normal') AS prioridade,
    'media'::text AS criticidade,
    public.gestao_status_canonico(c.status::text) AS status_canonico,
    coalesce(nullif(btrim(c.status::text), ''), 'indefinido') AS status_origem,
    coalesce(c.data_criacao, c.created_at) AS criado_em,
    c.inicio,
    c.fim AS conclusao,
    c.data_sla AS prazo_sla
  FROM public.corretiva_os c
),
refr AS (
  SELECT
    'refrigeracao'::text AS origem,
    r.id::text AS id,
    r.numero_os,
    r.nome_os AS descricao,
    r.ativo,
    r.patrimonio,
    r.predio,
    r.andar,
    r.local,
    coalesce(nullif(btrim(r.equipe), ''), 'Refrigeração') AS equipe,
    NULL::text AS tecnico,
    coalesce(nullif(btrim(r.tipo), ''), 'normal') AS prioridade,
    'media'::text AS criticidade,
    public.gestao_status_canonico(r.status::text) AS status_canonico,
    coalesce(nullif(btrim(r.status::text), ''), 'indefinido') AS status_origem,
    r.created_at AS criado_em,
    r.inicio,
    r.fim AS conclusao,
    r.data_sla AS prazo_sla
  FROM public.refrigeracao_os r
),
base AS (
  SELECT * FROM bo
  UNION ALL SELECT * FROM cor
  UNION ALL SELECT * FROM refr
)
SELECT
  b.origem, b.id, b.numero_os, b.descricao, b.ativo, b.patrimonio,
  b.predio, b.andar, b.local, b.equipe, b.tecnico, b.prioridade, b.criticidade,
  b.status_canonico, b.status_origem,
  b.criado_em, b.inicio, b.conclusao, b.prazo_sla,
  (b.status_canonico NOT IN ('concluida','cancelada')
     AND b.prazo_sla IS NOT NULL AND b.prazo_sla < now()) AS atrasada,
  CASE WHEN b.prazo_sla IS NULL THEN NULL
       ELSE floor(EXTRACT(epoch FROM (coalesce(b.conclusao, now()) - b.prazo_sla)) / 86400)::int
  END AS dias_atraso,
  CASE WHEN b.criado_em IS NULL THEN NULL
       ELSE floor(EXTRACT(epoch FROM (coalesce(b.conclusao, now()) - b.criado_em)) / 3600)::numeric
  END AS horas_atendimento,
  CASE WHEN b.inicio IS NULL OR b.conclusao IS NULL THEN NULL
       ELSE floor(EXTRACT(epoch FROM (b.conclusao - b.inicio)) / 3600)::numeric
  END AS horas_reparo,
  coalesce(pc.pendentes, 0) AS pecas_pendentes,
  coalesce(pb.total, 0)     AS problemas,
  -- Optimized reincidencia
  (SELECT count(*) FROM base b2 WHERE b2.ativo IS NOT NULL AND b2.ativo <> '' AND lower(btrim(b2.ativo)) = lower(btrim(b.ativo))) AS reincidencia
FROM base b
LEFT JOIN LATERAL (
  SELECT count(*) AS pendentes FROM (
    SELECT 1 FROM public.corretiva_pecas p WHERE b.origem = 'corretiva' AND p.os_id::text = b.id AND coalesce(p.status_gestor, 'pendente'::corretiva_status_gestor) = 'pendente'::corretiva_status_gestor
    UNION ALL
    SELECT 1 FROM public.refrigeracao_pecas p WHERE b.origem = 'refrigeracao' AND p.os_id::text = b.id AND coalesce(p.status_gestor, 'pendente'::refrig_status_gestor) = 'pendente'::refrig_status_gestor
  ) sub
) pc ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS total FROM (
    SELECT 1 FROM public.corretiva_problemas p WHERE b.origem = 'corretiva' AND p.os_id::text = b.id
    UNION ALL
    SELECT 1 FROM public.refrigeracao_problemas p WHERE b.origem = 'refrigeracao' AND p.os_id::text = b.id
  ) sub
) pb ON true;

GRANT SELECT ON public.vw_gestao_os_consolidada TO authenticated, service_role;

-- 3. Executive Overview v2 (Safe Aggregation Pattern)
CREATE OR REPLACE FUNCTION public.gestao_overview_v2(p_dias integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_d    integer     := greatest(coalesce(p_dias, 30), 1);
  v_ini  timestamptz := now() - (v_d || ' days')::interval;
  v_pini timestamptz := now() - ((v_d * 2) || ' days')::interval;
  v_out  jsonb;
BEGIN
  IF NOT public.can_access_gestao('read') THEN
    RAISE EXCEPTION 'Sem permissão para o Centro de Gestão';
  END IF;

  WITH 
  base_os AS (
    SELECT * FROM public.vw_gestao_os_consolidada
  ),
  stats_os AS (
    SELECT 
      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada')) as abertas,
      count(*) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_ini) as concluidas,
      count(*) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_pini AND conclusao < v_ini) as concluidas_ant,
      count(*) FILTER (WHERE criado_em >= v_ini) as criadas,
      count(*) FILTER (WHERE criado_em >= v_pini AND criado_em < v_ini) as criadas_ant,
      count(*) FILTER (WHERE atrasada) as vencidas,
      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND prazo_sla BETWEEN now() AND now() + interval '24 hours') as vence_24h,
      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND prazo_sla BETWEEN now() AND now() + interval '48 hours') as vence_48h,
      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada')) as backlog,
      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND criado_em < now() - interval '30 days') as backlog_30,
      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND (equipe IS NULL OR equipe = 'Não atribuída')) as sem_responsavel,
      count(*) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_ini AND (prazo_sla IS NULL OR conclusao <= prazo_sla)) as sla_ok,
      round(coalesce(avg(horas_atendimento) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_ini), 0)::numeric, 1) as tma_horas,
      round(coalesce(avg(horas_reparo) FILTER (WHERE conclusao >= v_ini), 0)::numeric, 1) as mttr_horas,
      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND criticidade IN ('alta','critica','crítica')) as criticas
    FROM base_os
  ),
  status_group AS (
    SELECT status_canonico, count(*) as qtd FROM base_os GROUP BY 1
  ),
  aging_group AS (
    SELECT 
      CASE
        WHEN criado_em >= now() - interval '7 days'  THEN '0-7'
        WHEN criado_em >= now() - interval '30 days' THEN '8-30'
        WHEN criado_em >= now() - interval '90 days' THEN '31-90'
        ELSE '90+'
      END as faixa, 
      count(*) as qtd
    FROM base_os
    WHERE status_canonico NOT IN ('concluida','cancelada')
    GROUP BY 1
  ),
  equipe_group AS (
    SELECT 
      equipe,
      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada')) as abertas,
      count(*) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_ini) as concluidas,
      count(*) FILTER (WHERE atrasada) as atrasadas,
      round(coalesce(avg(horas_atendimento) FILTER (WHERE status_canonico = 'concluida'), 0)::numeric, 1) as tma_horas
    FROM base_os
    GROUP BY 1 
    ORDER BY count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada')) DESC 
    LIMIT 10
  ),
  predio_group AS (
    SELECT coalesce(nullif(btrim(predio),''),'Não informado') as predio, count(*) as abertas
    FROM base_os
    WHERE status_canonico NOT IN ('concluida','cancelada')
    GROUP BY 1 
    ORDER BY count(*) DESC 
    LIMIT 10
  ),
  reincidente_group AS (
    SELECT ativo, count(*) as ocorrencias
    FROM base_os
    WHERE ativo IS NOT NULL AND btrim(ativo) <> ''
    GROUP BY 1 
    HAVING count(*) > 1 
    ORDER BY count(*) DESC 
    LIMIT 10
  ),
  mensal_group AS (
    SELECT 
      to_char(date_trunc('month', criado_em), 'YYYY-MM') as mes,
      count(*) as criadas,
      count(*) FILTER (WHERE status_canonico = 'concluida') as concluidas,
      count(*) FILTER (WHERE status_canonico = 'cancelada') as canceladas
    FROM base_os
    WHERE criado_em >= date_trunc('month', now()) - interval '11 months'
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'periodo_dias', v_d,
    'gerado_em', now(),
    'os', (SELECT row_to_json(stats_os) FROM stats_os),
    'os_status', (SELECT coalesce(jsonb_object_agg(status_canonico, qtd), '{}'::jsonb) FROM status_group),
    'os_aging', (SELECT coalesce(jsonb_object_agg(faixa, qtd), '{}'::jsonb) FROM aging_group),
    'os_equipes', (SELECT coalesce(jsonb_agg(row_to_json(equipe_group)), '[]'::jsonb) FROM equipe_group),
    'os_predios', (SELECT coalesce(jsonb_agg(row_to_json(predio_group)), '[]'::jsonb) FROM predio_group),
    'os_reincidentes', (SELECT coalesce(jsonb_agg(row_to_json(reincidente_group)), '[]'::jsonb) FROM reincidente_group),
    'os_mensal', (SELECT coalesce(jsonb_agg(row_to_json(mensal_group) ORDER BY mes), '[]'::jsonb) FROM mensal_group),
    'frota', (
      SELECT jsonb_build_object(
        'total',        (SELECT count(*) FROM public.vehicles),
        'disponiveis',  (SELECT count(*) FROM public.vehicles WHERE coalesce(status,'ativo') IN ('ativo','disponivel')),
        'bloqueados',   (SELECT count(*) FROM public.vehicles WHERE coalesce(status,'') IN ('bloqueado','inativo')),
        'manutencao',   (SELECT count(*) FROM public.vehicles WHERE coalesce(status,'') = 'manutencao'),
        'checklists',   (SELECT count(*) FROM public.fleet_checklists WHERE created_at >= v_ini),
        'checklists_ant',(SELECT count(*) FROM public.fleet_checklists WHERE created_at >= v_pini AND created_at < v_ini),
        'reprovados',   (SELECT count(*) FROM public.fleet_checklists WHERE created_at >= v_ini AND coalesce(overall_status,'ok') <> 'ok'),
        'custo',        (SELECT coalesce(sum(total_cost),0) FROM public.fleet_fuelings WHERE fueled_at >= v_ini),
        'custo_ant',    (SELECT coalesce(sum(total_cost),0) FROM public.fleet_fuelings WHERE fueled_at >= v_pini AND fueled_at < v_ini),
        'litros',       (SELECT coalesce(sum(liters),0) FROM public.fleet_fuelings WHERE fueled_at >= v_ini),
        'ocorrencias',  (SELECT count(*) FROM public.vehicle_occurrences WHERE coalesce(state,'aberta') NOT IN ('resolvida','fechada'))
      )
    ),
    'agua', (
      SELECT jsonb_build_object(
        'entregas',     count(*) FILTER (WHERE criado_em >= v_ini),
        'entregas_ant', count(*) FILTER (WHERE criado_em >= v_pini AND criado_em < v_ini),
        'bags',         coalesce(sum(bags) FILTER (WHERE criado_em >= v_ini), 0),
        'bags_ant',     coalesce(sum(bags) FILTER (WHERE criado_em >= v_pini AND criado_em < v_ini), 0),
        'pendentes',    count(*) FILTER (WHERE criado_em >= v_ini AND coalesce(status,'') NOT IN ('concluida','entregue')),
        'bebedouros_nok', count(*) FILTER (WHERE criado_em >= v_ini AND bebedouro_ok = false),
        'sem_evidencia', count(*) FILTER (
            WHERE criado_em >= v_ini
              AND NOT EXISTS (SELECT 1 FROM public.agua_prog_fotos f WHERE f.entrega_id = e.id))
      ) FROM public.agua_prog_entregas e
    ),
    'filtros', (
      SELECT jsonb_build_object(
        'vencidos',   count(*) FILTER (WHERE proxima_troca IS NOT NULL AND proxima_troca < current_date),
        'proximos_30',count(*) FILTER (WHERE proxima_troca BETWEEN current_date AND current_date + 30)
      ) FROM public.agua_filtro_ativos
    ),
    'materiais', (
      SELECT jsonb_build_object(
        'pendentes', count(*) FILTER (WHERE coalesce(status,'') NOT IN ('concluida','cancelada','atendida')),
        'periodo',   count(*) FILTER (WHERE created_at >= v_ini),
        'periodo_ant', count(*) FILTER (WHERE created_at >= v_pini AND created_at < v_ini)
      ) FROM public.material_solicitacoes
    ),
    'pecas', (
      SELECT jsonb_build_object(
        'aguardando', (SELECT count(*) FROM public.corretiva_pecas WHERE coalesce(status_gestor,'pendente'::corretiva_status_gestor) = 'pendente'::corretiva_status_gestor)
                    + (SELECT count(*) FROM public.refrigeracao_pecas WHERE coalesce(status_gestor,'pendente'::refrig_status_gestor) = 'pendente'::refrig_status_gestor),
        'problemas',  (SELECT count(*) FROM public.corretiva_problemas WHERE coalesce(status_gestor,'pendente') = 'pendente')
                    + (SELECT count(*) FROM public.refrigeracao_problemas WHERE coalesce(status_gestor,'pendente') = 'pendente')
      )
    ),
    'legal', (
      SELECT jsonb_build_object(
        'total', count(*),
        'vencidos', count(*) FILTER (WHERE concluido = false AND proxima_execucao < current_date),
        'proximos_30', count(*) FILTER (WHERE concluido = false AND proxima_execucao BETWEEN current_date AND current_date + 30)
      ) FROM public.legal_items
    ),
    'sst', (
      SELECT jsonb_build_object(
        'aso_vencidos', count(*) FILTER (WHERE ativo AND data_vencimento < current_date),
        'aso_proximos_30', count(*) FILTER (WHERE ativo AND data_vencimento BETWEEN current_date AND current_date + 30)
      ) FROM public.sst_colaboradores
    ),
    'taludes', (
      SELECT jsonb_build_object(
        'pt_ativas', count(*) FILTER (WHERE status IN ('liberada','em_andamento')),
        'pt_aguardando', count(*) FILTER (WHERE status IN ('solicitada','analise')),
        'pt_suspensas', count(*) FILTER (WHERE status = 'suspensa')
      ) FROM public.talude_pt_releases
    ),
    'notas_abertas', (SELECT count(*) FROM public.gestao_notas WHERE situacao <> 'concluida')
  ) INTO v_out;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gestao_overview_v2(integer) TO authenticated, service_role;
