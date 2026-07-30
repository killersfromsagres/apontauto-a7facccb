CREATE TABLE IF NOT EXISTS public.job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key text NOT NULL,
  idempotency_key text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','failed','skipped')),
  attempt integer NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  result jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.job_runs TO authenticated;
GRANT ALL ON public.job_runs TO service_role;

ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_runs_select" ON public.job_runs;
CREATE POLICY "job_runs_select" ON public.job_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.can_access_module('observabilidade', 'read'));

CREATE UNIQUE INDEX IF NOT EXISTS job_runs_idem_uk
  ON public.job_runs (job_key, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS job_runs_key_started_idx
  ON public.job_runs (job_key, started_at DESC);
CREATE INDEX IF NOT EXISTS job_runs_running_idx
  ON public.job_runs (job_key, started_at DESC) WHERE status = 'running';

DROP TRIGGER IF EXISTS trg_job_runs_updated_at ON public.job_runs;
CREATE TRIGGER trg_job_runs_updated_at BEFORE UPDATE ON public.job_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Abre uma execução respeitando idempotência, limite de concorrência e TTL da trava.
CREATE OR REPLACE FUNCTION public.job_begin(
  p_job_key text,
  p_idempotency_key text DEFAULT NULL,
  p_lock_ttl_seconds integer DEFAULT 300,
  p_max_concurrent integer DEFAULT 1
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing public.job_runs;
  v_running integer;
  v_id uuid;
  v_attempt integer := 1;
BEGIN
  IF coalesce(btrim(p_job_key), '') = '' THEN
    RAISE EXCEPTION 'job_key obrigatorio';
  END IF;

  -- Trava lógica: execuções presas além do TTL são marcadas como falha.
  UPDATE public.job_runs
     SET status = 'failed',
         finished_at = now(),
         error_message = 'timeout: execucao excedeu o TTL da trava'
   WHERE job_key = p_job_key
     AND status = 'running'
     AND started_at < now() - make_interval(secs => greatest(coalesce(p_lock_ttl_seconds, 300), 5));

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.job_runs
     WHERE job_key = p_job_key AND idempotency_key = p_idempotency_key
     LIMIT 1;
    IF v_existing.id IS NOT NULL THEN
      IF v_existing.status IN ('success','skipped') THEN
        RETURN jsonb_build_object('acquired', false, 'reason', 'duplicate',
                                  'run_id', v_existing.id, 'result', v_existing.result);
      ELSIF v_existing.status = 'running' THEN
        RETURN jsonb_build_object('acquired', false, 'reason', 'in_progress', 'run_id', v_existing.id);
      ELSE
        UPDATE public.job_runs
           SET status = 'running', attempt = v_existing.attempt + 1,
               started_at = now(), finished_at = NULL, error_message = NULL
         WHERE id = v_existing.id
        RETURNING id, attempt INTO v_id, v_attempt;
        RETURN jsonb_build_object('acquired', true, 'run_id', v_id, 'attempt', v_attempt);
      END IF;
    END IF;
  END IF;

  SELECT count(*) INTO v_running FROM public.job_runs
   WHERE job_key = p_job_key AND status = 'running';
  IF v_running >= greatest(coalesce(p_max_concurrent, 1), 1) THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'locked', 'running', v_running);
  END IF;

  INSERT INTO public.job_runs (job_key, idempotency_key, status)
  VALUES (p_job_key, p_idempotency_key, 'running')
  RETURNING id, attempt INTO v_id, v_attempt;

  RETURN jsonb_build_object('acquired', true, 'run_id', v_id, 'attempt', v_attempt);
END;
$$;

-- Encerra a execução registrando duração, resultado ou erro.
CREATE OR REPLACE FUNCTION public.job_finish(
  p_run_id uuid,
  p_status text,
  p_result jsonb DEFAULT NULL,
  p_error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.job_runs
     SET status = CASE WHEN p_status IN ('success','failed','skipped') THEN p_status ELSE 'failed' END,
         finished_at = now(),
         duration_ms = greatest(0, (extract(epoch FROM (now() - started_at)) * 1000)::int),
         result = coalesce(p_result, result),
         error_message = left(p_error, 2000)
   WHERE id = p_run_id;
END;
$$;

-- Limpeza SEGURA de filas temporárias. Nunca remove fotos/evidências.
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
   WHERE created_at < v_corte
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

REVOKE ALL ON FUNCTION public.job_begin(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_finish(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.jobs_limpeza_filas(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_begin(text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.job_finish(uuid, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.jobs_limpeza_filas(integer) TO service_role;