/**
 * Item 21 — Runner de processos server-side (cron/webhooks).
 *
 * Fornece, de forma centralizada:
 * - idempotência (chave opcional; execuções repetidas devolvem o resultado anterior);
 * - trava/limite de concorrência por job (TTL evita travas presas);
 * - timeout duro por execução;
 * - retry controlado com backoff exponencial apenas para falhas temporárias;
 * - log estruturado em `public.job_runs`;
 * - alarme de falha na central de notificações (sem spam, com dedupe).
 *
 * Server-only: importe sempre com `await import()` dentro do handler.
 */

export interface JobOptions {
  /** Identificador estável do job (ex.: "water-delivery-reminders"). */
  key: string;
  /** Chave de idempotência opcional (ex.: `${key}:${data}`). */
  idempotencyKey?: string | null;
  /** Tempo máximo de execução em ms (padrão 60s). */
  timeoutMs?: number;
  /** Tentativas totais, incluindo a primeira (padrão 3). */
  maxAttempts?: number;
  /** Backoff inicial em ms (dobra a cada tentativa; padrão 500ms). */
  backoffMs?: number;
  /** Execuções simultâneas permitidas (padrão 1). */
  maxConcurrent?: number;
  /** TTL da trava em segundos (padrão: timeout × 3, mínimo 60s). */
  lockTtlSeconds?: number;
  /** Dispara notificação para gestores quando o job falha (padrão true). */
  alertOnFailure?: boolean;
  /** Módulo usado no alarme de falha. */
  moduleKey?: string;
}

export type JobOutcome<T> =
  | { ok: true; status: "success"; runId: string | null; attempts: number; result: T }
  | { ok: true; status: "skipped"; reason: string; runId: string | null; result?: unknown }
  | { ok: false; status: "failed"; runId: string | null; attempts: number; error: string };

/** Erro que sinaliza "não adianta repetir" (4xx, validação, configuração). */
export class PermanentJobError extends Error {
  readonly permanent = true;
}

function isPermanent(err: unknown): boolean {
  return Boolean((err as { permanent?: boolean } | null)?.permanent);
}

function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`timeout: excedeu ${ms}ms`));
    }, ms);
    fn(controller.signal).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Executa uma rotina server-side com trava, timeout, retry e log.
 */
export async function runJob<T>(
  options: JobOptions,
  task: (ctx: { signal: AbortSignal; attempt: number; runId: string | null }) => Promise<T>,
): Promise<JobOutcome<T>> {
  const {
    key,
    idempotencyKey = null,
    timeoutMs = 60_000,
    maxAttempts = 3,
    backoffMs = 500,
    maxConcurrent = 1,
    alertOnFailure = true,
    moduleKey = "observabilidade",
  } = options;
  const lockTtlSeconds = options.lockTtlSeconds ?? Math.max(60, Math.ceil((timeoutMs * 3) / 1000));

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;

  const { data: begin, error: beginError } = await admin.rpc("job_begin", {
    p_job_key: key,
    p_idempotency_key: idempotencyKey,
    p_lock_ttl_seconds: lockTtlSeconds,
    p_max_concurrent: maxConcurrent,
  });

  if (beginError) {
    console.error(`[job:${key}] falha ao abrir execução`, beginError.message);
    return { ok: false, status: "failed", runId: null, attempts: 0, error: beginError.message };
  }

  if (!begin?.acquired) {
    const reason = String(begin?.reason ?? "locked");
    console.log(`[job:${key}] ignorado (${reason})`);
    return {
      ok: true,
      status: "skipped",
      reason,
      runId: begin?.run_id ?? null,
      result: begin?.result,
    };
  }

  const runId: string = begin.run_id;
  let attempt = 0;
  let lastError = "erro desconhecido";

  while (attempt < Math.max(1, maxAttempts)) {
    attempt += 1;
    const started = Date.now();
    try {
      const result = await withTimeout((signal) => task({ signal, attempt, runId }), timeoutMs);
      await admin.rpc("job_finish", {
        p_run_id: runId,
        p_status: "success",
        p_result: (result ?? null) as any,
        p_error: null,
      });
      console.log(`[job:${key}] ok em ${Date.now() - started}ms (tentativa ${attempt})`);
      return { ok: true, status: "success", runId, attempts: attempt, result };
    } catch (err: any) {
      lastError = err?.message ?? String(err);
      console.error(`[job:${key}] tentativa ${attempt} falhou: ${lastError}`);
      if (isPermanent(err) || attempt >= Math.max(1, maxAttempts)) break;
      await sleep(backoffMs * 2 ** (attempt - 1));
    }
  }

  await admin.rpc("job_finish", {
    p_run_id: runId,
    p_status: "failed",
    p_result: null,
    p_error: lastError,
  });

  if (alertOnFailure) {
    try {
      await admin.rpc("notificar_evento", {
        p_evento: `job_falhou:${key}`,
        p_titulo: `Rotina automática falhou: ${key}`,
        p_corpo: lastError.slice(0, 500),
        p_categoria: "sistema",
        p_severidade: "erro",
        p_deep_link: "/observabilidade",
        p_modulo: moduleKey,
        p_requires_ack: false,
        p_dedupe_key: `job_falhou:${key}`,
        p_alvos: [] as any,
        p_metadata: { run_id: runId, attempts: attempt } as any,
      });
    } catch (e: any) {
      console.error(`[job:${key}] falha ao emitir alarme`, e?.message ?? e);
    }
  }

  return { ok: false, status: "failed", runId, attempts: attempt, error: lastError };
}

/** Converte o resultado do job em resposta HTTP padronizada. */
export function jobResponse(outcome: JobOutcome<unknown>): Response {
  if (outcome.status === "failed") {
    return Response.json(
      { ok: false, status: outcome.status, run_id: outcome.runId, error: outcome.error },
      { status: 500 },
    );
  }
  return Response.json({ ...outcome, ok: true });
}
