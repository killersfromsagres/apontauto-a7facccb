import { supabase } from "@/integrations/supabase/client";
import { outboxAll, outboxRemove, outboxUpdate, blobGet, blobDelete } from "./db";
import { postImgbbForm } from "../imgbb-post";

let isSyncing = false;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Falha desconhecida na sincronização";
}

function asPositiveQuantity(value: unknown) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

/**
 * Sincroniza o outbox da execução de campo.
 * Novas operações ficam vinculadas ao usuário que as originou. Itens legados
 * (sem userId) continuam compatíveis para não perder apontamentos já existentes.
 */
export async function syncPending() {
  if (isSyncing || !navigator.onLine) return { sent: 0, failed: 0, skipped: 0 };

  const { data: sessionData } = await supabase.auth.getSession();
  const currentUserId = sessionData.session?.user?.id ?? null;
  if (!currentUserId) return { sent: 0, failed: 0, skipped: 0 };

  const allItems = await outboxAll();
  if (allItems.length === 0) return { sent: 0, failed: 0, skipped: 0 };

  const items = allItems.filter((item) => !item.userId || item.userId === currentUserId);
  const skipped = allItems.length - items.length;
  if (items.length === 0) return { sent: 0, failed: 0, skipped };

  isSyncing = true;
  let sent = 0;
  let failed = 0;

  try {
    for (const item of items) {
      try {
        if (item.kind === "foto") {
          const payload = item.payload ?? {};
          const blobKey = String(payload.blobKey || "");
          const legenda = payload.legenda ? String(payload.legenda) : null;
          const clientUuid = String(payload.clientUuid || item.id).replace(/^foto:[^:]+:/, "");

          const { data: existingPhoto, error: existingPhotoError } = await (supabase.from("corretiva_fotos") as any)
            .select("id")
            .eq("client_uuid", clientUuid)
            .maybeSingle();
          if (existingPhotoError) throw existingPhotoError;

          if (existingPhoto) {
            if (blobKey) await blobDelete(blobKey).catch(() => {});
            await outboxRemove(item.id);
            sent++;
            continue;
          }

          if (!blobKey) {
            await outboxRemove(item.id);
            sent++;
            continue;
          }

          const blob = await blobGet(blobKey);
          if (!blob) {
            await outboxRemove(item.id);
            sent++;
            continue;
          }

          const formData = new FormData();
          formData.append("image", blob);
          formData.append("module", "corretiva-novo");
          formData.append("name", blobKey);

          const { url } = await postImgbbForm(formData);
          if (!url) throw new Error("Não foi possível obter a URL da foto.");

          const { error: dbErr } = await supabase.from("corretiva_fotos").insert({
            os_id: item.osId,
            image_url: url,
            legenda,
            client_uuid: clientUuid,
            enviado_por: currentUserId,
          } as any);

          if (dbErr) throw dbErr;
          await blobDelete(blobKey);
          await outboxRemove(item.id);
          sent++;
          continue;
        }

        if (item.kind === "status") {
          const payload = item.payload ?? {};
          const { error } = await supabase
            .from("corretiva_os")
            .update({ ...payload, updated_at: new Date().toISOString() } as any)
            .eq("id", item.osId);

          if (error) throw error;
          await outboxRemove(item.id);
          sent++;
          continue;
        }

        if (item.kind === "material_status") {
          const { error } = await supabase
            .from("corretiva_os")
            .update({ material_status: "solicitado", updated_at: new Date().toISOString() } as any)
            .eq("id", item.osId);

          if (error) throw error;
          await outboxRemove(item.id);
          sent++;
          continue;
        }

        if (item.kind === "peca") {
          const payload = item.payload ?? {};
          const descricao = String(payload.descricao ?? payload.pecas ?? "").trim();
          if (!descricao) throw new Error("Peça sem descrição.");

          const modelo = payload.modelo ? String(payload.modelo).trim() : null;
          const quantidade = asPositiveQuantity(payload.quantidade);
          const urgencia = payload.urgencia ? String(payload.urgencia) : "media";
          const observacao = payload.observacao ? String(payload.observacao).trim() : null;
          const clientUuid = String(payload.id ?? item.id);
          const now = new Date().toISOString();

          const { data: existing, error: existingError } = await (supabase.from("corretiva_pecas") as any)
            .select("id")
            .eq("client_uuid", clientUuid)
            .maybeSingle();
          if (existingError) throw existingError;

          if (!existing) {
            const { error: insertError } = await supabase.from("corretiva_pecas").insert({
              os_id: item.osId,
              descricao,
              modelo,
              quantidade,
              urgencia,
              observacao,
              status_gestor: "pendente",
              material_status: "solicitado",
              material_request_date: now,
              client_uuid: clientUuid,
              enviado_por: currentUserId,
              created_at: now,
              updated_at: now,
            } as any);
            if (insertError) throw insertError;
          }

          const { data: currentOs, error: osReadError } = await supabase
            .from("corretiva_os")
            .select("numero_os, pecas_solicitadas")
            .eq("id", item.osId)
            .single();
          if (osReadError) throw osReadError;

          const historyLine = [
            `OS ${currentOs.numero_os ?? item.numeroOs ?? ""}`.trim(),
            `Peça: ${descricao}`,
            `Qtd: ${quantidade}`,
            modelo ? `Modelo: ${modelo}` : null,
            `Urgência: ${urgencia}`,
            observacao ? `Obs.: ${observacao}` : null,
            `Data: ${new Date(now).toLocaleString("pt-BR")}`,
            `ID: ${clientUuid}`,
          ]
            .filter(Boolean)
            .join(" · ");

          const currentHistory = String(currentOs.pecas_solicitadas ?? "");
          const newHistory = currentHistory.includes(`ID: ${clientUuid}`)
            ? currentHistory
            : currentHistory
              ? `${currentHistory}\n${historyLine}`
              : historyLine;

          const { error: osUpdateError } = await supabase
            .from("corretiva_os")
            .update({
              material_status: "solicitado",
              pecas_solicitadas: newHistory,
              updated_at: now,
            } as any)
            .eq("id", item.osId);
          if (osUpdateError) throw osUpdateError;

          await outboxRemove(item.id);
          sent++;
          continue;
        }

        if (item.kind === "material") {
          const {
            descricao,
            equipe,
            solicitante,
            predio,
            local,
            numeroOs,
            observacao,
          } = item.payload;

          const { data: solData, error } = await supabase
            .from("material_solicitacoes")
            .insert({
              user_id: currentUserId,
              solicitante: solicitante || "Colaborador",
              setor: equipe || null,
              predio: predio || null,
              local: local || null,
              prioridade: "normal",
              status: "enviada",
              observacao: `[Solicitado via OS ${numeroOs}] ${observacao || ""}`,
              enviada_em: new Date().toISOString(),
            } as any)
            .select("id")
            .single();

          if (error) throw error;
          const solId = (solData as any)?.id;
          if (!solId) throw new Error("Solicitação de material sem ID.");

          const { error: itemError } = await supabase
            .from("material_solicitacao_itens")
            .insert({
              solicitacao_id: solId,
              descricao,
              quantidade: 1,
              unidade: "UN",
              justificativa: `Referente à OS ${numeroOs}`,
            } as any);
          if (itemError) throw itemError;

          await outboxRemove(item.id);
          sent++;
          continue;
        }

        if (item.kind === "problema") {
          const { error } = await supabase.from("corretiva_problemas").insert({
            os_id: item.osId,
            descricao: item.payload.descricao,
            gravidade: item.payload.gravidade ?? "falha",
            enviado_por: currentUserId,
            client_uuid: item.id,
          } as any);
          if (error) throw error;
          await outboxRemove(item.id);
          sent++;
          continue;
        }

        throw new Error(`Tipo de outbox desconhecido: ${String(item.kind)}`);
      } catch (err) {
        failed++;
        const message = getErrorMessage(err);
        console.error(`[CorretivaSync] Erro ao sincronizar ${item.kind}/${item.id}:`, message);
        await outboxUpdate({
          ...item,
          attempts: (item.attempts ?? 0) + 1,
          lastError: message,
        }).catch(() => {});
      }
    }
  } finally {
    isSyncing = false;
  }

  return { sent, failed, skipped };
}
