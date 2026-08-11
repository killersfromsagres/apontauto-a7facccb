
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const recuperarHistoricoRefrigeracao = createServerFn({ method: "POST" })
  .handler(async () => {
    // 1. Buscar TODAS as OS concluídas sem limite, incluindo meses anteriores
    const { data: osList, error: osError } = await supabaseAdmin
      .from("refrigeracao_os")
      .select("ativo, equipamento, patrimonio, nome_os, fim")
      .eq("status", "concluida");

    if (osError) throw osError;
    if (!osList || osList.length === 0) return { recovered: 0 };

    // 2. Agrupar por ativo/equipamento de forma robusta
    const map = new Map<string, {
      ativo: string;
      equipamento: string;
      patrimonio: string | null;
      infos: Set<string>;
      lastDate: string | null;
    }>();

    for (const os of osList) {
      if (!os.ativo || !os.equipamento) continue;
      const key = `${os.ativo.trim()}|${os.equipamento.trim()}`;
      
      if (!map.has(key)) {
        map.set(key, {
          ativo: os.ativo.trim(),
          equipamento: os.equipamento.trim(),
          patrimonio: os.patrimonio,
          infos: new Set(os.nome_os ? [os.nome_os.trim()] : []),
          lastDate: os.fim
        });
      } else {
        const existing = map.get(key)!;
        if (os.patrimonio && !existing.patrimonio) existing.patrimonio = os.patrimonio;
        if (os.nome_os) existing.infos.add(os.nome_os.trim());
        if (os.fim && (!existing.lastDate || new Date(os.fim) > new Date(existing.lastDate))) {
          existing.lastDate = os.fim;
        }
      }
    }

    // 3. Upsert no histórico permanente
    let recoveredCount = 0;
    for (const data of map.values()) {
      const { error: upsertError } = await supabaseAdmin
        .from("refrigeracao_historico_permanente")
        .upsert({
          ativo: data.ativo,
          equipamento: data.equipamento,
          patrimonio: data.patrimonio,
          informacoes_tecnicas: Array.from(data.infos).join(" | "),
          data_ultima_atualizacao: data.lastDate || new Date().toISOString()
        }, { onConflict: "ativo, equipamento" });
      
      if (!upsertError) recoveredCount++;
    }

    return { recovered: recoveredCount };
  });
