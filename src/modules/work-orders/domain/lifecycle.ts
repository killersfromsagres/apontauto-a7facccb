import type { WorkOrderStatus } from "./types";

/** Rótulos e cores dos estados canônicos (item 26). */
export const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  aberta: "Aberta",
  triagem: "Triagem",
  aguardando_planejamento: "Aguardando planejamento",
  programada: "Programada",
  aguardando_material: "Aguardando material",
  liberada: "Liberada",
  em_execucao: "Em execução",
  pausada: "Pausada",
  aguardando_validacao: "Aguardando validação",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const STATUS_CLASS: Record<WorkOrderStatus, string> = {
  aberta: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  triagem: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  aguardando_planejamento: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  programada: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  aguardando_material: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  liberada: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  em_execucao: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  pausada: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  aguardando_validacao: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  concluida: "bg-lime-500/15 text-lime-300 border-lime-500/30",
  cancelada: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

/** Ordem canônica usada em timelines e gráficos de funil. */
export const CANONICAL_ORDER: WorkOrderStatus[] = [
  "aberta",
  "triagem",
  "aguardando_planejamento",
  "programada",
  "aguardando_material",
  "liberada",
  "em_execucao",
  "pausada",
  "aguardando_validacao",
  "concluida",
  "cancelada",
];

const LEGACY_MAP: Record<string, WorkOrderStatus> = {
  aberta: "aberta",
  nova: "aberta",
  novo: "aberta",
  visto: "triagem",
  em_analise: "triagem",
  pendente: "aguardando_planejamento",
  programada: "programada",
  andamento: "em_execucao",
  em_andamento: "em_execucao",
  em_execucao: "em_execucao",
  aguardando_material: "aguardando_material",
  aguardando_aprovacao: "aguardando_validacao",
  aguardando_validacao: "aguardando_validacao",
  aprovado: "liberada",
  liberada: "liberada",
  pausada: "pausada",
  resolvida: "concluida",
  resolvido: "concluida",
  concluida: "concluida",
  concluido: "concluida",
  cancelada: "cancelada",
  cancelado: "cancelada",
  rejeitado: "cancelada",
};

/** Converte status legados dos módulos antigos para o estado canônico. */
export function toCanonicalStatus(raw: string | null | undefined): WorkOrderStatus {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return LEGACY_MAP[key] ?? "aberta";
}
