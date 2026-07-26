-- ============ ENUM ============
DO $$ BEGIN
  CREATE TYPE public.pointing_job_status AS ENUM ('queued','processing','review','completed','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ maintenance_teams ============
CREATE TABLE IF NOT EXISTS public.maintenance_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT '',
  duration_minutes integer NOT NULL DEFAULT 30,
  duration_text text NOT NULL DEFAULT '00:30',
  technicians text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_teams TO authenticated;
GRANT ALL ON public.maintenance_teams TO service_role;
ALTER TABLE public.maintenance_teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own maintenance_teams" ON public.maintenance_teams;
CREATE POLICY "own maintenance_teams" ON public.maintenance_teams FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ agent_devices ============
CREATE TABLE IF NOT EXISTS public.agent_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  device_name text NOT NULL DEFAULT 'desconhecido',
  platform text,
  app_version text,
  status text NOT NULL DEFAULT 'offline',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_devices TO authenticated;
GRANT ALL ON public.agent_devices TO service_role;
ALTER TABLE public.agent_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own agent_devices" ON public.agent_devices;
CREATE POLICY "own agent_devices" ON public.agent_devices FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_agent_devices_user ON public.agent_devices(user_id, last_seen_at DESC);

-- ============ pointing_batches ============
CREATE TABLE IF NOT EXISTS public.pointing_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text,
  team_id uuid REFERENCES public.maintenance_teams(id) ON DELETE SET NULL,
  team_name text,
  status text NOT NULL DEFAULT 'queued',
  total_jobs integer NOT NULL DEFAULT 0,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pointing_batches TO authenticated;
GRANT ALL ON public.pointing_batches TO service_role;
ALTER TABLE public.pointing_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own pointing_batches" ON public.pointing_batches;
CREATE POLICY "own pointing_batches" ON public.pointing_batches FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_pointing_batches_user ON public.pointing_batches(user_id, created_at DESC);

-- ============ pointing_jobs ============
CREATE TABLE IF NOT EXISTS public.pointing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.pointing_batches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  team_id uuid REFERENCES public.maintenance_teams(id) ON DELETE SET NULL,
  agent_id uuid REFERENCES public.agent_devices(id) ON DELETE SET NULL,
  os_number text NOT NULL,
  category text NOT NULL DEFAULT '',
  technicians text[] NOT NULL DEFAULT '{}',
  duration_minutes integer NOT NULL DEFAULT 30,
  duration_text text NOT NULL DEFAULT '00:30',
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL,
  team_name text NOT NULL DEFAULT '',
  status public.pointing_job_status NOT NULL DEFAULT 'queued',
  stage text,
  error_message text,
  result_message text,
  screenshot_path text,
  attempts integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pointing_jobs TO authenticated;
GRANT ALL ON public.pointing_jobs TO service_role;
ALTER TABLE public.pointing_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own pointing_jobs" ON public.pointing_jobs;
CREATE POLICY "own pointing_jobs" ON public.pointing_jobs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_pointing_jobs_user ON public.pointing_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pointing_jobs_batch ON public.pointing_jobs(batch_id, position);
CREATE INDEX IF NOT EXISTS idx_pointing_jobs_queue ON public.pointing_jobs(user_id, status, scheduled_start);

-- ============ updated_at triggers ============
DROP TRIGGER IF EXISTS trg_maintenance_teams_updated ON public.maintenance_teams;
CREATE TRIGGER trg_maintenance_teams_updated BEFORE UPDATE ON public.maintenance_teams
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_agent_devices_updated ON public.agent_devices;
CREATE TRIGGER trg_agent_devices_updated BEFORE UPDATE ON public.agent_devices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_pointing_batches_updated ON public.pointing_batches;
CREATE TRIGGER trg_pointing_batches_updated BEFORE UPDATE ON public.pointing_batches
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_pointing_jobs_updated ON public.pointing_jobs;
CREATE TRIGGER trg_pointing_jobs_updated BEFORE UPDATE ON public.pointing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ RPCs ============
CREATE OR REPLACE FUNCTION public.create_pointing_batch(
  p_name text,
  p_team_id uuid,
  p_settings jsonb,
  p_jobs jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_batch uuid;
  v_team_name text;
  v_count integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_jobs IS NULL OR jsonb_array_length(p_jobs) = 0 THEN RAISE EXCEPTION 'empty job list'; END IF;

  SELECT name INTO v_team_name FROM public.maintenance_teams
   WHERE id = p_team_id AND user_id = v_user;

  INSERT INTO public.pointing_batches (user_id, name, team_id, team_name, settings, total_jobs, status)
  VALUES (v_user, NULLIF(btrim(coalesce(p_name,'')),''), p_team_id, v_team_name,
          coalesce(p_settings,'{}'::jsonb), jsonb_array_length(p_jobs), 'queued')
  RETURNING id INTO v_batch;

  INSERT INTO public.pointing_jobs (
    batch_id, user_id, team_id, os_number, category, technicians,
    duration_minutes, duration_text, scheduled_start, scheduled_end, team_name, position
  )
  SELECT
    v_batch, v_user, p_team_id,
    btrim(j->>'os_number'),
    coalesce(j->>'category',''),
    coalesce((SELECT array_agg(x) FROM jsonb_array_elements_text(coalesce(j->'technicians','[]'::jsonb)) x), '{}'::text[]),
    coalesce((j->>'duration_minutes')::int, 30),
    coalesce(j->>'duration_text','00:30'),
    (j->>'scheduled_start')::timestamptz,
    (j->>'scheduled_end')::timestamptz,
    coalesce(j->>'team_name', coalesce(v_team_name,'')),
    (ord - 1)::int
  FROM jsonb_array_elements(p_jobs) WITH ORDINALITY AS t(j, ord);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN RAISE EXCEPTION 'no jobs created'; END IF;

  RETURN v_batch;
END $$;
REVOKE ALL ON FUNCTION public.create_pointing_batch(text, uuid, jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_pointing_batch(text, uuid, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_pointing_jobs(p_agent_id uuid, p_limit integer DEFAULT 1)
RETURNS SETOF public.pointing_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agent_devices d WHERE d.id = p_agent_id AND d.user_id = v_user) THEN
    RAISE EXCEPTION 'unknown agent';
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT j.id FROM public.pointing_jobs j
     WHERE j.user_id = v_user AND j.status = 'queued'
     ORDER BY j.scheduled_start, j.position
     LIMIT greatest(coalesce(p_limit,1), 1)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.pointing_jobs j
     SET status = 'processing',
         agent_id = p_agent_id,
         claimed_at = now(),
         started_at = coalesce(j.started_at, now()),
         attempts = j.attempts + 1,
         stage = coalesce(j.stage, 'reservado')
   WHERE j.id IN (SELECT id FROM picked)
  RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_pointing_jobs(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_pointing_jobs(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_queued_pointing_job(p_job_id uuid)
RETURNS public.pointing_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_row public.pointing_jobs;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.pointing_jobs
     SET status = 'cancelled', finished_at = now(), stage = 'cancelado pelo painel'
   WHERE id = p_job_id AND user_id = v_user AND status = 'queued'
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'job not cancellable'; END IF;
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.cancel_queued_pointing_job(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.cancel_queued_pointing_job(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.retry_pointing_job(p_job_id uuid)
RETURNS public.pointing_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_row public.pointing_jobs;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.pointing_jobs
     SET status = 'queued', stage = NULL, error_message = NULL, result_message = NULL,
         agent_id = NULL, claimed_at = NULL, started_at = NULL, finished_at = NULL
   WHERE id = p_job_id AND user_id = v_user AND status IN ('failed','review','cancelled')
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'job not retryable'; END IF;
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.retry_pointing_job(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.retry_pointing_job(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.requeue_stale_pointing_jobs(p_minutes integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_count integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.pointing_jobs
     SET status = 'queued', agent_id = NULL, claimed_at = NULL, started_at = NULL,
         stage = 'reenfileirado por inatividade'
   WHERE user_id = v_user AND status = 'processing'
     AND coalesce(claimed_at, updated_at) < now() - make_interval(mins => greatest(coalesce(p_minutes,30),1));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.requeue_stale_pointing_jobs(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.requeue_stale_pointing_jobs(integer) TO authenticated;

-- ============ Realtime ============
ALTER TABLE public.pointing_jobs REPLICA IDENTITY FULL;
ALTER TABLE public.pointing_batches REPLICA IDENTITY FULL;
ALTER TABLE public.agent_devices REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pointing_jobs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pointing_batches;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_devices;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;