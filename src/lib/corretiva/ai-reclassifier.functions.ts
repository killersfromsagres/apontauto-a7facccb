import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { classifyTeamByText } from "@/lib/backorder/team-classifier";

/**
 * Agente inteligente para reclassificar equipes de OS Corretiva.
 * Analisa a descrição de todas as OS pendentes e atualiza a equipe baseada em IA.
 */
export const reclassifyAllOsWithAi = createServerFn({ method: "POST" })
  .handler(async () => {
    // 1. Buscar todas as OS que não estão concluídas
    const { data: osList, error: fetchError } = await supabase
      .from("corretiva_os")
      .select("id, nome_os, equipamento, ativo, equipe, local")
      .neq("status", "concluida");

    if (fetchError) {
      console.error("[AiReclassifier] Erro ao buscar OS:", fetchError);
      throw new Error("Falha ao buscar OS para reclassificação.");
    }

    if (!osList || osList.length === 0) {
      return { success: true, count: 0 };
    }

    let updatedCount = 0;
    const updates = [];

    // 2. Classificar cada OS
    for (const os of osList) {
      const texto = [os.nome_os, os.equipamento, os.ativo, os.local].filter(Boolean).join(" ");
      const result = classifyTeamByText(texto);
      
      // Só atualizar se a equipe sugerida for diferente da atual
      // Normalizamos para comparação e tratamos valores nulos
      const currentEquipe = os.equipe?.trim() || "";
      const newEquipe = result.equipe;

      if (currentEquipe !== newEquipe) {
        updates.push({
          id: os.id,
          equipe: newEquipe
        });
      }
    }

    // 3. Executar atualizações em lote (ou uma a uma se o lote for complexo)
    // Supabase JS client handles batching if an array of objects with IDs is provided for upsert, 
    // but for simple updates we'll loop to ensure RLS and triggers run correctly for each row.
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from("corretiva_os")
        .update({ equipe: update.equipe })
        .eq("id", update.id);
      
      if (!updateError) {
        updatedCount++;
      } else {
        console.error(`[AiReclassifier] Erro ao atualizar OS ${update.id}:`, updateError);
      }
    }

    return { 
      success: true, 
      count: updatedCount, 
      totalProcessed: osList.length 
    };
  });
