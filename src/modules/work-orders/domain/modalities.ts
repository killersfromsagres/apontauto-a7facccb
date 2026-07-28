import type {
  WorkOrderModality,
  WorkOrderModalityConfig,
  WorkOrderPriority,
  WorkOrderStatus,
} from "./types";

const BASE_TRANSITIONS: Partial<Record<WorkOrderStatus, WorkOrderStatus[]>> = {
  aberta: ["programada", "em_execucao", "cancelada"],
  programada: ["em_execucao", "aberta", "cancelada"],
  em_execucao: [
    "aguardando_material",
    "aguardando_aprovacao",
    "pausada",
    "concluida",
    "cancelada",
  ],
  aguardando_material: ["em_execucao", "pausada", "cancelada"],
  aguardando_aprovacao: ["em_execucao", "concluida", "cancelada"],
  pausada: ["em_execucao", "cancelada"],
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
  "programada",
  "em_execucao",
  "aguardando_material",
  "aguardando_aprovacao",
  "pausada",
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
