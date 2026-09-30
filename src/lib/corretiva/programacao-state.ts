import { supabase } from "@/integrations/supabase/client";
import type { CorrectiveProgramReservation } from "@/lib/preventiva/corrective-program-reservations";

const db = supabase as any;

export const CORRECTIVE_NOT_PERFORMED_REASONS = [
  { value: "acesso_nao_liberado", label: "Acesso / área não liberada" },
  { value: "equipe_indisponivel", label: "Equipe indisponível ou redirecionada" },
  { value: "material_indisponivel", label: "Material / peça indisponível" },
  { value: "equipamento_indisponivel", label: "Equipamento ou operação indisponível" },
  { value: "janela_operacional", label: "Janela operacional não permitiu a execução" },
  { value: "prioridade_emergencial", label: "Prioridade emergencial substituiu a atividade" },
  { value: "programacao_cancelada", label: "Programação cancelada / ajustada" },
  { value: "outro", label: "Outro motivo" },
] as const;

export type CorrectiveNotPerformedReason =
  (typeof CORRECTIVE_NOT_PERFORMED_REASONS)[number]["value"];

export function correctiveNotPerformedReasonLabel(value: unknown) {
  const key = String(value ?? "").trim();
  return (
    CORRECTIVE_NOT_PERFORMED_REASONS.find((item) => item.value === key)?.label ||
    key ||
    "Motivo não informado"
  );
}

export type CorrectiveProgrammingEntry = {
  osId: string;
  numeroOs: string;
  equipe: string;
  periodStart: string;
  periodEnd: string;
  dayIndex: number;
};

export async function registerCorrectiveProgrammingBatch(
  entries: CorrectiveProgrammingEntry[],
): Promise<number> {
  if (!entries.length) return 0;

  const payload = entries.map((entry) => ({
    os_id: entry.osId,
    numero_os: entry.numeroOs,
    equipe: entry.equipe,
    period_start: entry.periodStart,
    period_end: entry.periodEnd,
    day_index: entry.dayIndex,
  }));

  const { data, error } = await db.rpc("register_corretiva_programacao_batch", {
    _entries: payload,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function markCorrectiveNotPerformed(options: {
  osId: string;
  reason?: CorrectiveNotPerformedReason | "reprogramacao_solicitada";
  observation?: string | null;
  reservation?: CorrectiveProgramReservation | null;
}) {
  const { osId, reason = "reprogramacao_solicitada", observation, reservation } = options;
  const { data, error } = await db.rpc("mark_corretiva_programacao_nao_realizada", {
    _os_id: osId,
    _motivo: reason,
    _observacao: observation?.trim() || null,
    _period_start: reservation?.periodStart || null,
    _period_end: reservation?.periodEnd || null,
    _day_index:
      typeof reservation?.dayIndex === "number" ? reservation.dayIndex : null,
    _equipe: reservation?.equipe || null,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("O chamado não foi atualizado.");
  return row as Record<string, unknown>;
}

export function isPersistentlyProgrammed(row: {
  programacao_status?: unknown;
}) {
  return String(row.programacao_status ?? "").trim() === "em_programacao";
}

export function isPendingReprogramming(row: {
  programacao_status?: unknown;
}) {
  return String(row.programacao_status ?? "").trim() === "reprogramacao_pendente";
}
