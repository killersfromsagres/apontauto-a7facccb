// KPIs de processamento de planilhas — sempre agregados no banco (RPC),
// nunca baixando todas as linhas para contar no cliente.

import { supabase } from "@/integrations/supabase/client";

export interface FillMetrics {
  files: number;
  filesCompleted: number;
  files30d: number;
  rowsTotal: number;
  rowsMatched: number;
  rowsUnmatched: number;
  pendingUnmatched: number;
  lastJobAt: string | null;
  /** 0–100 */
  matchRate: number;
}

const EMPTY: FillMetrics = {
  files: 0,
  filesCompleted: 0,
  files30d: 0,
  rowsTotal: 0,
  rowsMatched: 0,
  rowsUnmatched: 0,
  pendingUnmatched: 0,
  lastJobAt: null,
  matchRate: 0,
};

export async function fetchFillMetrics(): Promise<FillMetrics> {
  const { data, error } = await (supabase as any).rpc("pcm_fill_metrics");
  if (error) throw error;
  const r = (data ?? {}) as Record<string, unknown>;
  const num = (k: string) => Number(r[k] ?? 0) || 0;
  const rowsTotal = num("rows_total");
  const rowsMatched = num("rows_matched");
  return {
    ...EMPTY,
    files: num("files"),
    filesCompleted: num("files_completed"),
    files30d: num("files_30d"),
    rowsTotal,
    rowsMatched,
    rowsUnmatched: num("rows_unmatched"),
    pendingUnmatched: num("pending_unmatched"),
    lastJobAt: (r["last_job_at"] as string | null) ?? null,
    matchRate: rowsTotal > 0 ? Math.round((rowsMatched / rowsTotal) * 1000) / 10 : 0,
  };
}
