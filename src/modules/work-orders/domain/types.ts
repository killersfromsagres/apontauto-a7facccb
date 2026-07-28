/**
 * Núcleo compartilhado de Ordens de Serviço (WorkOrderEngine).
 * Item 5.1 do prompt mestre: uma única definição de domínio para todas as
 * modalidades (corretiva, refrigeração, preventiva, inspeções, PMOC...).
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

export type WorkOrderStatus =
  | "aberta"
  | "programada"
  | "em_execucao"
  | "aguardando_material"
  | "aguardando_aprovacao"
  | "pausada"
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
