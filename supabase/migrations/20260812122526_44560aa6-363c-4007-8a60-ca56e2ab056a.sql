-- Atualizando o RPC gestao_overview_v2 para ser mais agressivo na sincronização e preciso nos dados de Campo IA
CREATE OR REPLACE FUNCTION public.gestao_overview_v2(p_dias integer DEFAULT 30)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result json;
  v_criadas int;
  v_criadas_ant int;
  v_concluidas int;
  v_concluidas_ant int;
BEGIN
  -- Volume Corretiva Novo (Execução de Campo IA)
  SELECT count(*) INTO v_criadas FROM public.vw_gestao_os_corretiva_novo WHERE criado_em >= (now() - (p_dias || ' days')::interval);
  SELECT count(*) INTO v_criadas_ant FROM public.vw_gestao_os_corretiva_novo WHERE criado_em >= (now() - ((p_dias * 2) || ' days')::interval) AND criado_em < (now() - (p_dias || ' days')::interval);
  
  -- Contagem de concluídas melhorada para refletir mudanças imediatas
  SELECT count(*) INTO v_concluidas FROM public.vw_gestao_os_corretiva_novo 
  WHERE status_canonico = 'concluida' 
  AND (conclusao >= (now() - (p_dias || ' days')::interval) OR (conclusao IS NULL AND criado_em >= (now() - (p_dias || ' days')::interval)));

  SELECT count(*) INTO v_concluidas_ant FROM public.vw_gestao_os_corretiva_novo 
  WHERE status_canonico = 'concluida' 
  AND conclusao >= (now() - ((p_dias * 2) || ' days')::interval) AND conclusao < (now() - (p_dias || ' days')::interval);

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
      SELECT json_object_agg(status, total)
      FROM (
        SELECT status_canonico as status, count(*) as total 
        FROM public.vw_gestao_os_consolidada 
        GROUP BY status_canonico
      ) s
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
        GROUP BY 1, date_trunc('month', criado_em)
        ORDER BY date_trunc('month', criado_em)
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
$function$;