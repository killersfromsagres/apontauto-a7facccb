-- ============================================================
-- Centro de Gestão — consolidação de OS, indicadores e preferências
-- Aditivo: nenhuma tabela operacional é alterada ou duplicada.
-- ============================================================

-- 1) Status canônico -------------------------------------------------
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

-- 2) View consolidada (RLS das tabelas de origem preservada) ----------
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
    'corretiva'::text, c.id::text, c.numero_os,
    c.nome_os, c.ativo, c.patrimonio,
    c.predio, c.andar, c.local,
    coalesce(nullif(btrim(c.equipe), ''), 'Não atribuída'),
    c.assinatura_nome,
    coalesce(nullif(btrim(c.tipo), ''), 'normal'),
    'media'::text,
    public.gestao_status_canonico(c.status::text),
    coalesce(nullif(btrim(c.status::text), ''), 'indefinido'),
    coalesce(c.data_criacao, c.created_at), c.inicio, c.fim, c.data_sla
  FROM public.corretiva_os c
),
refr AS (
  SELECT
    'refrigeracao'::text, r.id::text, r.numero_os,
    r.nome_os, r.ativo, r.patrimonio,
    r.predio, r.andar, r.local,
    coalesce(nullif(btrim(r.equipe), ''), 'Refrigeração'),
    NULL::text,
    coalesce(nullif(btrim(r.tipo), ''), 'normal'),
    'media'::text,
    public.gestao_status_canonico(r.status::text),
    coalesce(nullif(btrim(r.status::text), ''), 'indefinido'),
    r.created_at, r.inicio, r.fim, r.data_sla
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
  CASE WHEN b.ativo IS NULL OR btrim(b.ativo) = '' THEN 1
       ELSE count(*) OVER (PARTITION BY lower(btrim(b.ativo))) END AS reincidencia
FROM base b
LEFT JOIN LATERAL (
  SELECT count(*) AS pendentes FROM public.corretiva_pecas p
  WHERE b.origem = 'corretiva' AND p.os_id::text = b.id
    AND coalesce(p.status_gestor, 'pendente') = 'pendente'
  UNION ALL
  SELECT count(*) FROM public.refrigeracao_pecas p
  WHERE b.origem = 'refrigeracao' AND p.os_id::text = b.id
    AND coalesce(p.status_gestor, 'pendente') = 'pendente'
  LIMIT 1
) pc ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS total FROM public.corretiva_problemas p
  WHERE b.origem = 'corretiva' AND p.os_id::text = b.id
  UNION ALL
  SELECT count(*) FROM public.refrigeracao_problemas p
  WHERE b.origem = 'refrigeracao' AND p.os_id::text = b.id
  LIMIT 1
) pb ON true;

GRANT SELECT ON public.vw_gestao_os_consolidada TO authenticated;
GRANT SELECT ON public.vw_gestao_os_consolidada TO service_role;

-- 3) RPC de leitura filtrada -----------------------------------------
CREATE OR REPLACE FUNCTION public.gestao_os_consolidada(
  p_dias       integer DEFAULT 30,
  p_modulo     text    DEFAULT NULL,
  p_equipe     text    DEFAULT NULL,
  p_predio     text    DEFAULT NULL,
  p_status     text    DEFAULT NULL,
  p_criticidade text   DEFAULT NULL,
  p_limit      integer DEFAULT 500
)
RETURNS SETOF public.vw_gestao_os_consolidada
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ini timestamptz := now() - (greatest(coalesce(p_dias, 30), 1) || ' days')::interval;
BEGIN
  IF NOT public.can_access_gestao('read') THEN
    RAISE EXCEPTION 'Sem permissão para o Centro de Gestão';
  END IF;

  RETURN QUERY
  SELECT * FROM public.vw_gestao_os_consolidada v
  WHERE (v.criado_em IS NULL OR v.criado_em >= v_ini
         OR v.status_canonico NOT IN ('concluida','cancelada'))
    AND (p_modulo      IS NULL OR v.origem = p_modulo)
    AND (p_equipe      IS NULL OR v.equipe = p_equipe)
    AND (p_predio      IS NULL OR v.predio = p_predio)
    AND (p_status      IS NULL OR v.status_canonico = p_status)
    AND (p_criticidade IS NULL OR v.criticidade = p_criticidade)
  ORDER BY v.atrasada DESC NULLS LAST, v.criado_em DESC NULLS LAST
  LIMIT greatest(coalesce(p_limit, 500), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.gestao_os_consolidada(integer,text,text,text,text,text,integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.gestao_os_consolidada(integer,text,text,text,text,text,integer) TO authenticated, service_role;

-- 4) Overview v2: período + comparação + atenção ----------------------
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

  SELECT jsonb_build_object(
    'periodo_dias', v_d,
    'gerado_em', now(),
    'os', (
      SELECT jsonb_build_object(
        'abertas',        count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada')),
        'concluidas',     count(*) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_ini),
        'concluidas_ant', count(*) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_pini AND conclusao < v_ini),
        'criadas',        count(*) FILTER (WHERE criado_em >= v_ini),
        'criadas_ant',    count(*) FILTER (WHERE criado_em >= v_pini AND criado_em < v_ini),
        'vencidas',       count(*) FILTER (WHERE atrasada),
        'vence_24h',      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND prazo_sla BETWEEN now() AND now() + interval '24 hours'),
        'vence_48h',      count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND prazo_sla BETWEEN now() AND now() + interval '48 hours'),
        'backlog',        count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada')),
        'backlog_30',     count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND criado_em < now() - interval '30 days'),
        'sem_responsavel',count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND (equipe IS NULL OR equipe = 'Não atribuída')),
        'sla_ok',         count(*) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_ini AND (prazo_sla IS NULL OR conclusao <= prazo_sla)),
        'tma_horas',      round(coalesce(avg(horas_atendimento) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_ini), 0)::numeric, 1),
        'mttr_horas',     round(coalesce(avg(horas_reparo) FILTER (WHERE conclusao >= v_ini), 0)::numeric, 1),
        'criticas',       count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada') AND criticidade IN ('alta','critica','crítica'))
      )
      FROM public.vw_gestao_os_consolidada
    ),
    'os_status', (
      SELECT coalesce(jsonb_object_agg(t.status_canonico, t.qtd), '{}'::jsonb)
      FROM (SELECT status_canonico, count(*) qtd FROM public.vw_gestao_os_consolidada GROUP BY 1) t
    ),
    'os_aging', (
      SELECT coalesce(jsonb_object_agg(t.faixa, t.qtd), '{}'::jsonb)
      FROM (
        SELECT CASE
                 WHEN criado_em >= now() - interval '7 days'  THEN '0-7'
                 WHEN criado_em >= now() - interval '30 days' THEN '8-30'
                 WHEN criado_em >= now() - interval '90 days' THEN '31-90'
                 ELSE '90+'
               END faixa, count(*) qtd
        FROM public.vw_gestao_os_consolidada
        WHERE status_canonico NOT IN ('concluida','cancelada')
        GROUP BY 1
      ) t
    ),
    'os_equipes', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'equipe', equipe,
          'abertas', count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada')),
          'concluidas', count(*) FILTER (WHERE status_canonico = 'concluida' AND conclusao >= v_ini),
          'atrasadas', count(*) FILTER (WHERE atrasada),
          'tma_horas', round(coalesce(avg(horas_atendimento) FILTER (WHERE status_canonico = 'concluida'), 0)::numeric, 1)
        ) x
        FROM public.vw_gestao_os_consolidada
        GROUP BY equipe ORDER BY count(*) DESC LIMIT 10
      ) s
    ),
    'os_predios', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('predio', coalesce(nullif(btrim(predio),''),'Não informado'), 'abertas', count(*)) x
        FROM public.vw_gestao_os_consolidada
        WHERE status_canonico NOT IN ('concluida','cancelada')
        GROUP BY 1 ORDER BY count(*) DESC LIMIT 10
      ) s
    ),
    'os_reincidentes', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('ativo', ativo, 'ocorrencias', count(*)) x
        FROM public.vw_gestao_os_consolidada
        WHERE ativo IS NOT NULL AND btrim(ativo) <> ''
        GROUP BY ativo HAVING count(*) > 1 ORDER BY count(*) DESC LIMIT 10
      ) s
    ),
    'os_mensal', (
      SELECT coalesce(jsonb_agg(x ORDER BY x->>'mes'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'mes', to_char(date_trunc('month', criado_em), 'YYYY-MM'),
          'criadas', count(*),
          'concluidas', count(*) FILTER (WHERE status_canonico = 'concluida'),
          'canceladas', count(*) FILTER (WHERE status_canonico = 'cancelada')
        ) x
        FROM public.vw_gestao_os_consolidada
        WHERE criado_em >= date_trunc('month', now()) - interval '11 months'
        GROUP BY 1
      ) s
    ),
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
        'aguardando', (SELECT count(*) FROM public.corretiva_pecas WHERE coalesce(status_gestor,'pendente') = 'pendente')
                    + (SELECT count(*) FROM public.refrigeracao_pecas WHERE coalesce(status_gestor,'pendente') = 'pendente'),
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

REVOKE ALL ON FUNCTION public.gestao_overview_v2(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.gestao_overview_v2(integer) TO authenticated, service_role;

-- 5) Preferências do painel ------------------------------------------
CREATE TABLE IF NOT EXISTS public.gestor_dashboard_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  layout_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  filters_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  favorites_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gestor_dashboard_preferences TO authenticated;
GRANT ALL ON public.gestor_dashboard_preferences TO service_role;

ALTER TABLE public.gestor_dashboard_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prefs_own" ON public.gestor_dashboard_preferences;
CREATE POLICY "prefs_own" ON public.gestor_dashboard_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_gestor_prefs_updated_at ON public.gestor_dashboard_preferences;
CREATE TRIGGER trg_gestor_prefs_updated_at
  BEFORE UPDATE ON public.gestor_dashboard_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();