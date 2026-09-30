import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
const LOCAL_DB_NAME = "apontauto-programacao-historico";
const LOCAL_STORE = "arquivos";
const LOCAL_VERSION = 1;
const BUCKET = "programacao-historico";

export interface HistoricoItem {
  id: string;
  filename: string;
  week: number;
  slot: string;
  slotLabel: string;
  totalOS: number;
  titulo: string;
  createdAt: number;
  blob?: Blob;
  storagePath?: string;
  fileSize?: number;
  periodStart?: string;
  periodEnd?: string;
  preventiveCount?: number;
  correctiveCount?: number;
  remainingMinutes?: number;
  persistent?: boolean;
}

function openLocalDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LOCAL_DB_NAME, LOCAL_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(LOCAL_STORE)) {
        const store = database.createObjectStore(LOCAL_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("week", "week");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveLocal(item: HistoricoItem): Promise<void> {
  const database = await openLocalDB();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(LOCAL_STORE, "readwrite");
    tx.objectStore(LOCAL_STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  database.close();
}

async function listLocal(): Promise<HistoricoItem[]> {
  const database = await openLocalDB();
  const items = await new Promise<HistoricoItem[]>((resolve, reject) => {
    const tx = database.transaction(LOCAL_STORE, "readonly");
    const req = tx.objectStore(LOCAL_STORE).getAll();
    req.onsuccess = () => resolve((req.result as HistoricoItem[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  database.close();
  return items.map((item) => ({ ...item, persistent: false }));
}

async function deleteLocal(id: string): Promise<void> {
  const database = await openLocalDB();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(LOCAL_STORE, "readwrite");
    tx.objectStore(LOCAL_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  database.close();
}

async function clearLocal(): Promise<void> {
  const database = await openLocalDB();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(LOCAL_STORE, "readwrite");
    tx.objectStore(LOCAL_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  database.close();
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) throw new Error("Sessão não encontrada.");
  return uid;
}

function safeFilename(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}

/**
 * Persiste a planilha no Supabase Storage e os metadados no banco.
 * O IndexedDB permanece apenas como contingência para ambientes sem conexão.
 */
export async function saveHistorico(item: HistoricoItem): Promise<void> {
  if (!item.blob) throw new Error("Arquivo da programação não disponível.");

  try {
    const uid = await currentUserId();
    const path = `${uid}/${item.id}-${safeFilename(item.filename)}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, item.blob, {
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });
    if (uploadError) throw uploadError;

    const { error: insertError } = await db.from("programacao_arquivos").insert({
      id: item.id,
      filename: item.filename,
      week: item.week,
      slot: item.slot,
      slot_label: item.slotLabel,
      total_os: item.totalOS,
      titulo: item.titulo,
      storage_path: path,
      file_size: item.blob.size,
      period_start: item.periodStart || null,
      period_end: item.periodEnd || null,
      preventive_count: item.preventiveCount ?? 0,
      corrective_count: item.correctiveCount ?? 0,
      remaining_minutes: item.remainingMinutes ?? 0,
      created_by: uid,
      created_at: new Date(item.createdAt).toISOString(),
    });

    if (insertError) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw insertError;
    }

    // Remove eventual cópia local antiga do mesmo ID.
    await deleteLocal(item.id).catch(() => undefined);
  } catch (error) {
    console.warn(
      "[ProgramacaoHistorico] Persistência em nuvem indisponível; usando cache local.",
      error,
    );
    await saveLocal({ ...item, persistent: false });
  }
}

export async function listHistorico(): Promise<HistoricoItem[]> {
  let cloud: HistoricoItem[] = [];

  try {
    const { data, error } = await db
      .from("programacao_arquivos")
      .select(
        "id,filename,week,slot,slot_label,total_os,titulo,storage_path,file_size,period_start,period_end,preventive_count,corrective_count,remaining_minutes,created_at",
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    cloud = (data ?? []).map((row: any) => ({
      id: String(row.id),
      filename: String(row.filename),
      week: Number(row.week),
      slot: String(row.slot),
      slotLabel: String(row.slot_label),
      totalOS: Number(row.total_os ?? 0),
      titulo: String(row.titulo ?? ""),
      createdAt: new Date(row.created_at).getTime(),
      storagePath: String(row.storage_path),
      fileSize: Number(row.file_size ?? 0),
      periodStart: row.period_start ?? undefined,
      periodEnd: row.period_end ?? undefined,
      preventiveCount: Number(row.preventive_count ?? 0),
      correctiveCount: Number(row.corrective_count ?? 0),
      remainingMinutes: Number(row.remaining_minutes ?? 0),
      persistent: true,
    }));
  } catch (error) {
    console.warn("[ProgramacaoHistorico] Falha ao consultar histórico em nuvem.", error);
  }

  const local = await listLocal().catch(() => [] as HistoricoItem[]);
  const seen = new Set(cloud.map((item) => item.id));
  return [...cloud, ...local.filter((item) => !seen.has(item.id))].sort(
    (a, b) => b.createdAt - a.createdAt,
  );
}

export async function getHistoricoBlob(item: HistoricoItem): Promise<Blob> {
  if (item.blob) return item.blob;
  if (!item.storagePath) {
    throw new Error("Arquivo não encontrado no histórico.");
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(item.storagePath);
  if (error || !data) {
    throw new Error(
      error?.message || "Não foi possível recuperar a planilha salva.",
    );
  }
  return data;
}

export async function deleteHistorico(itemOrId: HistoricoItem | string): Promise<void> {
  const id = typeof itemOrId === "string" ? itemOrId : itemOrId.id;
  const item =
    typeof itemOrId === "string"
      ? (await listHistorico()).find((entry) => entry.id === id)
      : itemOrId;

  if (item?.storagePath) {
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([item.storagePath]);
    if (storageError) {
      console.warn("[ProgramacaoHistorico] Falha ao excluir arquivo.", storageError);
    }

    const { error: dbError } = await db
      .from("programacao_arquivos")
      .delete()
      .eq("id", id);
    if (dbError) throw dbError;
  }

  await deleteLocal(id).catch(() => undefined);
}

export async function clearHistorico(): Promise<void> {
  const items = await listHistorico();
  const cloudPaths = items
    .map((item) => item.storagePath)
    .filter((path): path is string => Boolean(path));

  if (cloudPaths.length) {
    for (let index = 0; index < cloudPaths.length; index += 100) {
      const { error } = await supabase.storage
        .from(BUCKET)
        .remove(cloudPaths.slice(index, index + 100));
      if (error) throw error;
    }

    const ids = items
      .filter((item) => item.storagePath)
      .map((item) => item.id);
    if (ids.length) {
      const { error } = await db
        .from("programacao_arquivos")
        .delete()
        .in("id", ids);
      if (error) throw error;
    }
  }

  await clearLocal().catch(() => undefined);
}
