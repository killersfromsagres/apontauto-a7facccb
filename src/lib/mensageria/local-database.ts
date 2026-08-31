import { INITIAL_ENVIOS, INITIAL_MALOTES } from "./seed-data";
import type { Envio, Malote, MensageriaSnapshot } from "./models";

const DATABASE_NAME = "apontauto-mensageria-local";
const DATABASE_VERSION = 1;
const MALOTES_STORE = "malotes";
const ENVIOS_STORE = "envios";

let databasePromise: Promise<IDBDatabase> | null = null;

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao acessar o armazenamento local."));
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Falha ao salvar no armazenamento local."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Operação local cancelada."));
  });
}

function createMalotesStore(database: IDBDatabase) {
  const store = database.createObjectStore(MALOTES_STORE, { keyPath: "id" });
  store.createIndex("status", "status", { unique: false });
  store.createIndex("setor", "setor", { unique: false });
  store.createIndex("recebido_em", "recebido_em", { unique: false });
  store.createIndex("source_key", "source_key", { unique: true });
  return store;
}

function createEnviosStore(database: IDBDatabase) {
  const store = database.createObjectStore(ENVIOS_STORE, { keyPath: "id" });
  store.createIndex("status", "status", { unique: false });
  store.createIndex("enviado_em", "enviado_em", { unique: false });
  store.createIndex("source_key", "source_key", { unique: true });
  return store;
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Este navegador não disponibiliza armazenamento local IndexedDB."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      const malotesStore = database.objectStoreNames.contains(MALOTES_STORE)
        ? request.transaction!.objectStore(MALOTES_STORE)
        : createMalotesStore(database);
      const enviosStore = database.objectStoreNames.contains(ENVIOS_STORE)
        ? request.transaction!.objectStore(ENVIOS_STORE)
        : createEnviosStore(database);
      if ((event as IDBVersionChangeEvent).oldVersion === 0) {
        INITIAL_MALOTES.forEach((item) => malotesStore.put(item));
        INITIAL_ENVIOS.forEach((item) => enviosStore.put(item));
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Não foi possível abrir o banco local da Mensageria."));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("Feche outras abas do sistema para atualizar o banco local da Mensageria."));
    };
  });
  return databasePromise;
}

export async function loadMensageriaSnapshot(): Promise<MensageriaSnapshot> {
  const database = await openDatabase();
  const transaction = database.transaction([MALOTES_STORE, ENVIOS_STORE], "readonly");
  const completed = transactionComplete(transaction);
  const [malotes, envios] = await Promise.all([
    requestResult(transaction.objectStore(MALOTES_STORE).getAll() as IDBRequest<Malote[]>),
    requestResult(transaction.objectStore(ENVIOS_STORE).getAll() as IDBRequest<Envio[]>),
  ]);
  await completed;
  return {
    malotes: malotes.sort((a, b) => (b.recebido_em ?? b.created_at).localeCompare(a.recebido_em ?? a.created_at)),
    envios: envios.sort((a, b) => (b.enviado_em ?? b.created_at).localeCompare(a.enviado_em ?? a.created_at)),
  };
}

export async function saveLocalMalote(malote: Malote) {
  const database = await openDatabase();
  const transaction = database.transaction(MALOTES_STORE, "readwrite");
  transaction.objectStore(MALOTES_STORE).put(malote);
  await transactionComplete(transaction);
}

export async function saveLocalEnvio(envio: Envio) {
  const database = await openDatabase();
  const transaction = database.transaction(ENVIOS_STORE, "readwrite");
  transaction.objectStore(ENVIOS_STORE).put(envio);
  await transactionComplete(transaction);
}

export async function importLocalHistory(malotes: Malote[], envios: Envio[]) {
  const current = await loadMensageriaSnapshot();
  const existingMalotes = new Set(current.malotes.map((item) => item.source_key).filter(Boolean));
  const existingEnvios = new Set(current.envios.map((item) => item.source_key).filter(Boolean));
  const newMalotes = malotes.filter((item) => !item.source_key || !existingMalotes.has(item.source_key));
  const newEnvios = envios.filter((item) => !item.source_key || !existingEnvios.has(item.source_key));

  const database = await openDatabase();
  const transaction = database.transaction([MALOTES_STORE, ENVIOS_STORE], "readwrite");
  newMalotes.forEach((item) => transaction.objectStore(MALOTES_STORE).put(item));
  newEnvios.forEach((item) => transaction.objectStore(ENVIOS_STORE).put(item));
  await transactionComplete(transaction);
  return { malotes: newMalotes.length, envios: newEnvios.length };
}

export async function resetMensageriaToSpreadsheet() {
  const database = await openDatabase();
  const transaction = database.transaction([MALOTES_STORE, ENVIOS_STORE], "readwrite");
  const malotesStore = transaction.objectStore(MALOTES_STORE);
  const enviosStore = transaction.objectStore(ENVIOS_STORE);
  malotesStore.clear();
  enviosStore.clear();
  INITIAL_MALOTES.forEach((item) => malotesStore.put(item));
  INITIAL_ENVIOS.forEach((item) => enviosStore.put(item));
  await transactionComplete(transaction);
}
