import { supabase } from "@/integrations/supabase/client";

/** Uma execução de rotina server-side registrada em `job_runs` (item 21). */
export interface JobRun {
  id: string;
  job_key: string;
  status: "running" | "success" | "failed" | "skipped";
  attempt: number;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  result: unknown;
}

/** Últimas execuções das rotinas automáticas (cron/webhooks). */
export async function fetchJobRuns(limit = 60): Promise<JobRun[]> {
  const { data, error } = await (supabase as any)
    .from("job_runs")
    .select("id, job_key, status, attempt, started_at, finished_at, duration_ms, error_message, result")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as JobRun[];
}
