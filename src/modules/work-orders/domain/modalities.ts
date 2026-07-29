import type {
  WorkOrderModality,
  WorkOrderModalityConfig,
  WorkOrderPriority,
  WorkOrderStatus,
} from "./types";

/**
 * Fluxo canônico único (item 26 da Fase 10). Modalidades podem restringir,
 * nunca inventar transições paralelas.
 */
const BASE_TRANSITIONS: Partial<Record<WorkOrderStatus, WorkOrderStatus[]>> = {
  aberta: ["triagem", "aguardando_planejamento", "programada", "em_execucao", "cancelada"],
  triagem: ["aguardando_planejamento", "programada", "aberta", "cancelada"],
  aguardando_planejamento: ["programada", "aguardando_material", "triagem", "cancelada"],
  programada: ["liberada", "aguardando_material", "em_execucao", "aberta", "cancelada"],
  aguardando_material: ["liberada", "programada", "em_execucao", "pausada", "cancelada"],
  liberada: ["em_execucao", "programada", "pausada", "cancelada"],
  em_execucao: [
    "aguardando_material",
    "aguardando_validacao",
    "pausada",
    "concluida",
    "cancelada",
  ],
  pausada: ["em_execucao", "aguardando_material", "cancelada"],
  aguardando_validacao: ["em_execucao", "concluida", "cancelada"],
  concluida: [],
  cancelada: [],
};

const BASE_SLA: Record<WorkOrderPriority, number> = {
  critica: 4,
  alta: 24,
  media: 72,
  baixa: 168,
};

const BASE_STATUSES: WorkOrderStatus[] = [
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


function build(
  key: WorkOrderModality,
  label: string,
  tone: string,
  moduleKey: string,
  extra: Partial<WorkOrderModalityConfig> = {},
): WorkOrderModalityConfig {
  return {
    key,
    label,
    tone,
    moduleKey,
    statuses: BASE_STATUSES,
    transitions: BASE_TRANSITIONS,
    fields: [
      { key: "descricao", label: "Descrição da atividade", kind: "textarea", required: true },
      { key: "solicitante", label: "Solicitante", kind: "text" },
      { key: "predio", label: "Prédio", kind: "text" },
      { key: "andar", label: "Andar", kind: "text" },
      { key: "local", label: "Local", kind: "text" },
    ],
    defaultDurationMinutes: 60,
    sla: BASE_SLA,
    allowsMaterials: true,
    allowsPhotos: true,
    offline: true,
    ...extra,
  };
}

export const WORK_ORDER_MODALITIES: Record<WorkOrderModality, WorkOrderModalityConfig> = {
  corretiva: build("corretiva", "Corretiva", "sky", "corretiva", {
    requiresSignature: true,
  }),
  refrigeracao: build("refrigeracao", "Refrigeração", "cyan", "refrigeracao", {
    fields: [
      { key: "ativo", label: "Ativo", kind: "text", required: true },
      { key: "equipamento", label: "Equipamento", kind: "text" },
      { key: "patrimonio", label: "Patrimônio", kind: "text" },
      { key: "modelo", label: "Modelo", kind: "text", placeholder: "ex.: Split Inverter, Cassete..." },
      { key: "btus", label: "BTUs", kind: "number" },
    ],
  }),
  eletrica: build("eletrica", "Elétrica", "emerald", "corretiva", { defaultDurationMinutes: 30 }),
  civil: build("civil", "Civil", "teal", "corretiva", { defaultDurationMinutes: 30 }),
  hidraulica: build("hidraulica", "Hidráulica", "orange", "corretiva"),
  chaveiro: build("chaveiro", "Chaveiro", "violet", "corretiva", { defaultDurationMinutes: 30 }),
  pintura: build("pintura", "Pintura", "pink", "corretiva"),
  jardinagem: build("jardinagem", "Jardinagem", "lime", "corretiva"),
  preventiva: build("preventiva", "Preventiva", "cyan", "preventiva", {
    requiresApproval: true,
    checklist: [
      { key: "limpeza_filtros", label: "Limpeza de filtros", requiresPhoto: true },
      { key: "medicao_eletrica", label: "Medição elétrica" },
      { key: "dreno", label: "Verificação de dreno" },
      { key: "fixacoes", label: "Fixações e vibração" },
    ],
  }),
  inspecao: build("inspecao", "Inspeção", "amber", "preventiva", {
    allowsMaterials: false,
    defaultDurationMinutes: 30,
  }),
  pmoc: build("pmoc", "PMOC", "indigo", "preventiva", { requiresApproval: true }),
};

export function getModalityConfig(key: WorkOrderModality): WorkOrderModalityConfig {
  return WORK_ORDER_MODALITIES[key];
}

export const MODALITY_LIST = Object.values(WORK_ORDER_MODALITIES);
