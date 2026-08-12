
-- 1. Atualizar a View de Corretiva Novo para garantir mapeamento preciso
CREATE OR REPLACE VIEW public.vw_gestao_os_corretiva_novo AS
SELECT 
    'corretiva_novo'::text AS origem,
    (c.id)::text AS id,
    c.numero_os,
    c.nome_os AS descricao,
    c.ativo,
    c.patrimonio,
    c.predio,
    c.andar,
    c.local,
    COALESCE(NULLIF(trim(c.equipe), ''), 'Não atribuída') AS equipe,
    c.solicitante AS tecnico,
    COALESCE(NULLIF(trim(c.tipo), ''), 'normal') AS prioridade,
    'media'::text AS criticidade,
    CASE 
        WHEN lower(trim(c.status::text)) IN ('concluida', 'concluído', 'finalizada', 'ok') THEN 'concluida'
        WHEN lower(trim(c.status::text)) IN ('cancelada', 'cancelado') THEN 'cancelada'
        WHEN lower(trim(c.status::text)) IN ('em andamento', 'execução', 'andamento') THEN 'andamento'
        ELSE 'aberta'
    END AS status_canonico,
    COALESCE(NULLIF(trim(c.status::text), ''), 'indefinido') AS status_origem,
    COALESCE(c.data_criacao::timestamptz, c.created_at) AS criado_em,
    c.inicio AS inicio,
    c.fim AS conclusao,
    c.data_sla::timestamptz AS prazo_sla
FROM public.corretiva_os c;

GRANT SELECT ON public.vw_gestao_os_corretiva_novo TO authenticated;
GRANT SELECT ON public.vw_gestao_os_corretiva_novo TO service_role;

-- 2. Atualizar a View Consolidada para garantir que as novas definições sejam propagadas
CREATE OR REPLACE VIEW public.vw_gestao_os_consolidada AS
  WITH bo AS (
          SELECT 'backorder'::text AS origem,
             b_1.os AS id,
             b_1.os AS numero_os,
             COALESCE(NULLIF(btrim(b_1.nome), ''::text), b_1.atividade) AS descricao,
             b_1.ativo,
             NULL::text AS patrimonio,
             b_1.predio,
             b_1.andar,
             b_1.espaco AS local,
             COALESCE(NULLIF(btrim(b_1.equipe), ''::text), 'Não atribuída'::text) AS equipe,
             NULL::text AS tecnico,
                 CASE
                     WHEN b_1.is_prioridade THEN 'alta'::text
                     ELSE COALESCE((b_1.prioridade_nivel)::text, 'normal'::text)
                 END AS prioridade,
             COALESCE(NULLIF(btrim(b_1.criticidade), ''::text), 'media'::text) AS criticidade,
                 CASE
                     WHEN b_1.cancelado THEN 'cancelada'::text
                     WHEN b_1.finalizado THEN 'concluida'::text
                     ELSE gestao_status_canonico(b_1.status_origem)
                 END AS status_canonico,
             COALESCE(NULLIF(btrim(b_1.status_origem), ''::text), 'indefinido'::text) AS status_origem,
             b_1.data_solicitacao AS criado_em,
             NULL::timestamp with time zone AS inicio,
             COALESCE(b_1.data_conclusao, b_1.data_finalizacao) AS conclusao,
             b_1.termino_sla AS prazo_sla
            FROM backorder_os b_1
         ), cor AS (
          SELECT * FROM public.vw_gestao_os_corretiva_novo
         ), ref AS (
          SELECT 'refrigeracao'::text AS origem,
             (r.id)::text AS id,
             r.numero_os,
             r.nome_os AS descricao,
             r.ativo,
             r.patrimonio,
             r.predio,
             r.andar,
             r.local,
             'Refrigeração'::text AS equipe,
             NULL::text AS tecnico,
             'normal'::text AS prioridade,
             'media'::text AS criticidade,
                  CASE
                      WHEN (r.status::text = 'concluida') THEN 'concluida'::text
                      ELSE 'aberta'::text
                  END AS status_canonico,
             r.status::text AS status_origem,
             r.created_at AS criado_em,
             r.inicio,
             r.fim AS conclusao,
             r.data_sla::timestamptz AS prazo_sla
            FROM refrigeracao_os r
         )
 SELECT bo.origem, bo.id, bo.numero_os, bo.descricao, bo.ativo, bo.patrimonio, bo.predio, bo.andar, bo.local, bo.equipe, bo.tecnico, bo.prioridade, bo.criticidade, bo.status_canonico, bo.status_origem, bo.criado_em, bo.inicio, bo.conclusao, bo.prazo_sla,
        CASE WHEN bo.prazo_sla IS NOT NULL AND bo.conclusao IS NULL AND now() > bo.prazo_sla THEN true ELSE false END as atrasada,
        CASE WHEN bo.prazo_sla IS NOT NULL AND bo.conclusao IS NULL AND now() > bo.prazo_sla THEN extract(day from (now() - bo.prazo_sla)) ELSE 0 END as dias_atraso,
        CASE WHEN bo.conclusao IS NOT NULL THEN extract(hour from (bo.conclusao - bo.criado_em)) ELSE extract(hour from (now() - bo.criado_em)) END as horas_atendimento,
        CASE WHEN bo.conclusao IS NOT NULL AND bo.inicio IS NOT NULL THEN extract(hour from (bo.conclusao - bo.inicio)) ELSE NULL END as horas_reparo
   FROM bo
UNION ALL
 SELECT cor.origem, cor.id, cor.numero_os, cor.descricao, cor.ativo, cor.patrimonio, cor.predio, cor.andar, cor.local, cor.equipe, cor.tecnico, cor.prioridade, cor.criticidade, cor.status_canonico, cor.status_origem, cor.criado_em, cor.inicio, cor.conclusao, cor.prazo_sla,
        CASE WHEN cor.prazo_sla IS NOT NULL AND cor.conclusao IS NULL AND now() > cor.prazo_sla THEN true ELSE false END as atrasada,
        CASE WHEN cor.prazo_sla IS NOT NULL AND cor.conclusao IS NULL AND now() > cor.prazo_sla THEN extract(day from (now() - cor.prazo_sla)) ELSE 0 END as dias_atraso,
        CASE WHEN cor.conclusao IS NOT NULL THEN extract(hour from (cor.conclusao - cor.criado_em)) ELSE extract(hour from (now() - cor.criado_em)) END as horas_atendimento,
        CASE WHEN cor.conclusao IS NOT NULL AND cor.inicio IS NOT NULL THEN extract(hour from (cor.conclusao - cor.inicio)) ELSE NULL END as horas_reparo
   FROM cor
UNION ALL
 SELECT ref.origem, ref.id, ref.numero_os, ref.descricao, ref.ativo, ref.patrimonio, ref.predio, ref.andar, ref.local, ref.equipe, ref.tecnico, ref.prioridade, ref.criticidade, ref.status_canonico, ref.status_origem, ref.criado_em, ref.inicio, ref.conclusao, ref.prazo_sla,
        CASE WHEN ref.prazo_sla IS NOT NULL AND ref.conclusao IS NULL AND now() > ref.prazo_sla THEN true ELSE false END as atrasada,
        CASE WHEN ref.prazo_sla IS NOT NULL AND ref.conclusao IS NULL AND now() > ref.prazo_sla THEN extract(day from (now() - ref.prazo_sla)) ELSE 0 END as dias_atraso,
        CASE WHEN ref.conclusao IS NOT NULL THEN extract(hour from (ref.conclusao - ref.criado_em)) ELSE extract(hour from (now() - ref.criado_em)) END as horas_atendimento,
        CASE WHEN ref.conclusao IS NOT NULL AND ref.inicio IS NOT NULL THEN extract(hour from (ref.conclusao - ref.inicio)) ELSE NULL END as horas_reparo
   FROM ref;

GRANT SELECT ON public.vw_gestao_os_consolidada TO authenticated;
GRANT SELECT ON public.vw_gestao_os_consolidada TO service_role;

-- 3. Refinar a RPC gestao_overview_v2 para garantir dados de IA em tempo real nos gráficos
CREATE OR REPLACE FUNCTION public.gestao_overview_v2(p_dias integer DEFAULT 30)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
  v_criadas int;
  v_criadas_ant int;
  v_concluidas int;
  v_concluidas_ant int;
BEGIN
  -- Volume Corretiva Novo (Execução de Campo IA) - Puxando da View para consistência
  SELECT count(*) INTO v_criadas FROM public.vw_gestao_os_corretiva_novo WHERE criado_em >= (now() - (p_dias || ' days')::interval);
  SELECT count(*) INTO v_criadas_ant FROM public.vw_gestao_os_corretiva_novo WHERE criado_em >= (now() - ((p_dias * 2) || ' days')::interval) AND criado_em < (now() - (p_dias || ' days')::interval);
  SELECT count(*) INTO v_concluidas FROM public.vw_gestao_os_corretiva_novo WHERE status_canonico = 'concluida' AND conclusao >= (now() - (p_dias || ' days')::interval);
  SELECT count(*) INTO v_concluidas_ant FROM public.vw_gestao_os_corretiva_novo WHERE status_canonico = 'concluida' AND conclusao >= (now() - ((p_dias * 2) || ' days')::interval) AND conclusao < (now() - (p_dias || ' days')::interval);

  SELECT json_build_object(
    'periodo_dias', p_dias,
    'gerado_em', now(),
    'os', json_build_object(
      'abertas', (SELECT count(*) FROM public.vw_gestao_os_consolidada WHERE status_canonico = 'aberta'),
      'concluidas', (SELECT count(*) FROM public.vw_gestao_os_consolidada WHERE status_canonico = 'concluida' AND conclusao >= (now() - (p_dias || ' days')::interval)),
      'criadas', (SELECT count(*) FROM public.vw_gestao_os_consolidada WHERE criado_em >= (now() - (p_dias || ' days')::interval)),
      'vencidas', (SELECT count(*) FROM public.vw_gestao_os_consolidada WHERE atrasada = true),
      'backlog', (SELECT count(*) FROM public.vw_gestao_os_consolidada WHERE status_canonico = 'aberta'),
      'sla_ok', (SELECT count(*) FROM public.vw_gestao_os_consolidada WHERE status_canonico = 'concluida' AND atrasada = false),
      'tma_horas', (SELECT COALESCE(avg(horas_atendimento), 0) FROM public.vw_gestao_os_consolidada WHERE status_canonico = 'concluida' AND conclusao >= (now() - (p_dias || ' days')::interval)),
      'mttr_horas', (SELECT COALESCE(avg(horas_reparo), 0) FROM public.vw_gestao_os_consolidada WHERE status_canonico = 'concluida' AND conclusao >= (now() - (p_dias || ' days')::interval)),
      'criticas', (SELECT count(*) FROM public.vw_gestao_os_consolidada WHERE prioridade = 'alta')
    ),
    'os_status', (
      SELECT json_object_agg(status_canonico, count)
      FROM (SELECT status_canonico, count(*) FROM public.vw_gestao_os_consolidada GROUP BY status_canonico) s
    ),
    'os_aging', json_build_object(
      '0-7', (SELECT count(*) FROM public.vw_gestao_os_consolidada WHERE status_canonico = 'aberta' AND criado_em >= (now() - '7 days'::interval)),
      '8-30', (SELECT count(*) FROM public.vw_gestao_os_consolidada WHERE status_canonico = 'aberta' AND criado_em < (now() - '7 days'::interval) AND criado_em >= (now() - '30 days'::interval)),
      '31-90', (SELECT count(*) FROM public.vw_gestao_os_consolidada WHERE status_canonico = 'aberta' AND criado_em < (now() - '30 days'::interval) AND criado_em >= (now() - '90 days'::interval)),
      '90+', (SELECT count(*) FROM public.vw_gestao_os_consolidada WHERE status_canonico = 'aberta' AND criado_em < (now() - '90 days'::interval))
    ),
    'os_mensal', (
      SELECT json_agg(m) FROM (
        SELECT 
          to_char(criado_em, 'Mon') as mes,
          count(*) filter (where status_canonico = 'aberta' or status_canonico = 'concluida') as criadas,
          count(*) filter (where status_canonico = 'concluida') as concluidas
        FROM public.vw_gestao_os_consolidada
        WHERE criado_em >= (now() - '6 months'::interval)
        GROUP BY 1
        ORDER BY min(criado_em)
      ) m
    ),
    'frota', (SELECT json_build_object(
      'total', count(*), 
      'disponiveis', count(*) filter (where status = 'disponivel'),
      'bloqueados', count(*) filter (where status = 'indisponivel'),
      'manutencao', count(*) filter (where status = 'manutencao'),
      'checklists', (SELECT count(*) FROM public.veiculo_checklists WHERE created_at >= (now() - (p_dias || ' days')::interval)),
      'checklists_ant', (SELECT count(*) FROM public.veiculo_checklists WHERE created_at >= (now() - ((p_dias * 2) || ' days')::interval) AND created_at < (now() - (p_dias || ' days')::interval))
    ) FROM public.veiculos),
    'agua', json_build_object('entregas', 0, 'bags', 0),
    'materiais', json_build_object('pendentes', (SELECT count(*) FROM public.solicitacao_materiais WHERE status = 'pendente')),
    'pecas', json_build_object('aguardando', (SELECT count(*) FROM public.corretiva_pecas WHERE status = 'pendente')),
    'legal', json_build_object('vencidos', 0),
    'sst', json_build_object('aso_vencidos', 0),
    'taludes', (SELECT json_build_object(
      'pt_ativas', count(*) filter (where status = 'em_execucao'),
      'pt_aguardando', count(*) filter (where status = 'programado'),
      'pt_suspensas', count(*) filter (where status = 'interferência climática')
    ) FROM public.talude_monitoramento),
    'filtros', json_build_object('vencidos', 0),
    'corretiva_novo', json_build_object(
        'criadas', v_criadas,
        'criadas_ant', v_criadas_ant,
        'concluidas', v_concluidas,
        'concluidas_ant', v_concluidas_ant
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
