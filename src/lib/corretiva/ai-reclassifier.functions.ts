import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  canonicalCorrectiveTeam,
  designateCorrectiveTeam,
} from "@/lib/corretiva/designation-engine";

type DesignationUpdate = {
  id: string;
  equipe: string;
};

/**
 * Reavalia todas as OS abertas usando o contexto operacional completo disponível.
 *
 * O motor cruza descrição, ativo, equipamento, localização e solicitante. Casos
 * sem sinal técnico ou com empate de baixa confiança são preservados para evitar
 * realocações arbitrárias; casos com evidência suficiente são atualizados.
 */
export const designateAllCorrectiveOrders = createServerFn({ method: "POST" }).handler(async () => {
  const { data: osList, error: fetchError } = await supabase
    .from("corretiva_os")
    .select(
      "id, numero_os, nome_os, equipamento, ativo, equipe, local, predio, andar, solicitante, tipo, status",
    )
    .neq("status", "concluida")
    .neq("tipo_importacao", "backorder_mensal");

  if (fetchError) {
    console.error("[Designar] Erro ao buscar OS:", fetchError);
    throw new Error("Falha ao buscar os chamados para designação.");
  }

  if (!osList?.length) {
    return {
      success: true,
      count: 0,
      totalProcessed: 0,
      unchanged: 0,
      noSignal: 0,
      reviewNeeded: 0,
      lowConfidence: 0,
      failed: 0,
    };
  }

  const updates: DesignationUpdate[] = [];
  let unchanged = 0;
  let noSignal = 0;
  let reviewNeeded = 0;
  let lowConfidence = 0;

  for (const os of osList) {
    const result = designateCorrectiveTeam({
      nome_os: os.nome_os,
      equipamento: os.equipamento,
      ativo: os.ativo,
      local: os.local,
      predio: os.predio,
      andar: os.andar,
      solicitante: os.solicitante,
      equipe: os.equipe,
    });

    const currentTeam = canonicalCorrectiveTeam(os.equipe);

    if (result.confianca === "baixa") lowConfidence++;

    if (!result.hasSignal) {
      noSignal++;
      unchanged++;
      continue;
    }

    if (result.ambiguo && result.confianca === "baixa" && currentTeam) {
      reviewNeeded++;
      unchanged++;
      continue;
    }

    if (currentTeam === result.equipe) {
      unchanged++;
      continue;
    }

    updates.push({ id: os.id, equipe: result.equipe });
  }

  let updatedCount = 0;
  let failed = 0;

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from("corretiva_os")
      .update({
        equipe: update.equipe,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", update.id);

    if (updateError) {
      failed++;
      console.error(`[Designar] Erro ao atualizar OS ${update.id}:`, updateError);
      continue;
    }

    updatedCount++;
  }

  return {
    success: failed === 0,
    count: updatedCount,
    totalProcessed: osList.length,
    unchanged,
    noSignal,
    reviewNeeded,
    lowConfidence,
    failed,
  };
});

/** Compatibilidade temporária para qualquer import antigo ainda existente. */
export const reclassifyAllOsWithAi = designateAllCorrectiveOrders;
