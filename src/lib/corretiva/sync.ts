import { supabase } from "@/integrations/supabase/client";
import { uploadPhotoWithFallback } from "@/lib/photo-upload";
import { outboxAll, outboxRemove, outboxUpdate, blobGet, blobDelete, type OutboxItem } from "./db";

let running: Promise<SyncResultDetailed> | null = null;

export type SyncResult = {
  sent: number;
  failed: number;
  remaining: number;
};

export type SyncItemError = {
  id: string;
  kind: OutboxItem["kind"];
  numeroOs: string;
  message: string;
};

export type SyncResultDetailed = SyncResult & {
  firstError?: string;
  errors: SyncItemError[];
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (typeof err === "object" && err !== null) {
    const record = err as Record<string, unknown>;
    const message = record.message ?? record.error_description ?? record.error;
    if (typeof message === "string" && message.trim()) return message;
    try {
      return JSON.stringify(record);
    } catch {
      /* falha silenciosa: cache local é um extra */
    }
  }
  return "Erro desconhecido ao sincronizar";
}

function formatItemError(item: OutboxItem, message: string): string {
  return `${item.kind} · OS ${item.numeroOs}: ${message}`;
}

async function sendOne(item: OutboxItem): Promise<void> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) throw new Error("Sem sessão");

  if (item.kind === "peca") {
    const { error } = await supabase.from("corretiva_pecas").insert({
      os_id: item.osId,
      descricao: item.payload.descricao,
      modelo: item.payload.modelo ?? null,
      quantidade: item.payload.quantidade ?? 1,
      urgencia: item.payload.urgencia ?? "media",
      observacao: item.payload.observacao ?? null,
      client_uuid: item.id,
      enviado_por: uid,
    } as any);
    if (error && !isDupError(error)) throw error;
    return;
  }
  if (item.kind === "assinatura") {
    const dataUrl: string | undefined = item.payload.dataUrl;
    if (!dataUrl) throw new Error("Rubrica vazia");
    const blob = await (await fetch(dataUrl)).blob();
    const uploaded = await uploadPhotoWithFallback(
      blob,
      `rubrica-os-${item.numeroOs}-${item.id}.png`,
      "corretiva-fotos",
      { module: "corretiva", entityType: "corretiva_os", entityId: item.osId },
    );
    const { error } = await supabase
      .from("corretiva_os")
      .update({
        assinatura_url: uploaded.url,
        assinatura_nome: item.payload.nome ?? null,
        assinatura_em: item.payload.assinadoEm ?? new Date().toISOString(),
      } as any)
      .eq("id", item.osId);
    if (error) throw error;
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
      .update({
        status: item.payload.status ?? "concluida",
        fim: item.payload.fim ?? new Date().toISOString(),
      })
      .eq("id", item.osId);
    if (error) throw error;
    return;
  }
  if (item.kind === "foto") {
    const blobKey: string | undefined = item.payload.blobKey;
    if (!blobKey) throw new Error("Foto sem blob");
    const blob = await blobGet(blobKey);
    if (!blob) throw new Error("Blob local ausente");
    // Hospeda no ImgBB; se falhar, cai para o Storage (nunca perde a foto).
    const uploaded = await uploadPhotoWithFallback(
      blob,
      `os-${item.numeroOs}-${item.id}.jpg`,
      "corretiva-fotos",
      { module: "corretiva", entityType: "corretiva_fotos", entityId: item.osId },
    );
    const { error } = await supabase.from("corretiva_fotos").insert({
      os_id: item.osId,
      image_url: uploaded.url || null,
      storage_path: uploaded.storagePath,
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

export function syncPending(): Promise<SyncResultDetailed> {
  if (running) return running;
  running = (async () => {
    const items = await outboxAll();
    let sent = 0;
    let failed = 0;
    let firstError: string | undefined;
    const errors: SyncItemError[] = [];
    for (const item of items) {
      try {
        await sendOne(item);
        await outboxRemove(item.id);
        sent++;
      } catch (err: any) {
        failed++;
        const msg = getErrorMessage(err);
        const formatted = formatItemError(item, msg);
        errors.push({ id: item.id, kind: item.kind, numeroOs: item.numeroOs, message: msg });
        if (!firstError) firstError = formatted;
        console.error("[corretiva/sync]", item.kind, item.id, err);
        await outboxUpdate({
          ...item,
          attempts: item.attempts + 1,
          lastError: msg,
        });
      }
    }
    const remaining = (await outboxAll()).length;
    return { sent, failed, remaining, firstError, errors };
  })().finally(() => {
    running = null;
  });
  return running;
}
