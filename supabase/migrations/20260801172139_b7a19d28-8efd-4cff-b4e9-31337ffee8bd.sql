-- 1) Permissões do novo módulo (aditivo)
INSERT INTO public.pcm_permissions (key, module_key, action, label)
SELECT 'gestao-executiva:' || a, 'gestao-executiva', a, 'gestao-executiva — ' || a
FROM unnest(ARRAY['read','create','update','delete','export','admin']) a
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
SELECT r, 'gestao-executiva:' || a
FROM unnest(ARRAY['proprietario','administrador','gestor_pcm']) r,
     unnest(ARRAY['read','create','update','delete','export','admin']) a
ON CONFLICT DO NOTHING;

INSERT INTO public.pcm_role_permissions (role_key, permission_key)
VALUES ('supervisor','gestao-executiva:read'),
       ('auditor','gestao-executiva:read'),
       ('auditor','gestao-executiva:export')
ON CONFLICT DO NOTHING;

-- 2) Guarda de permissão reutilizável
CREATE OR REPLACE FUNCTION public.can_access_gestao(required_action text DEFAULT 'read')
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_access_module('gestao-executiva', coalesce(nullif(btrim(required_action),''),'read'));
$$;

-- 3) Notas executivas
CREATE TABLE IF NOT EXISTS public.gestao_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  detalhe text NOT NULL DEFAULT '',
  modulo text NOT NULL DEFAULT 'geral',
  prioridade text NOT NULL DEFAULT 'media',
  situacao text NOT NULL DEFAULT 'aberta',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gestao_notas TO authenticated;
GRANT ALL ON public.gestao_notas TO service_role;

ALTER TABLE public.gestao_notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gestao_notas_select ON public.gestao_notas;
CREATE POLICY gestao_notas_select ON public.gestao_notas
  FOR SELECT TO authenticated
  USING (public.can_access_gestao('read'));

DROP POLICY IF EXISTS gestao_notas_insert ON public.gestao_notas;
CREATE POLICY gestao_notas_insert ON public.gestao_notas
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_gestao('create') AND created_by = auth.uid());

DROP POLICY IF EXISTS gestao_notas_update ON public.gestao_notas;
CREATE POLICY gestao_notas_update ON public.gestao_notas
  FOR UPDATE TO authenticated
  USING (public.can_access_gestao('update') OR created_by = auth.uid())
  WITH CHECK (public.can_access_gestao('update') OR created_by = auth.uid());

DROP POLICY IF EXISTS gestao_notas_delete ON public.gestao_notas;
CREATE POLICY gestao_notas_delete ON public.gestao_notas
  FOR DELETE TO authenticated
  USING (public.can_access_gestao('delete') OR created_by = auth.uid());

CREATE INDEX IF NOT EXISTS gestao_notas_situacao_idx ON public.gestao_notas (situacao, created_at DESC);

DROP TRIGGER IF EXISTS trg_gestao_notas_updated_at ON public.gestao_notas;
CREATE TRIGGER trg_gestao_notas_updated_at
  BEFORE UPDATE ON public.gestao_notas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Visão consolidada (somente leitura, sem alterar dados)
CREATE OR REPLACE FUNCTION public.gestao_overview(p_dias integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ini timestamptz := now() - (greatest(coalesce(p_dias,30), 1) || ' days')::interval;
  v_out jsonb;
BEGIN
  IF NOT public.can_access_gestao('read') THEN
    RAISE EXCEPTION 'Sem permissão para o Centro de Gestão';
  END IF;

  SELECT jsonb_build_object(
    'periodo_dias', greatest(coalesce(p_dias,30), 1),
    'gerado_em', now(),
    'backorder', (
      SELECT jsonb_build_object(
        'total', count(*),
        'por_status', coalesce(jsonb_object_agg(t.status_cat, t.qtd) FILTER (WHERE t.status_cat IS NOT NULL), '{}'::jsonb)
      )
      FROM (
        SELECT coalesce(nullif(btrim(status_cat),''),'indefinido') AS status_cat, count(*) AS qtd
        FROM public.backorder_os GROUP BY 1
      ) t
    ),
    'backorder_envelhecido', (
      SELECT count(*) FROM public.backorder_os
      WHERE finalizado = false AND cancelado = false
        AND data_solicitacao < now() - interval '30 days'
    ),
    'backorder_mensal', (
      SELECT coalesce(jsonb_agg(x ORDER BY x->>'mes'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'mes', to_char(date_trunc('month', data_solicitacao), 'YYYY-MM'),
          'total', count(*),
          'concluidas', count(*) FILTER (WHERE finalizado),
          'canceladas', count(*) FILTER (WHERE cancelado)
        ) x
        FROM public.backorder_os
        WHERE data_solicitacao >= date_trunc('month', now()) - interval '11 months'
        GROUP BY 1
      ) s
    ),
    'backorder_equipes', (
      SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('equipe', coalesce(nullif(btrim(equipe),''),'Outros'), 'abertas', count(*)) x
        FROM public.backorder_os
        WHERE finalizado = false AND cancelado = false
        GROUP BY 1 ORDER BY count(*) DESC LIMIT 8
      ) s
    ),
    'corretiva', (
      SELECT jsonb_build_object(
        'abertas', count(*) FILTER (WHERE coalesce(status,'') NOT IN ('concluida','cancelada','finalizada')),
        'periodo', count(*) FILTER (WHERE created_at >= v_ini)
      ) FROM public.corretiva_os
    ),
    'refrigeracao', (
      SELECT jsonb_build_object(
        'abertas', count(*) FILTER (WHERE coalesce(status,'') NOT IN ('concluida','cancelada','finalizada')),
        'periodo', count(*) FILTER (WHERE created_at >= v_ini)
      ) FROM public.refrigeracao_os
    ),
    'agua', (
      SELECT jsonb_build_object(
        'entregas_periodo', count(*) FILTER (WHERE criado_em >= v_ini),
        'bags_periodo', coalesce(sum(bags) FILTER (WHERE criado_em >= v_ini), 0),
        'bebedouros_nok', count(*) FILTER (WHERE criado_em >= v_ini AND bebedouro_ok = false)
      ) FROM public.agua_prog_entregas
    ),
    'frota', (
      SELECT jsonb_build_object(
        'checklists_periodo', (SELECT count(*) FROM public.fleet_checklists WHERE created_at >= v_ini),
        'checklists_reprovados', (SELECT count(*) FROM public.fleet_checklists WHERE created_at >= v_ini AND overall_status <> 'ok'),
        'custo_periodo', (SELECT coalesce(sum(total_cost),0) FROM public.fleet_fuelings WHERE fueled_at >= v_ini),
        'litros_periodo', (SELECT coalesce(sum(liters),0) FROM public.fleet_fuelings WHERE fueled_at >= v_ini)
      )
    ),
    'materiais', (
      SELECT jsonb_build_object(
        'pendentes', count(*) FILTER (WHERE coalesce(status,'') NOT IN ('concluida','cancelada','atendida')),
        'periodo', count(*) FILTER (WHERE created_at >= v_ini)
      ) FROM public.material_solicitacoes
    ),
    'legal', (
      SELECT jsonb_build_object(
        'total', count(*),
        'vencidos', count(*) FILTER (WHERE concluido = false AND proxima_execucao IS NOT NULL AND proxima_execucao < current_date),
        'proximos_30', count(*) FILTER (WHERE concluido = false AND proxima_execucao BETWEEN current_date AND current_date + 30)
      ) FROM public.legal_items
    ),
    'sst', (
      SELECT jsonb_build_object(
        'aso_vencidos', count(*) FILTER (WHERE ativo AND data_vencimento IS NOT NULL AND data_vencimento < current_date),
        'aso_proximos_30', count(*) FILTER (WHERE ativo AND data_vencimento BETWEEN current_date AND current_date + 30)
      ) FROM public.sst_colaboradores
    ),
    'taludes', (
      SELECT jsonb_build_object(
        'pt_ativas', count(*) FILTER (WHERE status IN ('liberada','em_analise','solicitada')),
        'pt_suspensas', count(*) FILTER (WHERE status = 'suspensa')
      ) FROM public.talude_pt_releases
    ),
    'notas_abertas', (SELECT count(*) FROM public.gestao_notas WHERE situacao = 'aberta')
  ) INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.gestao_overview(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.gestao_overview(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_gestao(text) TO authenticated;