/**
 * Chaves centralizadas do React Query. Evita strings soltas, colisões entre
 * módulos e invalidações incompletas após mutações.
 */
export const qk = {
  observability: () => ["observability"] as const,
  offlineQueue: () => ["observability", "offline-queue"] as const,
  canAccess: (moduleKey: string, action: string) => ["can-access-module", moduleKey, action] as const,
  quality: () => ["quality-checks"] as const,
  materials: () => ["material-reservations"] as const,
  assetSheet: (code: string) => ["asset-sheet", code] as const,
  capacity: (weekStart: string) => ["capacity", weekStart] as const,
  reliability: (period: string) => ["reliability", period] as const,
} as const;

/** Presets de frescor por criticidade do dado. */
export const staleTimes = {
  /** Dados críticos de segurança (chuva/PT): nunca servir cache velho. */
  realtime: 0,
  /** Operação de campo. */
  short: 30_000,
  /** Telas de gestão. */
  default: 60_000,
  /** Catálogos e configurações. */
  long: 10 * 60_000,
} as const;
