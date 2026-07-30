import { getModalityConfig } from "./modalities";
import type { WorkOrderModality, WorkOrderPriority, WorkOrderStatus } from "./types";

export type TransitionResult = { ok: true } | { ok: false; reason: string };

/** Valida uma transição de status conforme a máquina de estados da modalidade. */
export function canTransition(
  modality: WorkOrderModality,
  from: WorkOrderStatus,
  to: WorkOrderStatus,
): TransitionResult {
  const config = getModalityConfig(modality);
  if (!config.statuses.includes(to)) {
    return { ok: false, reason: `Status "${to}" não é permitido em ${config.label}.` };
  }
  if (from === to) return { ok: false, reason: "A ordem já está neste status." };
  const allowed = config.transitions[from] ?? [];
  if (!allowed.includes(to)) {
    return { ok: false, reason: `Transição de "${from}" para "${to}" não é permitida.` };
  }
  return { ok: true };
}

export function nextStatuses(
  modality: WorkOrderModality,
  from: WorkOrderStatus,
): WorkOrderStatus[] {
  return getModalityConfig(modality).transitions[from] ?? [];
}

export function isTerminal(modality: WorkOrderModality, status: WorkOrderStatus): boolean {
  return nextStatuses(modality, status).length === 0;
}

/** Data limite de atendimento segundo o SLA da modalidade/prioridade. */
export function slaDeadline(
  modality: WorkOrderModality,
  priority: WorkOrderPriority,
  createdAt: Date,
): Date {
  const hours = getModalityConfig(modality).sla[priority];
  return new Date(createdAt.getTime() + hours * 3600_000);
}

export type SlaState = "ok" | "atencao" | "vencido";

/** Situação do SLA: vencido, em atenção (>=80% consumido) ou ok. */
export function slaState(
  modality: WorkOrderModality,
  priority: WorkOrderPriority,
  createdAt: Date,
  now: Date = new Date(),
): SlaState {
  const deadline = slaDeadline(modality, priority, createdAt);
  if (now >= deadline) return "vencido";
  const total = deadline.getTime() - createdAt.getTime();
  const used = now.getTime() - createdAt.getTime();
  return used / total >= 0.8 ? "atencao" : "ok";
}
