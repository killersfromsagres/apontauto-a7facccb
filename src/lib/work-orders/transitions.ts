import { supabase } from "@/integrations/supabase/client";
import {
  canTransition,
  toCanonicalStatus,
  type WorkOrderModality,
  type WorkOrderStatus,
  type WorkOrderTransitionRecord,
} from "@/modules/work-orders";

export type RecordTransitionInput = {
  modalidade: WorkOrderModality | string;
  numeroOs: string;
  workOrderId?: string | null;
  de: string | null | undefined;
  para: WorkOrderStatus;
  motivo?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Valida a transição pela máquina de estados canônica e grava no histórico
 * imutável (`work_order_transitions`). Retorna erro legível quando inválida.
 */
export async function recordTransition(
  input: RecordTransitionInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const modality = (input.modalidade || "corretiva") as WorkOrderModality;
  const from = toCanonicalStatus(input.de);
  if (input.de != null) {
    const check = canTransition(modality, from, input.para);
    if (!check.ok) return check;
  }

  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { ok: false, reason: "Sessão expirada. Entre novamente." };

  const { error } = await supabase.from("work_order_transitions").insert({
    modalidade: modality,
    numero_os: input.numeroOs,
    work_order_id: input.workOrderId ?? null,
    de_status: input.de == null ? null : from,
    para_status: input.para,
    motivo: input.motivo?.trim() || null,
    metadata: (input.metadata ?? {}) as never,
    user_id: uid,
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/** Histórico imutável de uma OS, do mais recente para o mais antigo. */
export async function fetchTransitions(
  modalidade: string,
  numeroOs: string,
): Promise<WorkOrderTransitionRecord[]> {
  const { data, error } = await supabase
    .from("work_order_transitions")
    .select("*")
    .eq("modalidade", modalidade)
    .eq("numero_os", numeroOs)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as WorkOrderTransitionRecord[];
}
