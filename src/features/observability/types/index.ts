/** Tipos de domínio do painel técnico (independentes de componentes). */

export type HealthStatus = "ok" | "degradado" | "falha" | "desconhecido";

export type ErrorLevel = "error" | "warn" | "info";

export type ClientErrorLog = {
  id: string;
  level: ErrorLevel;
  origin: string;
  message: string;
  detail: string | null;
  route: string | null;
  moduleKey: string | null;
  createdAt: string;
};

export type IntegrationHealth = {
  integration: string;
  status: HealthStatus;
  message: string | null;
  lastRunAt: string | null;
  durationMs: number | null;
};

export type JobFailure = {
  id: string;
  source: string;
  reference: string;
  message: string;
  at: string;
};

export type OfflineQueueSnapshot = {
  module: string;
  pending: number;
  dead: number;
  oldestAt: number | null;
};

export type ObservabilitySnapshot = {
  errors: ClientErrorLog[];
  errors24h: number;
  integrations: IntegrationHealth[];
  jobFailures: JobFailure[];
  uploadFailures: JobFailure[];
  lastSyncAt: string | null;
  avgResponseMs: number | null;
};
