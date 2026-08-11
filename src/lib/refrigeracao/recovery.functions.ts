
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const recuperarHistoricoRefrigeracao = createServerFn({ method: "POST" })
  .handler(async () => {
    // 1. Buscar todas as OS concluídas
    const { data: osList, error: osError } = await supabaseAdmin
      .from("refrigeracao_os")
      .select("ativo, equipamento, patrimonio, nome_os, fim")
      .eq("status", "concluida");

    if (osError) throw osError;
    if (!osList || osList.length === 0) return { recovered: 0 };

    // 2. Agrupar por ativo/equipamento
    const map = new Map();
    for (const os of osList) {
      const key = `${os.ativo}|${os.equipamento}`;
      if (!map.has(key)) {
        map.set(key, {
          ativo: os.ativo,
          equipamento: os.equipamento,
          patrimonio: os.patrimonio,
          infos: [os.nome_os],
          lastDate: os.fim
        });
      } else {
        const existing = map.get(key);
        if (os.patrimonio && !existing.patrimonio) existing.patrimonio = os.patrimonio;
        if (os.nome_os && !existing.infos.includes(os.nome_os)) existing.infos.push(os.nome_os);
        if (os.fim && (!existing.lastDate || new Date(os.fim) > new Date(existing.lastDate))) {
          existing.lastDate = os.fim;
        }
      }
    }

    // 3. Upsert no histórico permanente
    let recoveredCount = 0;
    for (const [key, data] of map.entries()) {
      const { error: upsertError } = await supabaseAdmin
        .from("refrigeracao_historico_permanente")
        .upsert({
          ativo: data.ativo,
          equipamento: data.equipamento,
          patrimonio: data.patrimonio,
          informacoes_tecnicas: data.infos.join(" | "),
          data_ultima_atualizacao: data.lastDate || new Date().toISOString()
        }, { onConflict: "ativo, equipamento" });
      
      if (!upsertError) recoveredCount++;
    }

    return { recovered: recoveredCount };
  });
