import { supabase } from "@/integrations/supabase/client";
import type { Equipe } from "@/lib/backorder/team-classifier";
import { classifyAmbiguousCorrectiveOrdersWithAi } from "@/lib/corretiva/designation-ai.functions";
import {
  analyzeCorrectiveOrder,
  type CorrectiveDesignationRow,
  type DesignationRunResult,
} from "@/lib/corretiva/designation-agent";
import { canonicalCorrectiveTeam } from "@/lib/corretiva/designation-engine";

type AiDecision = {
  equipe: Equipe | null;
  confianca: "alta" | "media" | "baixa";
  motivo: string;
};

type PlannedUpdate = {
  id: string;
  numeroOs: string;
  equipe: Equipe;
  source: "ai" | "technical";
};

const AI_BATCH_SIZE = 32;
const UPDATE_BATCH_SIZE = 100;

async function reviewAllWithExclusiveAi(rows: CorrectiveDesignationRow[]) {
  const decisions = new Map<string, AiDecision>();
  let available = false;

  for (let start = 0; start < rows.length; start += AI_BATCH_SIZE) {
    const batch = rows.slice(start, start + AI_BATCH_SIZE);
    const response = await classifyAmbiguousCorrectiveOrdersWithAi({
      data: {
        rows: batch.map((row) => ({
          id: row.id,
          numero_os: row.numero_os,
          nome_os: row.nome_os,
          equipamento: row.equipamento,
          ativo: row.ativo,
          local: row.local,
          predio: row.predio,
          andar: row.andar,
          solicitante: row.solicitante,
          equipe: row.equipe,
        })),
      },
    });

    available ||= response.available;
    for (const decision of response.decisions) {
      decisions.set(decision.id, {
        equipe: decision.equipe,
        confianca: decision.confianca,
        motivo: decision.motivo,
      });
    }
  }

  return { available, decisions };
}

function chooseFinalTeam(
  row: CorrectiveDesignationRow,
  aiDecision: AiDecision | undefined,
): { equipe: Equipe | null; source: "ai" | "technical" | "preserved"; needsReview: boolean } {
  const technical = analyzeCorrectiveOrder(row);
  const current = canonicalCorrectiveTeam(row.equipe);

  // Evidência técnica inequívoca vence qualquer leitura probabilística.
  // Isso impede erros como "mola hidráulica da porta" -> Hidráulica ou
  // "tomada no banheiro" -> Civil/Hidráulica. O objeto do serviço define a equipe.
  if (
    technical.hasSignal &&
    !technical.ambiguo &&
    technical.confianca === "alta"
  ) {
    return { equipe: technical.equipe, source: "technical", needsReview: false };
  }

  // A IA continua lendo todos os chamados, mas só decide quando o domínio
  // técnico local não encontrou uma evidência inequívoca.
  if (aiDecision?.equipe && aiDecision.confianca === "alta") {
    return { equipe: aiDecision.equipe, source: "ai", needsReview: false };
  }

  if (technical.hasSignal && !technical.ambiguo && technical.confianca !== "baixa") {
    return { equipe: technical.equipe, source: "technical", needsReview: false };
  }

  if (aiDecision?.equipe && aiDecision.confianca === "media") {
    return { equipe: aiDecision.equipe, source: "ai", needsReview: false };
  }

  if (technical.hasSignal) {
    return {
      equipe: technical.equipe,
      source: "technical",
      needsReview: technical.ambiguo || technical.confianca === "baixa",
    };
  }

  // Sem evidência suficiente, não inventa uma especialidade. Preserva o que já
  // existe e sinaliza para revisão humana quando não há equipe consolidada.
  return {
    equipe: current,
    source: "preserved",
    needsReview: true,
  };
}

/**
 * Agente exclusivo do botão "Designar" em Corretiva Novo.
 *
 * Diferente do fluxo anterior, TODOS os chamados abertos são lidos pelo agente
 * de IA em lotes. A descrição completa da OS (`nome_os`), equipamento, ativo e
 * contexto de localização são enviados sem truncamento. O classificador técnico
 * determinístico permanece como camada de segurança e fallback caso o gateway
 * de IA esteja temporariamente indisponível.
 */
export async function designateAllCorrectiveOrders(): Promise<DesignationRunResult> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.user) {
    throw new Error("Sessão autenticada indisponível para designar os chamados.");
  }

  const { data, error } = await supabase
    .from("corretiva_os")
    .select(
      "id, numero_os, nome_os, equipamento, ativo, equipe, local, predio, andar, solicitante, tipo, status",
    )
    .in("status", ["aberta", "em_andamento"])
    .or("tipo_importacao.is.null,tipo_importacao.neq.backorder_mensal")
    .order("data_criacao", { ascending: true });

  if (error) {
    console.error("[Designar/Exclusivo] Falha ao carregar chamados:", error);
    throw new Error("Falha ao buscar os chamados para designação.");
  }

  const rows = (data ?? []) as CorrectiveDesignationRow[];
  if (rows.length === 0) {
    return {
      success: true,
      count: 0,
      totalProcessed: 0,
      unchanged: 0,
      noSignal: 0,
      reviewNeeded: 0,
      lowConfidence: 0,
      failed: 0,
      aiReviewed: 0,
      aiReassigned: 0,
      aiAvailable: false,
    };
  }

  let aiAvailable = false;
  let aiDecisions = new Map<string, AiDecision>();

  try {
    const ai = await reviewAllWithExclusiveAi(rows);
    aiAvailable = ai.available;
    aiDecisions = ai.decisions;
  } catch (aiError) {
    console.warn(
      "[Designar/Exclusivo] IA indisponível; usando agente técnico local como fallback:",
      aiError,
    );
  }

  const updates: PlannedUpdate[] = [];
  let noSignal = 0;
  let lowConfidence = 0;
  let reviewNeeded = 0;
  let aiReassigned = 0;

  for (const row of rows) {
    const technical = analyzeCorrectiveOrder(row);
    if (!technical.hasSignal) noSignal++;
    if (technical.confianca === "baixa") lowConfidence++;

    const final = chooseFinalTeam(row, aiDecisions.get(row.id));
    if (final.needsReview) reviewNeeded++;
    if (!final.equipe) continue;

    const current = canonicalCorrectiveTeam(row.equipe);
    if (current === final.equipe) continue;

    updates.push({
      id: row.id,
      numeroOs: String(row.numero_os ?? "").trim(),
      equipe: final.equipe,
      source: final.source === "ai" ? "ai" : "technical",
    });
    if (final.source === "ai") aiReassigned++;
  }

  let updatedCount = 0;
  let failed = 0;

  const teams = new Map<Equipe, PlannedUpdate[]>();
  for (const update of updates) {
    const list = teams.get(update.equipe) ?? [];
    list.push(update);
    teams.set(update.equipe, list);
  }

  for (const [equipe, teamUpdates] of teams) {
    for (let start = 0; start < teamUpdates.length; start += UPDATE_BATCH_SIZE) {
      const batch = teamUpdates.slice(start, start + UPDATE_BATCH_SIZE);
      const ids = batch.map((item) => item.id);
      const { data: persisted, error: updateError } = await supabase
        .from("corretiva_os")
        .update({ equipe, updated_at: new Date().toISOString() } as any)
        .in("id", ids)
        .select("id");

      if (updateError) {
        failed += batch.length;
        console.error(
          `[Designar/Exclusivo] Falha ao gravar lote da equipe ${equipe}:`,
          updateError,
        );
        continue;
      }

      const persistedCount = persisted?.length ?? 0;
      updatedCount += persistedCount;
      failed += Math.max(0, batch.length - persistedCount);
    }
  }

  return {
    success: failed === 0,
    count: updatedCount,
    totalProcessed: rows.length,
    unchanged: rows.length - updates.length,
    noSignal,
    reviewNeeded,
    lowConfidence,
    failed,
    aiReviewed: aiAvailable ? aiDecisions.size : 0,
    aiReassigned,
    aiAvailable,
  };
}

export const reclassifyAllOsWithAi = designateAllCorrectiveOrders;
