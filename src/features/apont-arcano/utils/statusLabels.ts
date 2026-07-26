import type { PointingJobStatus } from "../types/pointing";

export const JOB_STATUS_LABELS: Record<PointingJobStatus, string> = {
  queued: "Aguardando",
  processing: "Em execução",
  review: "Revisão manual",
  completed: "Concluída",
  failed: "Falha",
  cancelled: "Cancelada",
};

export const JOB_STATUS_CLASSES: Record<PointingJobStatus, string> = {
  queued: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  processing: "border-violet-400/40 bg-violet-500/15 text-violet-200 animate-pulse",
  review: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  completed: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  failed: "border-red-400/40 bg-red-500/10 text-red-200",
  cancelled: "border-white/10 bg-white/5 text-muted-foreground",
};

export type AgentPresence = "online" | "ocupado" | "instavel" | "offline" | "erro";

export const AGENT_PRESENCE_LABELS: Record<AgentPresence, string> = {
  online: "Online",
  ocupado: "Ocupado",
  instavel: "Instável",
  offline: "Offline",
  erro: "Erro",
};

export const AGENT_PRESENCE_CLASSES: Record<AgentPresence, string> = {
  online: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  ocupado: "border-violet-400/40 bg-violet-500/15 text-violet-200",
  instavel: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  offline: "border-white/10 bg-white/5 text-muted-foreground",
  erro: "border-red-400/40 bg-red-500/10 text-red-200",
};

export function computeAgentPresence(
  status: string | null | undefined,
  lastSeenAt: string | null | undefined,
  now: number = Date.now(),
): AgentPresence {
  if (!lastSeenAt) return "offline";
  const elapsed = (now - new Date(lastSeenAt).getTime()) / 1000;
  if (!Number.isFinite(elapsed) || elapsed > 45) return "offline";
  if (status === "error") return elapsed <= 45 ? "erro" : "offline";
  if (elapsed > 15) return "instavel";
  if (status === "busy") return "ocupado";
  if (status === "online") return "online";
  return "instavel";
}

export function relativeSeen(lastSeenAt: string | null | undefined, now: number = Date.now()): string {
  if (!lastSeenAt) return "sem heartbeat";
  const seconds = Math.max(0, Math.round((now - new Date(lastSeenAt).getTime()) / 1000));
  if (seconds < 60) return `visto há ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `visto há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `visto há ${hours} h`;
  return `visto há ${Math.round(hours / 24)} d`;
}

/** Compara versões semver simples: retorna true quando `version` >= `min`. */
export function isVersionAtLeast(version: string | null | undefined, min: string): boolean {
  if (!version) return false;
  const a = version.replace(/^v/i, "").split(".").map((n) => Number(n) || 0);
  const b = min.split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}
