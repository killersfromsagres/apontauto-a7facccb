CREATE OR REPLACE FUNCTION public.jobs_limpeza_filas(p_dias integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dias integer := greatest(coalesce(p_dias, 90), 30);
  v_corte timestamptz := now() - make_interval(days => v_dias);
  v_runs integer := 0;
  v_zap integer := 0;
  v_ger integer := 0;
  v_err integer := 0;
BEGIN
  DELETE FROM public.job_runs
   WHERE status IN ('success','skipped') AND started_at < v_corte;
  GET DIAGNOSTICS v_runs = ROW_COUNT;

  DELETE FROM public.agua_whatsapp_envios
   WHERE criado_em < v_corte
     AND status IN ('entregue','lido','falha','cancelado');
  GET DIAGNOSTICS v_zap = ROW_COUNT;

  DELETE FROM public.agua_geracao_jobs
   WHERE criado_em < v_corte;
  GET DIAGNOSTICS v_ger = ROW_COUNT;

  DELETE FROM public.client_error_logs
   WHERE created_at < v_corte;
  GET DIAGNOSTICS v_err = ROW_COUNT;

  RETURN jsonb_build_object('dias', v_dias, 'job_runs', v_runs,
    'whatsapp', v_zap, 'geracao_jobs', v_ger, 'client_error_logs', v_err);
END;
$$;

REVOKE ALL ON FUNCTION public.jobs_limpeza_filas(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jobs_limpeza_filas(integer) TO service_role;