// IndexedDB do módulo Corretiva.
// Armazena OS visíveis, fila de sincronização, blobs de fotos e rascunhos.
// A fila e o cache permanecem no aparelho quando a internet cai ou a página é recarregada.

const DB_NAME = "corretiva-offline";
const DB_VERSION = 4;

export const CORRETIVA_QUEUE_CHANGED_EVENT = "corretiva-offline-queue-changed";

export type OutboxKind =
  | "foto"
  | "peca"
  | "material"
  | "material_status"
  | "problema"
  | "patrimonio"
  | "status"
  | "assinatura";

export type OutboxItem = {
  id: string;
  kind: OutboxKind;
  osId: string;
  numeroOs: string;
  payload: any;
  createdAt: number;
  attempts: number;
  lastError?: string;
  /** Usuário que originou a operação offline. Itens legados podem não possuir este campo. */
  userId?: string | null;
};

export type OsCacheRow = {
  id: string;
  numero_os: string;
  nome_os: string | null;
  predio: string | null;
  andar: string | null;
  local: string | null;
  tipo: string | null;
  equipe: string | null;
  data_sla: string | null;
  data_programada: string | null;
  inicio: string | null;
  fim: string | null;
  ativo: string;
  equipamento: string;
  patrimonio: string | null;
  status: string;
  updated_at: string;
  solicitante?: string | null;
  data_criacao?: string | null;
  material_status?: string | null;
  pecas_solicitadas?: string | null;
  observacao_conclusao?: string | null;
};

export type OfflineCacheInfo = {
  ownerUserId: string | null;
  cachedAt: number | null;
  count: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function emitQueueChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CORRETIVA_QUEUE_CHANGED_EVENT));
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível"));
      return;
    }
    const reqOpen = indexedDB.open(DB_NAME, DB_VERSION);
    reqOpen.onupgradeneeded = () => {
      const db = reqOpen.result;
      if (!db.objectStoreNames.contains("os_cache")) {
        db.createObjectStore("os_cache", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("outbox")) {
        const s = db.createObjectStore("outbox", { keyPath: "id" });
        s.createIndex("kind", "kind", { unique: false });
        s.createIndex("osId", "osId", { unique: false });
      }
      if (!db.objectStoreNames.contains("blobs")) {
        db.createObjectStore("blobs");
      }
      if (!db.objectStoreNames.contains("drafts")) {
        db.createObjectStore("drafts", { keyPath: "osId" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta");
      }
    };

    reqOpen.onsuccess = () => resolve(reqOpen.result);
    reqOpen.onerror = () => reject(reqOpen.error);
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

async function currentUserId(): Promise<string | null> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Atualiza o espelho local das OS que o usuário conseguiu visualizar online.
 * O dono do cache é salvo junto dos dados para impedir que outro login no mesmo
 * celular enxergue uma lista pertencente à sessão anterior.
 */
export async function cacheOsList(rows: OsCacheRow[]): Promise<void> {
  const ownerUserId = await currentUserId();
  const cachedAt = Date.now();

  await tx(["os_cache", "meta"], "readwrite", async (t) => {
    const osStore = t.objectStore("os_cache");
    const metaStore = t.objectStore("meta");
    await req(osStore.clear());
    for (const r of rows) osStore.put(r);
    metaStore.put(ownerUserId, "os_cache_owner");
    metaStore.put(cachedAt, "os_cache_cached_at");
  });
}

export async function getCachedOsList(): Promise<OsCacheRow[]> {
  const current = await currentUserId();
  return tx(["os_cache", "meta"], "readonly", async (t) => {
    const osStore = t.objectStore("os_cache");
    const metaStore = t.objectStore("meta");
    const rows = await req<OsCacheRow[]>(osStore.getAll());
    const owner = (await req<string | null | undefined>(metaStore.get("os_cache_owner"))) ?? null;

    // Cache antigo (sem owner) continua legível para não perder uma preparação
    // offline já existente. Assim que houver uma carga online ele passa a ser
    // automaticamente vinculado ao usuário atual.
    if (!owner) return rows;
    if (!current || owner !== current) return [];
    return rows;
  });
}

export async function getOfflineCacheInfo(): Promise<OfflineCacheInfo> {
  return tx(["os_cache", "meta"], "readonly", async (t) => {
    const osStore = t.objectStore("os_cache");
    const metaStore = t.objectStore("meta");
    const [count, owner, cachedAt] = await Promise.all([
      req<number>(osStore.count()),
      req<string | null | undefined>(metaStore.get("os_cache_owner")),
      req<number | null | undefined>(metaStore.get("os_cache_cached_at")),
    ]);
    return {
      ownerUserId: owner ?? null,
      cachedAt: cachedAt ?? null,
      count,
    };
  });
}

export async function updateCachedOs(id: string, patch: Partial<OsCacheRow>): Promise<void> {
  await tx("os_cache", "readwrite", async (t) => {
    const s = t.objectStore("os_cache");
    const cur = (await req(s.get(id))) as OsCacheRow | undefined;
    if (!cur) return;
    s.put({ ...cur, ...patch });
  });
}

export async function outboxAdd(item: OutboxItem): Promise<void> {
  // Vincula novas operações ao usuário que realmente executou o apontamento.
  // Isso evita que uma fila criada offline por um usuário seja enviada por outro
  // após troca de conta no mesmo navegador/dispositivo.
  const userId = item.userId === undefined ? await currentUserId() : item.userId;
  await tx("outbox", "readwrite", (t) =>
    req(t.objectStore("outbox").put({ ...item, userId })),
  );
  emitQueueChanged();
}

export async function outboxAll(): Promise<OutboxItem[]> {
  return tx("outbox", "readonly", (t) => req(t.objectStore("outbox").getAll()));
}

export async function outboxForCurrentUser(): Promise<OutboxItem[]> {
  const userId = await currentUserId();
  const items = await outboxAll();
  if (!userId) return items.filter((item) => !item.userId);
  return items.filter((item) => !item.userId || item.userId === userId);
}

export async function outboxRemove(id: string): Promise<void> {
  await tx("outbox", "readwrite", (t) => req(t.objectStore("outbox").delete(id)));
  emitQueueChanged();
}

export async function outboxUpdate(item: OutboxItem): Promise<void> {
  await tx("outbox", "readwrite", (t) => req(t.objectStore("outbox").put(item)));
}

export async function outboxCount(): Promise<number> {
  return tx("outbox", "readonly", (t) => req(t.objectStore("outbox").count()));
}

export async function outboxCountCurrentUser(): Promise<number> {
  const items = await outboxForCurrentUser();
  return items.length;
}

export async function blobPut(key: string, blob: Blob): Promise<void> {
  await tx("blobs", "readwrite", (t) => req(t.objectStore("blobs").put(blob, key)));
}

export async function blobGet(key: string): Promise<Blob | undefined> {
  return tx("blobs", "readonly", (t) => req<Blob>(t.objectStore("blobs").get(key) as any));
}

export async function blobDelete(key: string): Promise<void> {
  await tx("blobs", "readwrite", (t) => req(t.objectStore("blobs").delete(key)));
}

// ---------- Drafts (rascunho em andamento por OS) ----------
export type DraftFoto = { id: string; blobKey: string };
export type DraftPeca = {
  id: string;
  descricao: string;
  modelo: string;
  quantidade: string;
  urgencia: string;
  observacao: string;
};
export type DraftProblema = { id: string; descricao: string; gravidade: string };

export type OsDraft = {
  osId: string;
  fotos: DraftFoto[];
  pecas: DraftPeca[];
  problemas: DraftProblema[];
  patrimonio?: string;
  /** Rubrica do solicitante (dataURL PNG) e nome de quem assinou. */
  assinatura?: string | null;
  assinaturaNome?: string;
  updatedAt: number;
};

export async function draftGet(osId: string): Promise<OsDraft | undefined> {
  return tx("drafts", "readonly", (t) => req<OsDraft>(t.objectStore("drafts").get(osId) as any));
}

/**
 * Persiste o rascunho local e, quando uma peça já possui descrição,
 * transforma peça, evidências e estado de material em operações de outbox.
 * Assim a solicitação e as fotos ficam disponíveis sem exigir a finalização da OS.
 * IDs estáveis mantêm o autosave idempotente entre múltiplas gravações do rascunho.
 */
export async function draftPut(draft: OsDraft): Promise<void> {
  await tx("drafts", "readwrite", (t) => req(t.objectStore("drafts").put(draft)));

  const pecas = Array.isArray(draft.pecas)
    ? draft.pecas.filter((p) => String(p?.descricao ?? "").trim().length > 0)
    : [];

  for (const peca of pecas) {
    await outboxAdd({
      id: `peca:${draft.osId}:${peca.id}`,
      kind: "peca",
      osId: draft.osId,
      numeroOs: "",
      payload: {
        ...peca,
        __fromDraft: true,
      },
      createdAt: Date.now(),
      attempts: 0,
    });
  }

  if (pecas.length > 0) {
    const fotos = Array.isArray(draft.fotos) ? draft.fotos : [];

    for (const foto of fotos) {
      await outboxAdd({
        id: `foto:${draft.osId}:${foto.id}`,
        kind: "foto",
        osId: draft.osId,
        numeroOs: "",
        payload: {
          blobKey: foto.blobKey,
          clientUuid: foto.id,
          legenda: "Evidência vinculada à solicitação de material",
          __fromDraft: true,
        },
        createdAt: Date.now(),
        attempts: 0,
      });
    }

    await outboxAdd({
      id: `material-status:${draft.osId}`,
      kind: "material_status",
      osId: draft.osId,
      numeroOs: "",
      payload: { status: "solicitado" },
      createdAt: Date.now(),
      attempts: 0,
    });
  }
}

export async function draftDelete(osId: string): Promise<void> {
  await tx("drafts", "readwrite", (t) => req(t.objectStore("drafts").delete(osId)));
}
