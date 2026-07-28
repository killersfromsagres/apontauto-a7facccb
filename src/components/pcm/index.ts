/**
 * Biblioteca de componentes padrão do PCM (item 6.2 do prompt mestre).
 * Reaproveitar estes blocos em vez de recriar variações por módulo.
 */
export { KpiCard, type KpiTrend } from "./kpi-card";
export { StatusBadge, statusTone, type StatusTone } from "./status-badge";
export { PriorityBadge, normalizePriority, type Priority } from "./priority-badge";
export { EmptyState, ErrorState, SkeletonState } from "./states";
export { FilterBar } from "./filter-bar";
export { ExportMenu, type ExportOption } from "./export-menu";
export { SyncIndicator, type SyncStatus } from "./sync-indicator";
export { ConfirmationDialog } from "./confirmation-dialog";
export {
  Timeline,
  AuditTimeline,
  type TimelineItem,
  type AuditEvent,
} from "./timeline";
