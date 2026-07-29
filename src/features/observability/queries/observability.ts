import { supabase } from "@/integrations/supabase/client";
import { outboxAll as refrigOutbox } from "@/lib/refrigeracao/db";
import type {
  ClientErrorLog,
  HealthStatus,
  IntegrationHealth,
  JobFailure,
  ObservabilitySnapshot,
  OfflineQueueSnapshot,
} from "../types";

const sel = (s: string): string => s;

function since(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

function mapWeatherState(state: string | null, consecutiveErrors: number | null): HealthStatus {
  if ((consecutiveErrors ?? 0) >= 3 || state === "down" || state === "erro") return "falha";
  if ((consecutiveErrors ?? 0) > 0 || state === "degraded") return "degradado";
  if (state === "ok" || state === "up") return "ok";
  return "desconhecido";
}

/** Consolida o estado técnico do sistema para o painel administrativo. */
export async function fetchObservability(signal?: AbortSignal): Promise<ObservabilitySnapshot> {
  const day = since(24);

  const [errorsRes, heartbeatRes, weatherRes, jobsRes, sheetsRes, uploadsRes] = await Promise.all([
    supabase
      .from("client_error_logs")
      .select(sel("id, level, origin, message, detail, route, module_key, created_at"))
      .order("created_at", { ascending: false })
      .limit(120)
      .abortSignal(signal as AbortSignal),
    supabase
      .from("integration_heartbeats")
      .select(sel("integration, status, message, duration_ms, created_at"))
      .gte("created_at", since(72))
      .order("created_at", { ascending: false })
      .limit(300)
      .abortSignal(signal as AbortSignal),
    supabase
      .from("weather_source_health")
      .select(sel("source, state, last_error, last_run_at, last_success_at, latency_ms, consecutive_errors"))
      .abortSignal(signal as AbortSignal),
    supabase
      .from("pointing_jobs")
      .select(sel("id, os_number, status, error_message, finished_at, updated_at"))
      .in("status", ["failed", "review"])
      .order("updated_at", { ascending: false })
      .limit(40)
      .abortSignal(signal as AbortSignal),
    supabase
      .from("spreadsheet_jobs")
      .select(sel("id, file_name, status, error_message, updated_at"))
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(40)
      .abortSignal(signal as AbortSignal),
    supabase
      .from("image_uploads")
      .select(sel("id, module_key, url, created_at"))
      .order("created_at", { ascending: false })
      .limit(1)
      .abortSignal(signal as AbortSignal),
  ]);

  const errorRows = (errorsRes.data ?? []) as unknown as Array<Record<string, unknown>>;
  const errors: ClientErrorLog[] = errorRows.map((r) => ({
    id: String(r.id),
    level: (String(r.level ?? "error") as ClientErrorLog["level"]) ?? "error",
    origin: String(r.origin ?? "client"),
    message: String(r.message ?? ""),
    detail: (r.detail as string | null) ?? null,
    route: (r.route as string | null) ?? null,
    moduleKey: (r.module_key as string | null) ?? null,
    createdAt: String(r.created_at),
  }));

  const beats = (heartbeatRes.data ?? []) as unknown as Array<Record<string, unknown>>;
  const byIntegration = new Map<string, IntegrationHealth>();
  for (const b of beats) {
    const key = String(b.integration);
    if (byIntegration.has(key)) continue;
    const status = String(b.status ?? "ok");
    byIntegration.set(key, {
      integration: key,
      status: (["ok", "degradado", "falha"].includes(status) ? status : "desconhecido") as HealthStatus,
      message: (b.message as string | null) ?? null,
      lastRunAt: String(b.created_at),
      durationMs: (b.duration_ms as number | null) ?? null,
    });
  }
  for (const w of (weatherRes.data ?? []) as unknown as Array<Record<string, unknown>>) {
    const key = `clima:${String(w.source)}`;
    byIntegration.set(key, {
      integration: key,
      status: mapWeatherState(
        (w.state as string | null) ?? null,
        (w.consecutive_errors as number | null) ?? null,
      ),
      message: (w.last_error as string | null) ?? null,
      lastRunAt: (w.last_run_at as string | null) ?? null,
      durationMs: (w.latency_ms as number | null) ?? null,
    });
  }

  const jobFailures: JobFailure[] = [
    ...((jobsRes.data ?? []) as unknown as Array<Record<string, unknown>>).map((j) => ({
      id: String(j.id),
      source: "Apontamento automático",
      reference: String(j.os_number ?? "—"),
      message: String(j.error_message ?? j.status ?? "Falha não detalhada"),
      at: String(j.finished_at ?? j.updated_at ?? ""),
    })),
    ...((sheetsRes.data ?? []) as unknown as Array<Record<string, unknown>>).map((j) => ({
      id: String(j.id),
      source: "Processamento de planilha",
      reference: String(j.file_name ?? "—"),
      message: String(j.error_message ?? "Falha não detalhada"),
      at: String(j.updated_at ?? ""),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const uploadFailures: JobFailure[] = errors
    .filter((e) => /upload|imgbb|foto|imagem/i.test(`${e.origin} ${e.message} ${e.moduleKey ?? ""}`))
    .slice(0, 30)
    .map((e) => ({
      id: e.id,
      source: "Upload de imagem",
      reference: e.moduleKey ?? e.route ?? "—",
      message: e.message,
      at: e.createdAt,
    }));

  const durations = [...byIntegration.values()]
    .map((i) => i.durationMs)
    .filter((n): n is number => typeof n === "number" && n > 0);

  const lastUpload = ((uploadsRes.data ?? []) as unknown as Array<Record<string, unknown>>)[0];

  return {
    errors,
    errors24h: errors.filter((e) => e.createdAt >= day && e.level === "error").length,
    integrations: [...byIntegration.values()].sort((a, b) => a.integration.localeCompare(b.integration)),
    jobFailures,
    uploadFailures,
    lastSyncAt: lastUpload ? String(lastUpload.created_at) : null,
    avgResponseMs: durations.length
      ? Math.round(durations.reduce((s, n) => s + n, 0) / durations.length)
      : null,
  };
}

/** Fila offline pendente no dispositivo atual (IndexedDB). */
export async function fetchOfflineQueue(): Promise<OfflineQueueSnapshot[]> {
  const out: OfflineQueueSnapshot[] = [];
  try {
    const items = await refrigOutbox();
    out.push({
      module: "Refrigeração",
      pending: items.filter((i) => !("dead" in i && i.dead)).length,
      dead: items.filter((i) => "dead" in i && Boolean(i.dead)).length,
      oldestAt: items.length
        ? Math.min(...items.map((i) => Number((i as { createdAt?: number }).createdAt ?? Date.now())))
        : null,
    });
  } catch {
    /* módulo offline indisponível neste dispositivo */
  }
  return out;
}
