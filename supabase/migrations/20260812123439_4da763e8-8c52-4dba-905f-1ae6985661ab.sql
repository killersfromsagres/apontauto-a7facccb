-- Update gestao_overview_v2 to support filters
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
  v_criadas int;
  v_criadas_ant int;
  v_concluidas int;
  v_concluidas_ant int;
BEGIN
  -- We'll use a CTE for filtered data to make queries cleaner
  WITH filtered_os AS (
    SELECT * FROM public.vw_gestao_os_consolidada
    WHERE 
      (p_modulo IS NULL OR origem = p_modulo) AND
      (p_equipe IS NULL OR equipe = p_equipe) AND
      (p_predio IS NULL OR predio = p_predio) AND
      (p_status IS NULL OR status_canonico = p_status) AND
      (p_criticidade IS NULL OR criticidade = p_criticidade)
  ),
  filtered_ia AS (
    SELECT * FROM public.vw_gestao_os_corretiva_novo
    WHERE 
      (p_equipe IS NULL OR equipe = p_equipe) AND
      (p_predio IS NULL OR predio = p_predio) AND
      (p_status IS NULL OR status_canonico = p_status)
  )
  SELECT json_build_object(
    'periodo_dias', p_dias,
    'gerado_em', now(),
    'os', json_build_object(
      'abertas', (SELECT count(*) FROM filtered_os WHERE status_canonico = 'aberta'),
      'concluidas', (SELECT count(*) FROM filtered_os WHERE status_canonico = 'concluida' AND conclusao >= (now() - (p_dias || ' days')::interval)),
      'criadas', (SELECT count(*) FROM filtered_os WHERE criado_em >= (now() - (p_dias || ' days')::interval)),
      'vencidas', (SELECT count(*) FROM filtered_os WHERE atrasada = true),
      'backlog', (SELECT count(*) FROM filtered_os WHERE status_canonico = 'aberta'),
      'sla_ok', (SELECT count(*) FROM filtered_os WHERE status_canonico = 'concluida' AND atrasada = false),
      'tma_horas', (SELECT COALESCE(avg(horas_atendimento), 0) FROM filtered_os WHERE status_canonico = 'concluida' AND conclusao >= (now() - (p_dias || ' days')::interval)),
      'mttr_horas', (SELECT COALESCE(avg(horas_reparo), 0) FROM filtered_os WHERE status_canonico = 'concluida' AND conclusao >= (now() - (p_dias || ' days')::interval)),
      'criticas', (SELECT count(*) FROM filtered_os WHERE prioridade = 'alta')
    ),
    'os_status', (
      SELECT json_object_agg(status, total)
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
      SELECT json_agg(m) FROM (
        SELECT 
          to_char(criado_em, 'Mon') as mes,
          count(*) filter (where status_canonico = 'aberta' or status_canonico = 'concluida') as criadas,
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
    ) FROM public.veiculos WHERE p_modulo IS NULL OR p_modulo = 'frota'),
    'taludes', (SELECT json_build_object(
      'pt_ativas', count(*) filter (where status = 'liberado'),
      'pt_aguardando', count(*) filter (where status = 'pendente'),
      'pt_suspensas', count(*) filter (where status = 'interdito')
    ) FROM public.taludes_areas WHERE p_modulo IS NULL OR p_modulo = 'taludes'),
    'pecas', (SELECT json_build_object(
      'aguardando', count(*) filter (where situacao = 'Aguardando Compra'),
      'problemas', count(*) filter (where situacao = 'Problema no Pedido')
    ) FROM public.materiais_pecas WHERE p_modulo IS NULL OR p_modulo = 'pecas'),
    'legal', (SELECT json_build_object(
      'total', count(*),
      'vencidos', count(*) filter (where data_vencimento < now())
    ) FROM public.conformidade_legal WHERE p_modulo IS NULL OR p_modulo = 'legal'),
    'materiais', (SELECT json_build_object(
      'pendentes', count(*) filter (where status = 'pendente')
    ) FROM public.materiais_solicitacoes WHERE p_modulo IS NULL OR p_modulo = 'materiais')
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.gestao_overview_v2(integer, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gestao_overview_v2(integer, text, text, text, text, text) TO service_role;
