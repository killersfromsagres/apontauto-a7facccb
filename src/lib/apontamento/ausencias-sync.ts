import {
  loadAusencias,
  type Ausencia,
} from "./ausencias";

/**
 * Operações locais pendentes são preservadas mesmo se o PostgREST não tiver
 * a tabela instalada. Um marcador de revisão evita confirmar uma operação
 * anterior enquanto o usuário já fez outra alteração no mesmo registro.
 */
export interface AusenciasQueue {
  initialized: boolean;
  revision: number;
  upserts: Record<string, number>;
  deletes: Record<string, number>;
}

export const AUSENCIAS_QUEUE_STORAGE_KEY = "apontauto:apontamentos-ausencias-queue:v2";

export function initialAusenciasQueue(local: readonly Ausencia[]): AusenciasQueue {
  return {
    initialized: false,
    revision: 0,
    upserts: Object.fromEntries(local.map((item) => [item.id, 0])),
    deletes: {},
  };
}

function validPending(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([id, revision]) => id.length > 0 && typeof revision === "number" &&
        Number.isSafeInteger(revision) && revision >= 0,
    ),
  );
}

export function loadAusenciasQueue(local = loadAusencias()): AusenciasQueue {
  if (typeof window === "undefined") return initialAusenciasQueue(local);
  try {
    const value = window.localStorage.getItem(AUSENCIAS_QUEUE_STORAGE_KEY);
    if (!value) return initialAusenciasQueue(local);
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return initialAusenciasQueue(local);
    }
    const item = parsed as Partial<AusenciasQueue>;
    return {
      initialized: item.initialized === true,
      revision: typeof item.revision === "number" &&
        Number.isSafeInteger(item.revision) && item.revision >= 0 ? item.revision : 0,
      upserts: validPending(item.upserts),
      deletes: validPending(item.deletes),
    };
  } catch {
    return initialAusenciasQueue(local);
  }
}

export function saveAusenciasQueue(queue: AusenciasQueue) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUSENCIAS_QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage não disponível; a tela permanece utilizável em memória.
  }
}

export function withPendingAusencia(
  queue: AusenciasQueue,
  id: string,
  operation: "upsert" | "delete",
): AusenciasQueue {
  const revision = queue.revision + 1;
  const upserts = { ...queue.upserts };
  const deletes = { ...queue.deletes };
  if (operation === "delete") {
    delete upserts[id];
    deletes[id] = revision;
  } else {
    delete deletes[id];
    upserts[id] = revision;
  }
  return { ...queue, revision, upserts, deletes };
}

export function markAusenciaPending(id: string, operation: "upsert" | "delete") {
  saveAusenciasQueue(withPendingAusencia(loadAusenciasQueue(), id, operation));
}

export function acknowledgeAusenciasQueue(
  queue: AusenciasQueue,
  operation: "upserts" | "deletes",
  completed: Record<string, number>,
): AusenciasQueue {
  const pending = { ...queue[operation] };
  for (const [id, revision] of Object.entries(completed)) {
    if (pending[id] === revision) delete pending[id];
  }
  return { ...queue, [operation]: pending };
}

export function mergeAusenciasWithPending(
  remote: readonly Ausencia[],
  local: readonly Ausencia[],
  queue: AusenciasQueue,
): Ausencia[] {
  const result = new Map(
    remote
      .filter((item) => !Object.prototype.hasOwnProperty.call(queue.deletes, item.id))
      .map((item) => [item.id, item]),
  );
  for (const item of local) {
    if (Object.prototype.hasOwnProperty.call(queue.upserts, item.id) &&
        !Object.prototype.hasOwnProperty.call(queue.deletes, item.id)) {
      result.set(item.id, item);
    }
  }
  return [...result.values()].sort((a, b) => b.inicio.localeCompare(a.inicio));
}
