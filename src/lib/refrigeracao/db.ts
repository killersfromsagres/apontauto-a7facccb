// Minimal IndexedDB wrapper para o módulo Refrigeração.
// Sem dependências externas: 3 object stores (os_cache, outbox, blobs).

const DB_NAME = "refrigeracao-offline";
const DB_VERSION = 1;

export type OutboxKind = "foto" | "peca" | "problema";

export type OutboxItem = {
  id: string; // client_uuid
  kind: OutboxKind;
  osId: string;
  numeroOs: string;
  payload: any; // { descricao?, quantidade?, urgencia?, observacao?, gravidade?, legenda?, blobKey? }
  createdAt: number;
  attempts: number;
  lastError?: string;
};

export type OsCacheRow = {
  id: string;
  numero_os: string;
  ativo: string;
  equipamento: string;
  patrimonio: string;
  localizacao: string | null;
  status: string;
  updated_at: string;
};

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
      if (!db.objectStoreNames.contains("os_cache")) {
        db.createObjectStore("os_cache", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("outbox")) {
        const s = db.createObjectStore("outbox", { keyPath: "id" });
        s.createIndex("kind", "kind", { unique: false });
        s.createIndex("osId", "osId", { unique: false });
      }
      if (!db.objectStoreNames.contains("blobs")) {
        db.createObjectStore("blobs"); // key = blobKey, value = Blob
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string | string[],
  mode: IDBTransactionMode,
  fn: (t: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        let out: any;
        Promise.resolve(fn(t))
          .then((v) => {
            out = v;
          })
          .catch((e) => reject(e));
        t.oncomplete = () => resolve(out);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

function req<T = any>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

// ---- OS cache
export async function cacheOsList(rows: OsCacheRow[]): Promise<void> {
  await tx("os_cache", "readwrite", async (t) => {
    const s = t.objectStore("os_cache");
    await req(s.clear());
    for (const r of rows) s.put(r);
  });
}

export async function getCachedOsList(): Promise<OsCacheRow[]> {
  return tx("os_cache", "readonly", (t) => req(t.objectStore("os_cache").getAll()));
}

// ---- Outbox
export async function outboxAdd(item: OutboxItem): Promise<void> {
  await tx("outbox", "readwrite", (t) => req(t.objectStore("outbox").put(item)));
}

export async function outboxAll(): Promise<OutboxItem[]> {
  return tx("outbox", "readonly", (t) => req(t.objectStore("outbox").getAll()));
}

export async function outboxRemove(id: string): Promise<void> {
  await tx("outbox", "readwrite", (t) => req(t.objectStore("outbox").delete(id)));
}

export async function outboxUpdate(item: OutboxItem): Promise<void> {
  await tx("outbox", "readwrite", (t) => req(t.objectStore("outbox").put(item)));
}

export async function outboxCount(): Promise<number> {
  return tx("outbox", "readonly", (t) => req(t.objectStore("outbox").count()));
}

// ---- Blobs (fotos)
export async function blobPut(key: string, blob: Blob): Promise<void> {
  await tx("blobs", "readwrite", (t) => req(t.objectStore("blobs").put(blob, key)));
}

export async function blobGet(key: string): Promise<Blob | undefined> {
  return tx("blobs", "readonly", (t) => req<Blob>(t.objectStore("blobs").get(key) as any));
}

export async function blobDelete(key: string): Promise<void> {
  await tx("blobs", "readwrite", (t) => req(t.objectStore("blobs").delete(key)));
}
