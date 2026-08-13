import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { outboxAll, outboxRemove, blobGet, blobDelete } from "./db";
import { postImgbbForm } from "../imgbb-post";

let isSyncing = false;

export async function syncPending() {
  if (isSyncing || !navigator.onLine) return { sent: 0, failed: 0 };
  
  const items = await outboxAll();
  if (items.length === 0) return { sent: 0, failed: 0 };

  isSyncing = true;
  let sent = 0;
  let failed = 0;
  console.log(`[CorretivaSync] Iniciando sincronização de ${items.length} itens...`);

  for (const item of items) {
    try {
      if (item.kind === "foto") {
        const { blobKey, legenda } = item.payload;
        const blob = await blobGet(blobKey);
        
        if (!blob) {
          console.warn(`[CorretivaSync] Blob não encontrado para a chave: ${blobKey}`);
          await outboxRemove(item.id);
          sent++;
          continue;
        }

        const formData = new FormData();
        formData.append("image", blob);
        formData.append("module", "corretiva-novo");
        formData.append("name", blobKey);

        const { url } = await postImgbbForm(formData);
        
        if (url) {
          const { data: sess } = await supabase.auth.getSession();
          const userId = sess.session?.user?.id;

          const { error: dbErr } = await supabase.from("corretiva_fotos").insert({
            os_id: item.osId,
            image_url: url,
            legenda: legenda,
            enviado_por: userId
          } as any);

          if (dbErr) throw dbErr;

          await blobDelete(blobKey);
          await outboxRemove(item.id);
          sent++;
        }
      } else if (item.kind === "status") {
         const payload = item.payload;
         const { error } = await supabase
            .from("corretiva_os")
            .update({ ...payload, updated_at: new Date().toISOString() } as any)
            .eq("id", item.osId);
         
         if (error) throw error;
         await outboxRemove(item.id);
         sent++;
      } else if (item.kind === "peca") {
         const { pecas } = item.payload;
         const { data: currentOs } = await (supabase.from("corretiva_os").select("pecas_solicitadas").eq("id", item.osId).single() as any);
         const currentHistory = currentOs?.pecas_solicitadas || "";
         const novoHistorico = currentHistory
           ? `${currentHistory}\n${pecas}` 
           : pecas;
           
         const { error } = await supabase
            .from("corretiva_os")
            .update({ pecas_solicitadas: novoHistorico, updated_at: new Date().toISOString() } as any)
            .eq("id", item.osId);
         
         if (error) throw error;
         await outboxRemove(item.id);
         sent++;
      }
    } catch (err) {
      console.error(`[CorretivaSync] Erro ao sincronizar item ${item.id}:`, err);
      failed++;
    }
  }

  isSyncing = false;
  return { sent, failed };
}
