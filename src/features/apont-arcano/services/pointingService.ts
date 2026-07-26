import { supabase } from "@/integrations/supabase/client";
import type {
  AgentDevice,
  JobPayload,
  MaintenanceTeam,
  PointingBatch,
  PointingJob,
} from "../types/pointing";

/* ---------------- Equipes ---------------- */

export async function listTeams(): Promise<MaintenanceTeam[]> {
  const { data, error } = await supabase
    .from("maintenance_teams")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MaintenanceTeam[];
}

export type TeamInput = {
  name: string;
  category: string;
  duration_minutes: number;
  duration_text: string;
  technicians: string[];
  active: boolean;
};

export async function createTeam(input: TeamInput): Promise<MaintenanceTeam> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) throw new Error("Sessão expirada. Entre novamente.");
  const { data, error } = await supabase
    .from("maintenance_teams")
    .insert({ ...input, user_id: userId })
    .select("*")
    .single();
  if (error) throw error;
  return data as MaintenanceTeam;
}

export async function updateTeam(id: string, input: Partial<TeamInput>): Promise<MaintenanceTeam> {
  const { data, error } = await supabase
    .from("maintenance_teams")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as MaintenanceTeam;
}

export async function deleteTeam(id: string): Promise<void> {
  const { error } = await supabase.from("maintenance_teams").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------- Agentes ---------------- */

export async function listAgents(): Promise<AgentDevice[]> {
  const { data, error } = await supabase
    .from("agent_devices")
    .select("*")
    .order("last_seen_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as AgentDevice[];
}

/* ---------------- Lotes e jobs ---------------- */

export async function listBatches(limit = 60): Promise<PointingBatch[]> {
  const { data, error } = await supabase
    .from("pointing_batches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as PointingBatch[];
}

export async function listJobsByBatch(batchId: string): Promise<PointingJob[]> {
  const { data, error } = await supabase
    .from("pointing_jobs")
    .select("*")
    .eq("batch_id", batchId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PointingJob[];
}

export async function listRecentJobs(limit = 500): Promise<PointingJob[]> {
  const { data, error } = await supabase
    .from("pointing_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as PointingJob[];
}

export async function createBatch(params: {
  name: string | null;
  teamId: string;
  settings: Record<string, unknown>;
  jobs: JobPayload[];
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_pointing_batch", {
    p_name: params.name,
    p_team_id: params.teamId,
    p_settings: params.settings as never,
    p_jobs: params.jobs as never,
  });
  if (error) throw error;
  return data as unknown as string;
}

export async function cancelQueuedJob(jobId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_queued_pointing_job", { p_job_id: jobId });
  if (error) throw error;
}

export async function retryJob(jobId: string): Promise<void> {
  const { error } = await supabase.rpc("retry_pointing_job", { p_job_id: jobId });
  if (error) throw error;
}

export async function requeueStaleJobs(minutes = 30): Promise<number> {
  const { data, error } = await supabase.rpc("requeue_stale_pointing_jobs", { p_minutes: minutes });
  if (error) throw error;
  return (data as unknown as number) ?? 0;
}
