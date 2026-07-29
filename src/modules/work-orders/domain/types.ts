/**
 * Núcleo compartilhado de Ordens de Serviço (WorkOrderEngine).
 * Item 5.1 do prompt mestre + item 26 da Fase 10: uma única definição de
 * domínio e um único ciclo de vida canônico para todas as modalidades
 * (corretiva, refrigeração, preventiva, inspeções, PMOC...).
 */

export type WorkOrderModality =
  | "corretiva"
  | "refrigeracao"
  | "eletrica"
  | "civil"
  | "hidraulica"
  | "chaveiro"
  | "pintura"
  | "jardinagem"
  | "preventiva"
  | "inspecao"
  | "pmoc";

/**
 * Estados canônicos do ciclo de vida. Cada modalidade pode RESTRINGIR
 * transições, mas nunca criar estados ou regras próprias em outras páginas.
 */
export type WorkOrderStatus =
  | "aberta"
  | "triagem"
  | "aguardando_planejamento"
  | "programada"
  | "aguardando_material"
  | "liberada"
  | "em_execucao"
  | "pausada"
  | "aguardando_validacao"
  | "concluida"
  | "cancelada";

export type WorkOrderPriority = "critica" | "alta" | "media" | "baixa";

export type WorkOrderFieldKind =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "boolean"
  | "photo"
  | "signature";

export type WorkOrderField = {
  key: string;
  label: string;
  kind: WorkOrderFieldKind;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  /** Ajuda curta exibida abaixo do campo. */
  hint?: string;
};

export type WorkOrderChecklistItem = {
  key: string;
  label: string;
  /** Exige evidência fotográfica para marcar como concluído. */
  requiresPhoto?: boolean;
};

export type WorkOrderModalityConfig = {
  key: WorkOrderModality;
  label: string;
  /** Cor fluorescente usada nos badges/realces da modalidade. */
  tone: string;
  /** Módulo de permissão associado (`can_access_module`). */
  moduleKey: string;
  statuses: WorkOrderStatus[];
  transitions: Partial<Record<WorkOrderStatus, WorkOrderStatus[]>>;
  fields: WorkOrderField[];
  checklist?: WorkOrderChecklistItem[];
  /** Minutos padrão de execução usados pelo planejador. */
  defaultDurationMinutes: number;
  /** Prazo alvo em horas por prioridade. */
  sla: Record<WorkOrderPriority, number>;
  requiresApproval?: boolean;
  requiresSignature?: boolean;
  allowsMaterials: boolean;
  allowsPhotos: boolean;
  /** Habilita fila offline (outbox) para a modalidade. */
  offline: boolean;
};

/** Registro imutável de uma transição (tabela `work_order_transitions`). */
export type WorkOrderTransitionRecord = {
  id: string;
  modalidade: string;
  work_order_id: string | null;
  numero_os: string;
  de_status: string | null;
  para_status: string;
  motivo: string | null;
  user_id: string | null;
  created_at: string;
};
