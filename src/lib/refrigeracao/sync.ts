import { supabase } from "@/integrations/supabase/client";
import {
  outboxAll,
  outboxRemove,
  outboxUpdate,
  blobGet,
  blobDelete,
  type OutboxItem,
} from "./db";

let running: Promise<SyncResult> | null = null;

export type SyncResult = {
  sent: number;
  failed: number;
  remaining: number;
};

async function sendOne(item: OutboxItem): Promise<void> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) throw new Error("Sem sessão");

  if (item.kind === "peca") {
    const { error } = await supabase.from("refrigeracao_pecas").insert({
      os_id: item.osId,
      descricao: item.payload.descricao,
      quantidade: item.payload.quantidade ?? 1,
      urgencia: item.payload.urgencia ?? "media",
      observacao: item.payload.observacao ?? null,
      patrimonio: item.payload.patrimonio ?? null,
      modelo: item.payload.modelo ?? null,
      btus: item.payload.btus ?? null,
      client_uuid: item.id,
      enviado_por: uid,
    } as any);
    if (error && !isDupError(error)) throw error;
    return;
  }

  if (item.kind === "problema") {
    const { error } = await supabase.from("refrigeracao_problemas").insert({
      os_id: item.osId,
      descricao: item.payload.descricao,
      gravidade: item.payload.gravidade ?? "falha",
      client_uuid: item.id,
      enviado_por: uid,
    });
    if (error && !isDupError(error)) throw error;
    return;
  }
  if (item.kind === "patrimonio") {
    const { error } = await supabase
      .from("refrigeracao_os")
      .update({ patrimonio: item.payload.patrimonio ?? null })
      .eq("id", item.osId);
    if (error) throw error;
    return;
  }
  if (item.kind === "status") {
    const { error } = await supabase
      .from("refrigeracao_os")
      .update({ status: item.payload.status ?? "concluida", fim: item.payload.fim ?? new Date().toISOString() })
      .eq("id", item.osId);
    if (error) throw error;
    return;
  }
  if (item.kind === "foto") {
    const blobKey: string | undefined = item.payload.blobKey;
    if (!blobKey) throw new Error("Foto sem blob");
    const blob = await blobGet(blobKey);
    if (!blob) throw new Error("Blob local ausente");
    const path = `${uid}/${item.osId}/${item.id}.jpg`;
    const up = await supabase.storage
      .from("refrigeracao-fotos")
      .upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (up.error && !/exists/i.test(up.error.message)) throw up.error;
    const { error } = await supabase.from("refrigeracao_fotos").insert({
      os_id: item.osId,
      storage_path: path,
      legenda: item.payload.legenda ?? null,
      client_uuid: item.id,
      enviado_por: uid,
    });
    if (error && !isDupError(error)) throw error;
    await blobDelete(blobKey);
    return;
  }
  throw new Error(`Tipo desconhecido: ${(item as any).kind}`);
}

function isDupError(error: any): boolean {
  const msg = String(error?.message ?? error?.code ?? "");
  return /duplicate|23505|unique/i.test(msg);
}

export function syncPending(): Promise<SyncResult> {
  if (running) return running;
  running = (async () => {
    const items = await outboxAll();
    let sent = 0;
    let failed = 0;
    for (const item of items) {
      try {
        await sendOne(item);
        await outboxRemove(item.id);
        sent++;
      } catch (err: any) {
        failed++;
        await outboxUpdate({
          ...item,
          attempts: item.attempts + 1,
          lastError: err?.message ?? String(err),
        });
      }
    }
    return { sent, failed, remaining: failed };
  })().finally(() => {
    running = null;
  });
  return running;
}
