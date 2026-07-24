import { supabase } from "@/integrations/supabase/client";
import { uploadImageToImgBB } from "@/lib/imgbb";
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
    const { error } = await supabase.from("corretiva_pecas").insert({
      os_id: item.osId,
      descricao: item.payload.descricao,
      quantidade: item.payload.quantidade ?? 1,
      urgencia: item.payload.urgencia ?? "media",
      observacao: item.payload.observacao ?? null,
      client_uuid: item.id,
      enviado_por: uid,
    });
    if (error && !isDupError(error)) throw error;
    return;
  }
  if (item.kind === "problema") {
    const { error } = await supabase.from("corretiva_problemas").insert({
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
      .from("corretiva_os")
      .update({ patrimonio: item.payload.patrimonio ?? null })
      .eq("id", item.osId);
    if (error) throw error;
    return;
  }
  if (item.kind === "status") {
    const { error } = await supabase
      .from("corretiva_os")
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
    // Hospeda no ImgBB (grátis, externo). Supabase guarda apenas a URL.
    const uploaded = await uploadImageToImgBB(
      blob,
      `os-${item.numeroOs}-${item.id}.jpg`,
    );
    const { error } = await supabase.from("corretiva_fotos").insert({
      os_id: item.osId,
      image_url: uploaded.url,
      storage_path: null,
      legenda: item.payload.legenda ?? null,
      client_uuid: item.id,
      enviado_por: uid,
    } as any);
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

export type SyncResultDetailed = SyncResult & { firstError?: string };

export function syncPending(): Promise<SyncResultDetailed> {
  if (running) return running as Promise<SyncResultDetailed>;
  running = (async () => {
    const items = await outboxAll();
    let sent = 0;
    let failed = 0;
    let firstError: string | undefined;
    for (const item of items) {
      try {
        await sendOne(item);
        await outboxRemove(item.id);
        sent++;
      } catch (err: any) {
        failed++;
        const msg = err?.message ?? String(err);
        if (!firstError) firstError = `${item.kind}: ${msg}`;
        console.error("[corretiva/sync]", item.kind, item.id, err);
        await outboxUpdate({
          ...item,
          attempts: item.attempts + 1,
          lastError: msg,
        });
      }
    }
    return { sent, failed, remaining: failed, firstError };
  })().finally(() => {
    running = null;
  });
  return running as Promise<SyncResultDetailed>;
}
