ALTER TABLE public.agua_programacao
  ADD COLUMN IF NOT EXISTS turno text NOT NULL DEFAULT 'manha',
  ADD COLUMN IF NOT EXISTS equipe text,
  ADD COLUMN IF NOT EXISTS template_key text NOT NULL DEFAULT 'padrao';

CREATE TABLE IF NOT EXISTS public.agua_feriados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  descricao text NOT NULL,
  tipo text NOT NULL DEFAULT 'feriado' CHECK (tipo IN ('feriado','bloqueio')),
  bloqueia_geracao boolean NOT NULL DEFAULT true,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (data, descricao)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agua_feriados TO authenticated;
GRANT ALL ON public.agua_feriados TO service_role;
ALTER TABLE public.agua_feriados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agua_feriados_select" ON public.agua_feriados FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_feriados_insert" ON public.agua_feriados FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_feriados_update" ON public.agua_feriados FOR UPDATE TO authenticated USING (public.agua_is_gestor()) WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_feriados_delete" ON public.agua_feriados FOR DELETE TO authenticated USING (public.agua_is_gestor());
CREATE TRIGGER agua_feriados_touch BEFORE UPDATE ON public.agua_feriados FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.agua_excecoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ponto_id uuid NOT NULL REFERENCES public.agua_pontos(id) ON DELETE CASCADE,
  data date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('remover','extra')),
  bags integer NOT NULL DEFAULT 1 CHECK (bags >= 0),
  turno text NOT NULL DEFAULT 'manha',
  motivo text,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ponto_id, data, tipo)
);
CREATE INDEX IF NOT EXISTS agua_excecoes_data_idx ON public.agua_excecoes (data);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agua_excecoes TO authenticated;
GRANT ALL ON public.agua_excecoes TO service_role;
ALTER TABLE public.agua_excecoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agua_excecoes_select" ON public.agua_excecoes FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_excecoes_insert" ON public.agua_excecoes FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_excecoes_update" ON public.agua_excecoes FOR UPDATE TO authenticated USING (public.agua_is_gestor()) WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_excecoes_delete" ON public.agua_excecoes FOR DELETE TO authenticated USING (public.agua_is_gestor());
CREATE TRIGGER agua_excecoes_touch BEFORE UPDATE ON public.agua_excecoes FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.agua_rotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  turno text NOT NULL DEFAULT 'manha',
  equipe text NOT NULL DEFAULT 'geral',
  template_key text NOT NULL DEFAULT 'padrao',
  colaborador_principal text,
  colaborador_secundario text,
  veiculo text,
  supervisor text,
  horario_previsto time,
  bags_carregadas integer CHECK (bags_carregadas >= 0),
  observacao text,
  status text NOT NULL DEFAULT 'planejada' CHECK (status IN ('planejada','pronta','em_andamento','concluida','cancelada')),
  motivo_cancelamento text,
  versao integer NOT NULL DEFAULT 1,
  iniciada_em timestamptz,
  finalizada_em timestamptz,
  criado_por uuid,
  atualizado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (data, turno, equipe, template_key)
);
CREATE INDEX IF NOT EXISTS agua_rotas_data_idx ON public.agua_rotas (data DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agua_rotas TO authenticated;
GRANT ALL ON public.agua_rotas TO service_role;
ALTER TABLE public.agua_rotas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agua_rotas_select" ON public.agua_rotas FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_rotas_insert" ON public.agua_rotas FOR INSERT TO authenticated WITH CHECK (public.agua_is_gestor());
CREATE POLICY "agua_rotas_update" ON public.agua_rotas FOR UPDATE TO authenticated USING (public.agua_can('update') OR public.agua_is_gestor()) WITH CHECK (public.agua_can('update') OR public.agua_is_gestor());
CREATE POLICY "agua_rotas_delete" ON public.agua_rotas FOR DELETE TO authenticated USING (public.agua_is_gestor());
CREATE TRIGGER agua_rotas_touch BEFORE UPDATE ON public.agua_rotas FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.agua_rota_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL REFERENCES public.agua_rotas(id) ON DELETE CASCADE,
  versao integer NOT NULL,
  snapshot jsonb NOT NULL,
  motivo text,
  usuario_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agua_rota_versoes_rota_idx ON public.agua_rota_versoes (rota_id, versao DESC);
GRANT SELECT, INSERT ON public.agua_rota_versoes TO authenticated;
GRANT ALL ON public.agua_rota_versoes TO service_role;
ALTER TABLE public.agua_rota_versoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agua_rota_versoes_select" ON public.agua_rota_versoes FOR SELECT TO authenticated USING (public.agua_can('read'));
CREATE POLICY "agua_rota_versoes_insert" ON public.agua_rota_versoes FOR INSERT TO authenticated WITH CHECK (public.agua_can('update') OR public.agua_is_gestor());

CREATE TABLE IF NOT EXISTS public.agua_geracao_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_alvo date NOT NULL,
  origem text NOT NULL DEFAULT 'cron',
  status text NOT NULL DEFAULT 'ok',
  rotas_criadas integer NOT NULL DEFAULT 0,
  visitas_criadas integer NOT NULL DEFAULT 0,
  ignoradas integer NOT NULL DEFAULT 0,
  mensagem text,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  usuario_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agua_geracao_jobs_criado_idx ON public.agua_geracao_jobs (criado_em DESC);
GRANT SELECT ON public.agua_geracao_jobs TO authenticated;
GRANT ALL ON public.agua_geracao_jobs TO service_role;
ALTER TABLE public.agua_geracao_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agua_geracao_jobs_select" ON public.agua_geracao_jobs FOR SELECT TO authenticated USING (public.agua_can('read'));

ALTER TABLE public.agua_visitas
  ADD COLUMN IF NOT EXISTS rota_id uuid REFERENCES public.agua_rotas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS turno text NOT NULL DEFAULT 'manha',
  ADD COLUMN IF NOT EXISTS excepcional boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS agua_visitas_rota_idx ON public.agua_visitas (rota_id);

CREATE OR REPLACE FUNCTION public.agua_gerar_rotas(p_data date DEFAULT NULL, p_origem text DEFAULT 'manual')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_data date := COALESCE(p_data, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_dia smallint;
  v_rotas int := 0;
  v_visitas int := 0;
  v_feriado text;
BEGIN
  IF v_uid IS NOT NULL AND NOT public.agua_can('read') THEN
    RAISE EXCEPTION 'sem permissao';
  END IF;

  v_dia := EXTRACT(isodow FROM v_data)::smallint;

  SELECT descricao INTO v_feriado FROM public.agua_feriados
   WHERE data = v_data AND bloqueia_geracao LIMIT 1;

  IF v_feriado IS NOT NULL THEN
    INSERT INTO public.agua_geracao_jobs(data_alvo, origem, status, mensagem, usuario_id)
    VALUES (v_data, p_origem, 'ignorado', 'Data bloqueada: ' || v_feriado, v_uid);
    RETURN jsonb_build_object('data', v_data, 'status', 'ignorado', 'motivo', v_feriado);
  END IF;

  WITH grupos AS (
    SELECT DISTINCT coalesce(g.turno,'manha') AS turno,
                    coalesce(g.equipe,'geral') AS equipe,
                    coalesce(g.template_key,'padrao') AS template_key
      FROM public.agua_programacao g
     WHERE g.ativo AND g.dia_semana = v_dia
  ), ins AS (
    INSERT INTO public.agua_rotas (data, turno, equipe, template_key, criado_por)
    SELECT v_data, turno, equipe, template_key, v_uid FROM grupos
    ON CONFLICT (data, turno, equipe, template_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_rotas FROM ins;

  WITH base AS (
    SELECT g.ponto_id,
           coalesce(g.turno,'manha') AS turno,
           coalesce(g.equipe,'geral') AS equipe,
           coalesce(g.template_key,'padrao') AS template_key,
           g.bags, g.ordem, false AS excepcional
      FROM public.agua_programacao g
      JOIN public.agua_pontos pt ON pt.id = g.ponto_id AND pt.ativo
     WHERE g.ativo AND g.dia_semana = v_dia
       AND NOT EXISTS (
         SELECT 1 FROM public.agua_excecoes e
          WHERE e.ponto_id = g.ponto_id AND e.data = v_data AND e.tipo = 'remover')
    UNION ALL
    SELECT e.ponto_id, coalesce(e.turno,'manha'), 'geral', 'padrao', e.bags, 999, true
      FROM public.agua_excecoes e
      JOIN public.agua_pontos pt ON pt.id = e.ponto_id AND pt.ativo
     WHERE e.data = v_data AND e.tipo = 'extra'
  ), ins AS (
    INSERT INTO public.agua_visitas (ponto_id, data, dia_semana, status, bags_previstas, turno, ordem, excepcional, rota_id)
    SELECT b.ponto_id, v_data, v_dia, 'pendente', b.bags, b.turno, b.ordem, b.excepcional,
           (SELECT r.id FROM public.agua_rotas r
             WHERE r.data = v_data AND r.turno = b.turno AND r.equipe = b.equipe
               AND r.template_key = b.template_key LIMIT 1)
      FROM base b
    ON CONFLICT (ponto_id, data) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_visitas FROM ins;

  INSERT INTO public.agua_geracao_jobs(data_alvo, origem, status, rotas_criadas, visitas_criadas, usuario_id, mensagem)
  VALUES (v_data, p_origem, 'ok', v_rotas, v_visitas, v_uid,
          format('%s rota(s) e %s parada(s) criadas', v_rotas, v_visitas));

  RETURN jsonb_build_object('data', v_data, 'status', 'ok', 'rotas', v_rotas, 'visitas', v_visitas);
END;
$$;

GRANT EXECUTE ON FUNCTION public.agua_gerar_rotas(date, text) TO authenticated, service_role, anon;