import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { outboxAll, outboxRemove, blobGet, blobDelete } from "./db";
import { postImgbbForm } from "../imgbb-post";


let isSyncing = false;

export function useCorretivaSync() {
  useEffect(() => {
    const sync = async () => {
      if (isSyncing || !navigator.onLine) return;
      
      const items = await outboxAll();
      if (items.length === 0) return;

      isSyncing = true;
      console.log(`[CorretivaSync] Iniciando sincronização de ${items.length} itens...`);

      for (const item of items) {
        try {
          if (item.kind === "foto") {
            const { blobKey, legenda } = item.payload;
            const blob = await blobGet(blobKey);
            
            if (!blob) {
              console.warn(`[CorretivaSync] Blob não encontrado para a chave: ${blobKey}`);
              await outboxRemove(item.id);
              continue;
            }

            // 1. Upload para ImgBB
            const formData = new FormData();
            formData.append("image", blob);
            formData.append("module", "corretiva-novo");
            formData.append("name", blobKey);

            const { url } = await postImgbbForm(formData);
            
            if (url) {
              // 2. Salvar na tabela de fotos do Supabase
              const { data: sess } = await supabase.auth.getSession();
              const userId = sess.session?.user?.id;

              const { error: dbErr } = await supabase.from("corretiva_fotos").insert({
                os_id: item.osId,
                image_url: url,
                legenda: legenda,
                enviado_por: userId
              } as any);

              if (dbErr) throw dbErr;

              // 3. Limpar após sucesso
              await blobDelete(blobKey);
              await outboxRemove(item.id);
              console.log(`[CorretivaSync] Item ${item.id} sincronizado com sucesso.`);
            }
          } else if (item.kind === "status") {
             const { status } = item.payload;
             const { error } = await supabase
                .from("corretiva_os")
                .update({ status, updated_at: new Date().toISOString() } as any)
                .eq("id", item.osId);
             
             if (error) throw error;
             await outboxRemove(item.id);
          }
          // Adicionar outros tipos (pecas, etc) se necessário
        } catch (err) {
          console.error(`[CorretivaSync] Erro ao sincronizar item ${item.id}:`, err);
          // O item permanece no outbox para a próxima tentativa
        }
      }

      isSyncing = false;
    };

    const interval = setInterval(sync, 10000); // 10 segundos
    return () => clearInterval(interval);
  }, []);
}
