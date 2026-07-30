// Item 14 — enums e máquinas de estado do módulo de Água.
// Espelha exatamente os enums e as triggers de validação do banco
// (agua_rota_status, agua_visita_status, agua_filtro_situacao).
// O banco é a autoridade: aqui a validação serve para bloquear cedo na UI.

/* ------------------------------------------------------------------ */
/* 14.1 — Rota                                                         */
/* ------------------------------------------------------------------ */

export const ROTA_STATUS = [
  "rascunho",
  "planejada",
  "atribuida",
  "pronta",
  "em_andamento",
  "pausada",
  "concluida",
  "concluida_com_divergencia",
  "cancelada",
] as const;

export type RotaStatus = (typeof ROTA_STATUS)[number];

export const ROTA_STATUS_LABEL: Record<RotaStatus, string> = {
  rascunho: "Rascunho",
  planejada: "Planejada",
  atribuida: "Atribuída",
  pronta: "Pronta para iniciar",
  em_andamento: "Em andamento",
  pausada: "Pausada",
  concluida: "Concluída",
  concluida_com_divergencia: "Concluída com divergência",
  cancelada: "Cancelada",
};

export const ROTA_TRANSICOES: Record<RotaStatus, RotaStatus[]> = {
  rascunho: ["planejada", "cancelada"],
  planejada: ["rascunho", "atribuida", "pronta", "cancelada"],
  atribuida: ["planejada", "pronta", "cancelada"],
  pronta: ["atribuida", "em_andamento", "cancelada"],
  em_andamento: ["pausada", "concluida", "concluida_com_divergencia", "cancelada"],
  pausada: ["em_andamento", "cancelada"],
  concluida: ["concluida_com_divergencia"],
  concluida_com_divergencia: ["concluida"],
  cancelada: [],
};

export const ROTA_ENCERRADAS: RotaStatus[] = [
  "concluida",
  "concluida_com_divergencia",
  "cancelada",
];

/** Gestor pode cancelar qualquer rota ainda não encerrada (regra da trigger). */
export function podeTransicionarRota(
  de: RotaStatus,
  para: RotaStatus,
  opts: { gestor?: boolean } = {},
): boolean {
  if (de === para) return true;
  if (opts.gestor && para === "cancelada" && !ROTA_ENCERRADAS.includes(de)) return true;
  return (ROTA_TRANSICOES[de] ?? []).includes(para);
}

/* ------------------------------------------------------------------ */
/* 14.2 — Parada                                                       */
/* ------------------------------------------------------------------ */

export const VISITA_STATUS = [
  "pendente",
  "em_deslocamento",
  "em_atendimento",
  "concluida",
  "parcial",
  "sem_necessidade",
  "acesso_bloqueado",
  "local_fechado",
  "falta_bags",
  "endereco_divergente",
  "reprogramada",
  "nao_realizada",
  "cancelada",
] as const;

export type VisitaStatus = (typeof VISITA_STATUS)[number];

export const VISITA_STATUS_LABEL: Record<VisitaStatus, string> = {
  pendente: "Pendente",
  em_deslocamento: "Em deslocamento",
  em_atendimento: "Em atendimento",
  concluida: "Concluída",
  parcial: "Concluída parcialmente",
  sem_necessidade: "Ponto sem necessidade",
  acesso_bloqueado: "Acesso bloqueado",
  local_fechado: "Local fechado",
  falta_bags: "Falta de bags",
  endereco_divergente: "Endereço divergente",
  reprogramada: "Reprogramada",
  nao_realizada: "Não realizada",
  cancelada: "Cancelada",
};

/** Estados finais da parada — só gestor reabre (a retificação fica registrada). */
export const VISITA_FINAIS: VisitaStatus[] = [
  "concluida",
  "parcial",
  "sem_necessidade",
  "acesso_bloqueado",
  "local_fechado",
  "falta_bags",
  "endereco_divergente",
  "reprogramada",
  "nao_realizada",
  "cancelada",
];

const VISITA_ABERTAS: VisitaStatus[] = ["pendente", "em_deslocamento", "em_atendimento"];

export const VISITA_TRANSICOES: Record<VisitaStatus, VisitaStatus[]> = Object.fromEntries(
  VISITA_STATUS.map((s) => [
    s,
    VISITA_FINAIS.includes(s) ? [] : [...VISITA_ABERTAS.filter((a) => a !== s), ...VISITA_FINAIS],
  ]),
) as Record<VisitaStatus, VisitaStatus[]>;

export function podeTransicionarVisita(
  de: VisitaStatus,
  para: VisitaStatus,
  opts: { gestor?: boolean } = {},
): boolean {
  if (de === para) return true;
  if (VISITA_FINAIS.includes(de)) {
    return Boolean(opts.gestor) && [...VISITA_ABERTAS, ...VISITA_FINAIS].includes(para);
  }
  return (VISITA_TRANSICOES[de] ?? []).includes(para);
}

/** Parada encerrada com sucesso (conta como atendida nos indicadores). */
export const visitaAtendida = (s: VisitaStatus) => s === "concluida" || s === "parcial";
