GRANT EXECUTE ON FUNCTION public.gestao_status_canonico(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

-- Recria a RPC com tratamento robusto e garantindo que filtros NULL não quebrem a query
CREATE OR REPLACE FUNCTION public.gestao_overview_v2(
  p_dias integer DEFAULT 30,
  p_modulo text DEFAULT NULL,
  p_equipe text DEFAULT NULL,
  p_predio text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_criticidade text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result json;
BEGIN
  WITH filtered_os AS (
    SELECT * FROM public.vw_gestao_os_consolidada
    WHERE 
      (p_modulo IS NULL OR p_modulo = '' OR origem = p_modulo) AND
      (p_equipe IS NULL OR p_equipe = '' OR equipe = p_equipe) AND
      (p_predio IS NULL OR p_predio = '' OR predio = p_predio) AND
      (p_status IS NULL OR p_status = '' OR status_canonico = p_status) AND
      (p_criticidade IS NULL OR p_criticidade = '' OR criticidade = p_criticidade)
  ),
  filtered_ia AS (
    SELECT * FROM public.vw_gestao_os_corretiva_novo
    WHERE 
      (p_equipe IS NULL OR p_equipe = '' OR equipe = p_equipe) AND
      (p_predio IS NULL OR p_predio = '' OR predio = p_predio) AND
      (p_status IS NULL OR p_status = '' OR status_canonico = p_status)
  )
  SELECT json_build_object(
    'periodo_dias', p_dias,
    'gerado_em', now(),
    'os', json_build_object(
      'abertas', (SELECT count(*) FROM filtered_os WHERE status_canonico = 'aberta'),
      'concluidas', (SELECT count(*) FROM filtered_os WHERE status_canonico = 'concluida' AND (conclusao >= (now() - (p_dias || ' days')::interval) OR (conclusao IS NULL AND criado_em >= (now() - (p_dias || ' days')::interval)))),
      'criadas', (SELECT count(*) FROM filtered_os WHERE criado_em >= (now() - (p_dias || ' days')::interval)),
      'vencidas', (SELECT count(*) FROM filtered_os WHERE atrasada = true),
      'backlog', (SELECT count(*) FROM filtered_os WHERE status_canonico = 'aberta'),
      'sla_ok', (SELECT count(*) FROM filtered_os WHERE status_canonico = 'concluida' AND atrasada = false),
      'tma_horas', (SELECT COALESCE(avg(horas_atendimento), 0) FROM filtered_os WHERE status_canonico = 'concluida' AND (conclusao >= (now() - (p_dias || ' days')::interval) OR (conclusao IS NULL AND criado_em >= (now() - (p_dias || ' days')::interval)))),
      'mttr_horas', (SELECT COALESCE(avg(horas_reparo), 0) FROM filtered_os WHERE status_canonico = 'concluida' AND (conclusao >= (now() - (p_dias || ' days')::interval) OR (conclusao IS NULL AND criado_em >= (now() - (p_dias || ' days')::interval)))),
      'criticas', (SELECT count(*) FROM filtered_os WHERE (prioridade = 'alta' OR criticidade = 'critica'))
    ),
    'os_status', (
      SELECT COALESCE(json_object_agg(status, total), '{}'::json)
      FROM (
        SELECT status_canonico as status, count(*) as total 
        FROM filtered_os 
        GROUP BY status_canonico
      ) s
    ),
    'os_aging', json_build_object(
      '0-7', (SELECT count(*) FROM filtered_os WHERE status_canonico = 'aberta' AND criado_em >= (now() - '7 days'::interval)),
      '8-30', (SELECT count(*) FROM filtered_os WHERE status_canonico = 'aberta' AND criado_em < (now() - '7 days'::interval) AND criado_em >= (now() - '30 days'::interval)),
      '31-90', (SELECT count(*) FROM filtered_os WHERE status_canonico = 'aberta' AND criado_em < (now() - '30 days'::interval) AND criado_em >= (now() - '90 days'::interval)),
      '90+', (SELECT count(*) FROM filtered_os WHERE status_canonico = 'aberta' AND criado_em < (now() - '90 days'::interval))
    ),
    'os_mensal', (
      SELECT COALESCE(json_agg(m), '[]'::json) FROM (
        SELECT 
          to_char(criado_em, 'Mon') as mes,
          count(*) filter (where status_canonico IN ('aberta', 'concluida', 'andamento')) as criadas,
          count(*) filter (where status_canonico = 'concluida') as concluidas
        FROM filtered_os
        WHERE criado_em >= (now() - '6 months'::interval)
        GROUP BY 1, date_trunc('month', criado_em)
        ORDER BY date_trunc('month', criado_em)
      ) m
    ),
    'corretiva_novo', (
       SELECT json_build_object(
         'criadas', (SELECT count(*) FROM filtered_ia WHERE criado_em >= (now() - (p_dias || ' days')::interval)),
         'criadas_ant', (SELECT count(*) FROM filtered_ia WHERE criado_em >= (now() - ((p_dias * 2) || ' days')::interval) AND criado_em < (now() - (p_dias || ' days')::interval)),
         'concluidas', (SELECT count(*) FROM filtered_ia WHERE status_canonico = 'concluida' AND (conclusao >= (now() - (p_dias || ' days')::interval) OR (conclusao IS NULL AND criado_em >= (now() - (p_dias || ' days')::interval)))),
         'concluidas_ant', (SELECT count(*) FROM filtered_ia WHERE status_canonico = 'concluida' AND conclusao >= (now() - ((p_dias * 2) || ' days')::interval) AND conclusao < (now() - (p_dias || ' days')::interval))
       )
    ),
    'frota', (SELECT json_build_object(
      'total', count(*), 
      'disponiveis', count(*) filter (where status = 'disponivel'),
      'bloqueados', count(*) filter (where status = 'indisponivel'),
      'manutencao', count(*) filter (where status = 'manutencao'),
      'checklists', (SELECT count(*) FROM public.veiculo_checklists WHERE created_at >= (now() - (p_dias || ' days')::interval))
    ) FROM public.veiculos WHERE p_modulo IS NULL OR p_modulo = '' OR p_modulo = 'frota'),
    'taludes', (SELECT json_build_object(
      'pt_ativas', count(*) filter (where status IN ('liberado', 'em_execucao')),
      'pt_aguardando', count(*) filter (where status IN ('pendente', 'programado')),
      'pt_suspensas', count(*) filter (where status IN ('interdito', 'interferência climática'))
    ) FROM public.taludes_areas WHERE p_modulo IS NULL OR p_modulo = '' OR p_modulo = 'taludes'),
    'pecas', (SELECT json_build_object(
      'aguardando', count(*) filter (where situacao IN ('Aguardando Compra', 'pendente')),
      'problemas', count(*) filter (where situacao = 'Problema no Pedido')
    ) FROM public.materiais_pecas WHERE p_modulo IS NULL OR p_modulo = '' OR p_modulo = 'pecas'),
    'legal', (SELECT json_build_object(
      'total', count(*),
      'vencidos', count(*) filter (where data_vencimento < now())
    ) FROM public.conformidade_legal WHERE p_modulo IS NULL OR p_modulo = '' OR p_modulo = 'legal'),
    'materiais', (SELECT json_build_object(
      'pendentes', count(*) filter (where status = 'pendente')
    ) FROM public.materiais_solicitacoes WHERE p_modulo IS NULL OR p_modulo = '' OR p_modulo = 'materiais'),
    'agua', json_build_object('entregas', 0, 'bags', 0),
    'sst', json_build_object('aso_vencidos', 0),
    'notas_abertas', (SELECT count(*) FROM public.gestao_notas WHERE situacao = 'aberta')
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.gestao_overview_v2(integer, text, text, text, text, text) TO authenticated, service_role;
