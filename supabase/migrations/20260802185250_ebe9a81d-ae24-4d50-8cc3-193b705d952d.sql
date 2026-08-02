-- Fix gestao_overview_v2: Remove avg(horas_atendimento) and count(*) from GROUP BY
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
      FROM (SELECT status_canonico, count(*) qtd FROM public.vw_gestao_os_consolidada GROUP BY status_canonico) t
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
        GROUP BY equipe ORDER BY count(*) FILTER (WHERE status_canonico NOT IN ('concluida','cancelada')) DESC LIMIT 10
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