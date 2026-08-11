
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const recuperarHistoricoRefrigeracao = createServerFn({ method: "POST" })
  .handler(async () => {
    // 1. Buscar TODAS as OS sem filtro de status para capturar o máximo de informação histórica
    // Incluímos as que podem ter sido "excluídas" logicamente ou apenas limpas se o sistema mantiver registros em histórico
    const { data: osList, error: osError } = await supabaseAdmin
      .from("refrigeracao_os")
      .select(`
        id,
        ativo, 
        equipamento, 
        patrimonio, 
        nome_os, 
        fim,
        status,
        updated_at
      `)
      .order('updated_at', { ascending: true });

    if (osError) throw osError;
    if (!osList || osList.length === 0) return { recovered: 0 };

    // 2. Buscar peças e problemas relacionados para enriquecer o histórico técnico
    const { data: pecas } = await supabaseAdmin.from("refrigeracao_pecas").select("*");
    const { data: problemas } = await supabaseAdmin.from("refrigeracao_problemas").select("*");

    const pecasMap = new Map<string, any[]>();
    pecas?.forEach(p => {
      if (!p.os_id) return;
      const list = pecasMap.get(p.os_id) || [];
      list.push(p);
      pecasMap.set(p.os_id, list);
    });

    const problemasMap = new Map<string, any[]>();
    problemas?.forEach(p => {
      if (!p.os_id) return;
      const list = problemasMap.get(p.os_id) || [];
      list.push(p);
      problemasMap.set(p.os_id, list);
    });

    // 3. Agrupar por ativo/equipamento
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
      
      const techDetails: string[] = [];
      if (os.nome_os) techDetails.push(os.nome_os.trim());
      
      // Adicionar peças solicitadas ao histórico
      const osPecas = pecasMap.get(os.id);
      if (osPecas && osPecas.length > 0) {
        techDetails.push(`Peças: ${osPecas.map(p => `${p.descricao} (${p.modelo || ''} ${p.btus || ''}BTU)` ).join(", ")}`);
      }

      // Adicionar problemas relatados ao histórico
      const osProbs = problemasMap.get(os.id);
      if (osProbs && osProbs.length > 0) {
        techDetails.push(`Problemas: ${osProbs.map(p => p.descricao).join(", ")}`);
      }

      const infoStr = techDetails.join(" | ");

      if (!map.has(key)) {
        map.set(key, {
          ativo: os.ativo.trim(),
          equipamento: os.equipamento.trim(),
          patrimonio: os.patrimonio,
          infos: new Set(infoStr ? [infoStr] : []),
          lastDate: os.fim || os.updated_at
        });
      } else {
        const existing = map.get(key)!;
        // Priorizar patrimônio se encontrado em qualquer OS
        if (os.patrimonio && !existing.patrimonio) existing.patrimonio = os.patrimonio;
        if (infoStr) existing.infos.add(infoStr);
        
        const currentDate = os.fim || os.updated_at;
        if (currentDate && (!existing.lastDate || new Date(currentDate) > new Date(existing.lastDate))) {
          existing.lastDate = currentDate;
        }
      }
    }

    // 4. Upsert no histórico permanente
    let recoveredCount = 0;
    for (const data of map.values()) {
      // Concatenar informações únicas para não perder histórico
      const { error: upsertError } = await supabaseAdmin
        .from("refrigeracao_historico_permanente")
        .upsert({
          ativo: data.ativo,
          equipamento: data.equipamento,
          patrimonio: data.patrimonio,
          informacoes_tecnicas: Array.from(data.infos).join("\n---\n"),
          data_ultima_atualizacao: data.lastDate || new Date().toISOString()
        }, { onConflict: "ativo, equipamento" });
      
      if (!upsertError) recoveredCount++;
    }

    return { recovered: recoveredCount };
  });

