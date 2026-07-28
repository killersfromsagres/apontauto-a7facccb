// Registro de processamentos (metadados apenas — o conteúdo da planilha
// nunca sai do navegador).

import { supabase } from "@/integrations/supabase/client";
import type { SheetPlan } from "./spreadsheet-io";
import type { Totals } from "./sheet-fill";

const db = supabase as any;

export interface JobRow {
  id: string;
  kind: string;
  file_name: string;
  file_size: number;
  file_type: string;
  sheet_name: string | null;
  status: string;
  totals: Totals | null;
  total_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface UnmatchedRow {
  id: string;
  job_id: string;
  sheet_name: string;
  row_number: number;
  code: string;
  reason: string;
  status: string;
  resolved_code: string | null;
  created_at: string;
}

export async function listJobs(limit = 50): Promise<JobRow[]> {
  const { data, error } = await db
    .from("spreadsheet_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as JobRow[];
}

export async function listUnmatched(jobId?: string, limit = 500): Promise<UnmatchedRow[]> {
  let q = db.from("spreadsheet_unmatched").select("*").order("created_at", { ascending: false }).limit(limit);
  if (jobId) q = q.eq("job_id", jobId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as UnmatchedRow[];
}

export async function markUnmatchedResolved(id: string, resolvedCode: string) {
  const { data: userRes } = await supabase.auth.getUser();
  const { error } = await db
    .from("spreadsheet_unmatched")
    .update({
      status: "resolved",
      resolved_code: resolvedCode || null,
      resolved_by: userRes?.user?.id ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export interface SaveJobInput {
  fileName: string;
  fileSize: number;
  fileType: string;
  catalogId: string | null;
  columnMapping: Record<string, unknown>;
  options: Record<string, unknown>;
  totals: Totals;
  durationMs: number;
  plans: SheetPlan[];
}

/** Grava o job e as inconsistências (sem enviar o conteúdo da planilha). */
export async function saveJob(input: SaveJobInput): Promise<string | null> {
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes?.user?.id;
  if (!userId) return null;

  const { data, error } = await db
    .from("spreadsheet_jobs")
    .insert({
      user_id: userId,
      catalog_id: input.catalogId,
      kind: "fill",
      file_name: input.fileName,
      file_size: input.fileSize,
      file_type: input.fileType,
      sheet_name: input.plans.map((p) => p.sheetName).join(", ").slice(0, 200),
      status: "completed",
      progress: 100,
      column_mapping: input.columnMapping,
      options: { ...input.options, duration_ms: input.durationMs },
      totals: input.totals as unknown as Record<string, number>,
      total_rows: input.totals.rowsWithAsset,
      processed_rows: input.totals.rowsWithAsset,
      matched_rows: input.totals.tree + input.totals.legacy,
      unmatched_rows: input.totals.unmatched,
      started_at: new Date(Date.now() - input.durationMs).toISOString(),
      finished_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;

  const jobId = data.id as string;
  const rows = input.plans.flatMap((p) =>
    p.results
      .filter((r) => r.status === "unmatched" || r.status === "conflict")
      .slice(0, 2000)
      .map((r) => ({
        job_id: jobId,
        sheet_name: p.sheetName,
        row_number: r.row,
        code: r.code,
        raw_row: {},
        reason: r.status === "conflict" ? "conflict" : r.issues.join(";") || "not-found",
        status: "pending",
      })),
  );
  for (let i = 0; i < rows.length; i += 500) {
    await db.from("spreadsheet_unmatched").insert(rows.slice(i, i + 500));
  }
  return jobId;
}
