/**
 * Núcleo de sincronização offline reutilizável (item 5.3 do prompt mestre).
 * Independente de módulo: recebe um adaptador de armazenamento e um enviador.
 * Regras: backoff exponencial, limite de tentativas, dead-letter e idempotência.
 */

export type OutboxRecord<TPayload = unknown> = {
  id: string;
  kind: string;
  payload: TPayload;
  createdAt: number;
  attempts: number;
  /** Timestamp mínimo para a próxima tentativa. */
  nextAttemptAt?: number;
  lastError?: string;
  /** Movido para dead-letter após exceder as tentativas. */
  dead?: boolean;
};

export type OutboxStore<TPayload = unknown> = {
  all: () => Promise<OutboxRecord<TPayload>[]>;
  update: (id: string, patch: Partial<OutboxRecord<TPayload>>) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export type SyncOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  now?: () => number;
};

export type SyncItemFailure = {
  id: string;
  kind: string;
  message: string;
  dead: boolean;
};

export type SyncReport = {
  sent: number;
  failed: number;
  skipped: number;
  remaining: number;
  deadLetters: number;
  errors: SyncItemFailure[];
};

export const DEFAULT_MAX_ATTEMPTS = 6;

/** Backoff exponencial com teto (1s, 2s, 4s, ... limitado a maxDelayMs). */
export function backoffDelay(attempt: number, baseDelayMs = 1000, maxDelayMs = 5 * 60_000): number {
  const exp = baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(exp, maxDelayMs);
}

export function toErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const rec = err as Record<string, unknown>;
    const msg = rec.message ?? rec.error_description ?? rec.error;
    if (typeof msg === "string" && msg.trim()) return msg;
    try {
      return JSON.stringify(rec);
    } catch {
      /* ignore */
    }
  }
  return "Erro desconhecido ao sincronizar";
}

/**
 * Processa a fila. `send` deve ser idempotente (usar o `id` como client_uuid).
 */
export async function drainOutbox<TPayload>(
  store: OutboxStore<TPayload>,
  send: (record: OutboxRecord<TPayload>) => Promise<void>,
  options: SyncOptions = {},
): Promise<SyncReport> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const now = options.now ?? (() => Date.now());

  const items = await store.all();
  const report: SyncReport = {
    sent: 0,
    failed: 0,
    skipped: 0,
    remaining: 0,
    deadLetters: 0,
    errors: [],
  };

  for (const item of items) {
    if (item.dead) {
      report.deadLetters += 1;
      continue;
    }
    if (item.nextAttemptAt && item.nextAttemptAt > now()) {
      report.skipped += 1;
      continue;
    }
    try {
      await send(item);
      await store.remove(item.id);
      report.sent += 1;
    } catch (err) {
      const message = toErrorMessage(err);
      const attempts = (item.attempts ?? 0) + 1;
      const dead = attempts >= maxAttempts;
      await store.update(item.id, {
        attempts,
        lastError: message,
        dead,
        nextAttemptAt: dead
          ? undefined
          : now() + backoffDelay(attempts, options.baseDelayMs, options.maxDelayMs),
      });
      report.failed += 1;
      if (dead) report.deadLetters += 1;
      report.errors.push({ id: item.id, kind: item.kind, message, dead });
    }
  }

  const rest = await store.all();
  report.remaining = rest.filter((i) => !i.dead).length;
  return report;
}

/** Reabilita itens da dead-letter para nova tentativa manual. */
export async function retryDeadLetters<TPayload>(store: OutboxStore<TPayload>): Promise<number> {
  const items = await store.all();
  const dead = items.filter((i) => i.dead);
  for (const item of dead) {
    await store.update(item.id, {
      dead: false,
      attempts: 0,
      nextAttemptAt: undefined,
      lastError: undefined,
    });
  }
  return dead.length;
}
