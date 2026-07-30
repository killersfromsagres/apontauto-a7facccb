// Fila local de evidências do módulo Água (item 10.1).
//
// O binário da foto NUNCA é gravado no Supabase: ele fica apenas nesta fila
// local até o ImgBB confirmar o envio. Nenhuma foto é descartada em silêncio —
// itens com erro permanecem na fila com status "erro" até o retry manual.

const DB_NAME = "agua-evidencias";
const DB_VERSION = 1;
const STORE = "fila_fotos";

export type FotoFilaStatus = "pendente" | "enviando" | "erro" | "enviada";

export interface FotoMetadados {
  visitaId?: string | null;
  rotaId?: string | null;
  pontoId?: string | null;
  filtroSolicitacaoId?: string | null;
  tipo?: string;
  colaborador?: string | null;
  veiculo?: string | null;
  predio?: string | null;
  andar?: string | null;
  espaco?: string | null;
  data?: string | null;
}

export interface FotoFilaItem {
  id: string;
  blob: Blob;
  /** Miniatura em dataURL para exibir sem rede. */
  thumb: string;
  hash: string;
  mime: string;
  largura: number;
  altura: number;
  sizeBytes: number;
  capturadaEm: string;
  nomeArquivo: string;
  meta: FotoMetadados;
  status: FotoFilaStatus;
  tentativas: number;
  proximaTentativaEm: number;
  ultimoErro?: string | null;
  url?: string | null;
  criadoEm: number;
}

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
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "id" });
        s.createIndex("status", "status", { unique: false });
        s.createIndex("hash", "hash", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function notificarFila(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("agua:fotos"));
}

export async function salvarItem(item: FotoFilaItem): Promise<void> {
  await tx("readwrite", (s) => s.put(item));
  notificarFila();
}

export async function listarFila(): Promise<FotoFilaItem[]> {
  const itens = await tx<FotoFilaItem[]>("readonly", (s) => s.getAll() as IDBRequest<FotoFilaItem[]>);
  return (itens ?? []).sort((a, b) => a.criadoEm - b.criadoEm);
}

export async function obterItem(id: string): Promise<FotoFilaItem | undefined> {
  return tx<FotoFilaItem | undefined>("readonly", (s) => s.get(id) as IDBRequest<FotoFilaItem | undefined>);
}

/** Remoção só acontece após confirmação de envio (política de retenção 10.3). */
export async function removerItem(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
  notificarFila();
}

export async function existeHashNaFila(hash: string): Promise<boolean> {
  const itens = await listarFila();
  return itens.some((i) => i.hash === hash);
}
