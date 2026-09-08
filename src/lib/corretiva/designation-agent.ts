import { supabase } from "@/integrations/supabase/client";
import {
  canonicalCorrectiveTeam,
  designateCorrectiveTeam,
  type CorrectiveDesignationInput,
  type CorrectiveDesignationResult,
} from "@/lib/corretiva/designation-engine";
import { analyzeCorrectiveTechnicalDomain } from "@/lib/corretiva/technical-domain-agent";
import { classifyAmbiguousCorrectiveOrdersWithAi } from "@/lib/corretiva/designation-ai.functions";
import type { Equipe } from "@/lib/backorder/team-classifier";

export type CorrectiveDesignationRow = CorrectiveDesignationInput & {
  id: string;
  numero_os?: string | null;
  tipo?: string | null;
  status?: string | null;
};

type DesignationUpdate = {
  id: string;
  numero_os?: string | null;
  equipe: Equipe;
  source?: "technical" | "ai";
};

export type CorrectiveDesignationPlan = {
  updates: DesignationUpdate[];
  unchanged: number;
  noSignal: number;
  reviewNeeded: number;
  lowConfidence: number;
};

export type DesignationRunResult = {
  success: boolean;
  count: number;
  totalProcessed: number;
  unchanged: number;
  noSignal: number;
  reviewNeeded: number;
  lowConfidence: number;
  failed: number;
  aiReviewed: number;
  aiReassigned: number;
  aiAvailable: boolean;
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const SHOWER_HYDRAULIC_CONTEXT =
  /\bchuveiros?\b(?:\s+[a-z0-9]+){0,5}\s+(vazando|pingando|vazamento|registro|canopla|manopla)\b|\b(vazamento|vazando|pingando|registro|canopla|manopla)(?:\s+[a-z0-9]+){0,5}\s+chuveiros?\b/;
const SHOWER_REPLACEMENT =
  /\b(troca|trocar|substituir|substituicao|instalar|instalacao)(?:\s+[a-z0-9]+){0,5}\s+chuveiros?\b/;
const SHOWER_ELECTRICAL_CONTEXT =
  /\bchuveiros?\b(?:\s+[a-z0-9]+){0,4}\s+(eletrico|queimado|resistencia|nao aquece|sem aquecer|frio)\b/;
const KEY_COPY_REQUEST =
  /\b(copia|copiar|duplicar|duplicacao|confeccao|confeccionar|fazer)(?:\s+[a-z0-9]+){0,6}\s+chaves?\b/;
const LOCK_HARDWARE = /\b(miolos?|fechaduras?|cilindros?|cadeados?|trincos?|linguetas?)\b/;
const ELECTRICAL_WIRING_REQUEST =
  /\b(organizar|organizacao|arrumar|adequar|adequacao|instalar|instalacao|trocar|substituir|reparar|reparo)(?:\s+[a-z0-9]+){0,7}\s+(fios?|cabos?|fiacao|cabeamento)\b|\b(fios?|cabos?|fiacao|cabeamento)(?:\s+[a-z0-9]+){0,7}\s+(energia|eletric[oa]s?|tomadas?|computadores?|impressoras?)\b/;

function correctiveContext(input: CorrectiveDesignationInput) {
  return normalize(
    [
      input.nome_os,
      input.equipamento,
      input.ativo,
      input.local,
      input.predio,
      input.andar,
      input.solicitante,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function withDecisiveEvidence(
  base: CorrectiveDesignationResult,
  equipe: Equipe,
  evidence: string,
): CorrectiveDesignationResult {
  return {
    ...base,
    equipe,
    confianca: "alta",
    ambiguo: false,
    hasSignal: true,
    preservedCurrent: false,
    scores: {
      ...base.scores,
      [equipe]: Math.max(base.scores[equipe], 100),
    },
    evidence: [evidence, ...base.evidence.filter((item) => item !== evidence)].slice(0, 10),
  };
}

/**
 * Agente dedicado à leitura semântica dos chamados de Corretiva.
 *
 * Pipeline:
 *  1. lê descrição, equipamento e ativo com prioridade;
 *  2. usa local/prédio/andar apenas como contexto;
 *  3. detecta o domínio técnico (Elétrica, Hidráulica, Refrigeração etc.);
 *  4. aplica intenções especiais (chuveiro, cópia de chaves, fiação/cabos);
 *  5. só preserva a equipe antiga quando não existe evidência decisiva.
 *
 * Isso impede Civil de absorver iluminação, tomadas, mictórios, privadas,
 * desentupimentos, descargas e demais corretivas técnicas claramente definidas.
 */
export function analyzeCorrectiveOrder(
  input: CorrectiveDesignationInput,
): CorrectiveDesignationResult {
  const base = designateCorrectiveTeam(input);
  const context = correctiveContext(input);
  const technical = analyzeCorrectiveTechnicalDomain(input);

  if (SHOWER_HYDRAULIC_CONTEXT.test(context)) {
    return withDecisiveEvidence(
      base,
      "Hidráulica",
      "agente: chuveiro com evidência hidráulica",
    );
  }

  if (SHOWER_REPLACEMENT.test(context) || SHOWER_ELECTRICAL_CONTEXT.test(context)) {
    return withDecisiveEvidence(
      base,
      "Elétrica",
      "agente: troca ou falha elétrica de chuveiro",
    );
  }

  if (KEY_COPY_REQUEST.test(context) || LOCK_HARDWARE.test(context)) {
    return withDecisiveEvidence(
      base,
      "Chaveiro",
      "agente: cópia de chave ou componente de fechadura",
    );
  }

  if (ELECTRICAL_WIRING_REQUEST.test(context)) {
    return withDecisiveEvidence(
      base,
      "Elétrica",
      "agente: organização/adequação de fios ou cabeamento",
    );
  }

  if (technical.decisive && technical.equipe) {
    return withDecisiveEvidence(
      base,
      technical.equipe,
      technical.evidence[0] ?? `agente técnico: domínio ${technical.equipe} identificado`,
    );
  }

  return base;
}

export function planCorrectiveDesignations(
  osList: CorrectiveDesignationRow[],
): CorrectiveDesignationPlan {
  const updates: DesignationUpdate[] = [];
  let unchanged = 0;
  let noSignal = 0;
  let reviewNeeded = 0;
  let lowConfidence = 0;

  for (const os of osList) {
    const result = analyzeCorrectiveOrder(os);
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

    updates.push({
      id: os.id,
      numero_os: os.numero_os,
      equipe: result.equipe,
      source: "technical",
    });
  }

  return {
    updates,
    unchanged,
    noSignal,
    reviewNeeded,
    lowConfidence,
  };
}

function needsAiReview(result: CorrectiveDesignationResult) {
  return !result.hasSignal || result.ambiguo || result.confianca === "baixa";
}

async function getAiDecisions(candidates: CorrectiveDesignationRow[]) {
  const decisions = new Map<
    string,
    { equipe: Equipe | null; confianca: "alta" | "media" | "baixa"; motivo: string }
  >();
  let available = false;

  for (let start = 0; start < candidates.length; start += 40) {
    const batch = candidates.slice(start, start + 40);
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

/**
 * Executa a designação usando a sessão autenticada do navegador.
 *
 * Arquitetura híbrida:
 * - casos técnicos claros são decididos localmente, de forma determinística;
 * - casos ambíguos/baixa confiança recebem uma segunda leitura por IA;
 * - a IA nunca grava no banco: a persistência continua no cliente autenticado,
 *   respeitando RLS e mantendo a equipe atual quando a IA também tiver dúvida.
 */
export async function designateAllCorrectiveOrders(): Promise<DesignationRunResult> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.user) {
    console.error("[Designar] Sessão autenticada indisponível:", sessionError);
    throw new Error("Sessão autenticada indisponível para designar os chamados.");
  }

  const { data: osList, error: fetchError } = await supabase
    .from("corretiva_os")
    .select(
      "id, numero_os, nome_os, equipamento, ativo, equipe, local, predio, andar, solicitante, tipo, status",
    )
    .or("status.is.null,status.neq.concluida")
    .or("tipo_importacao.is.null,tipo_importacao.neq.backorder_mensal");

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
      aiReviewed: 0,
      aiReassigned: 0,
      aiAvailable: false,
    };
  }

  const rows = osList as CorrectiveDesignationRow[];
  const updates = new Map<string, DesignationUpdate>();
  const aiCandidates: CorrectiveDesignationRow[] = [];
  let noSignal = 0;
  let lowConfidence = 0;

  for (const os of rows) {
    const result = analyzeCorrectiveOrder(os);

    if (!result.hasSignal) noSignal++;
    if (result.confianca === "baixa") lowConfidence++;

    if (needsAiReview(result)) {
      aiCandidates.push(os);
      continue;
    }

    const currentTeam = canonicalCorrectiveTeam(os.equipe);
    if (currentTeam !== result.equipe) {
      updates.set(os.id, {
        id: os.id,
        numero_os: os.numero_os,
        equipe: result.equipe,
        source: "technical",
      });
    }
  }

  let aiAvailable = false;
  let aiReassigned = 0;
  let reviewNeeded = 0;

  if (aiCandidates.length > 0) {
    try {
      const ai = await getAiDecisions(aiCandidates);
      aiAvailable = ai.available;

      for (const os of aiCandidates) {
        const decision = ai.decisions.get(os.id);
        const currentTeam = canonicalCorrectiveTeam(os.equipe);

        if (decision?.equipe && decision.confianca !== "baixa") {
          if (currentTeam !== decision.equipe) {
            updates.set(os.id, {
              id: os.id,
              numero_os: os.numero_os,
              equipe: decision.equipe,
              source: "ai",
            });
            aiReassigned++;
          }
          continue;
        }

        reviewNeeded++;
      }
    } catch (error) {
      console.warn("[Designar] IA indisponível; preservando casos ambíguos:", error);
      reviewNeeded = aiCandidates.length;
    }
  }

  let updatedCount = 0;
  let failed = 0;

  for (const update of updates.values()) {
    const { data: persistedRow, error: updateError } = await supabase
      .from("corretiva_os")
      .update({
        equipe: update.equipe,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", update.id)
      .select("id")
      .maybeSingle();

    if (updateError || !persistedRow) {
      failed++;
      console.error(
        `[Designar] Falha ao persistir OS ${update.numero_os ?? update.id}:`,
        updateError ?? "nenhuma linha atualizada (verifique RLS)",
      );
      continue;
    }

    updatedCount++;
  }

  return {
    success: failed === 0,
    count: updatedCount,
    totalProcessed: rows.length,
    unchanged: rows.length - updates.size,
    noSignal,
    reviewNeeded,
    lowConfidence,
    failed,
    aiReviewed: aiCandidates.length,
    aiReassigned,
    aiAvailable,
  };
}

/** Compatibilidade com o nome anterior usado por integrações antigas. */
export const reclassifyAllOsWithAi = designateAllCorrectiveOrders;
