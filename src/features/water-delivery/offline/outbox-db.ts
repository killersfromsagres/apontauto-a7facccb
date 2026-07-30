// Armazenamento local do módulo Água (item 16).
//
// Duas coleções em IndexedDB:
// - `outbox`: ações de campo (formulários) aguardando envio, no formato do
//   núcleo reutilizável `@/lib/offline/outbox-core`;
// - `cache`: rota do dia e dados essenciais dos cards para abrir sem rede.
//
// Nada sensível é gravado: o cache passa por `sanitizarParaCache` antes de
// entrar aqui (sem CPF, documentos, tokens ou segredos).

import type { OutboxRecord, OutboxStore } from "@/lib/offline/outbox-core";

const DB_NAME = "agua-sync";
const DB_VERSION = 1;
const OUTBOX = "outbox";
const CACHE = "cache";
const DEVICE_KEY = "agua:device";

export const EVENTO_FILA = "agua:fila";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX)) {
        const s = db.createObjectStore(OUTBOX, { keyPath: "id" });
        s.createIndex("kind", "kind", { unique: false });
      }
      if (!db.objectStoreNames.contains(CACHE)) {
        db.createObjectStore(CACHE, { keyPath: "chave" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function notificarFila(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_FILA));
}

/* ------------------------------------------------------------------ */
/* Outbox                                                              */
/* ------------------------------------------------------------------ */

export async function outboxAll<T = unknown>(): Promise<OutboxRecord<T>[]> {
  const itens = await tx<OutboxRecord<T>[]>(OUTBOX, "readonly", (s) => s.getAll() as IDBRequest<OutboxRecord<T>[]>);
  return (itens ?? []).sort((a, b) => a.createdAt - b.createdAt);
}

export async function outboxPut<T = unknown>(record: OutboxRecord<T>): Promise<void> {
  await tx(OUTBOX, "readwrite", (s) => s.put(record));
  notificarFila();
}

export async function outboxUpdate<T = unknown>(
  id: string,
  patch: Partial<OutboxRecord<T>>,
): Promise<void> {
  const atual = await tx<OutboxRecord<T> | undefined>(
    OUTBOX,
    "readonly",
    (s) => s.get(id) as IDBRequest<OutboxRecord<T> | undefined>,
  );
  if (!atual) return;
  await tx(OUTBOX, "readwrite", (s) => s.put({ ...atual, ...patch }));
  notificarFila();
}

export async function outboxRemove(id: string): Promise<void> {
  await tx(OUTBOX, "readwrite", (s) => s.delete(id));
  notificarFila();
}

/** Adaptador no formato esperado por `drainOutbox`. */
export function aguaOutboxStore<T = unknown>(): OutboxStore<T> {
  return {
    all: () => outboxAll<T>(),
    update: (id, patch) => outboxUpdate<T>(id, patch),
    remove: (id) => outboxRemove(id),
  };
}

/* ------------------------------------------------------------------ */
/* Cache de dados essenciais                                           */
/* ------------------------------------------------------------------ */

export async function cacheSet(chave: string, valor: unknown): Promise<void> {
  await tx(CACHE, "readwrite", (s) => s.put({ chave, valor, gravadoEm: Date.now() }));
}

export async function cacheGet<T>(chave: string): Promise<T | null> {
  const row = await tx<{ valor: T } | undefined>(
    CACHE,
    "readonly",
    (s) => s.get(chave) as IDBRequest<{ valor: T } | undefined>,
  );
  return row ? (row.valor as T) : null;
}

export async function cacheClear(): Promise<void> {
  await tx(CACHE, "readwrite", (s) => s.clear());
}

/* ------------------------------------------------------------------ */
/* Dispositivo (registro não invasivo — item 16.1)                      */
/* ------------------------------------------------------------------ */

/**
 * Identificador aleatório do aparelho, apenas para rastrear a origem de uma
 * ação sincronizada. Não coleta IMEI, telefone, contatos nem localização.
 */
export function deviceId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
