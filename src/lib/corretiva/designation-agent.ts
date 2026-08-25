import { supabase } from "@/integrations/supabase/client";
import {
  canonicalCorrectiveTeam,
  designateCorrectiveTeam,
  type CorrectiveDesignationInput,
  type CorrectiveDesignationResult,
} from "@/lib/corretiva/designation-engine";
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
      [equipe]: Math.max(base.scores[equipe], 50),
    },
    evidence: [evidence, ...base.evidence.filter((item) => item !== evidence)].slice(0, 6),
  };
}

/**
 * Agente dedicado à leitura semântica dos chamados de Corretiva.
 *
 * Ele reaproveita o motor contextual existente e aplica intenções operacionais
 * decisivas que não dependem de frases exatas. Isso cobre, por exemplo,
 * quantidades entre a ação e o objeto ("troca 2 chuveiro" / "cópia de 23 chaves")
 * sem transformar termos genéricos de local em sinal técnico.
 */
export function analyzeCorrectiveOrder(
  input: CorrectiveDesignationInput,
): CorrectiveDesignationResult {
  const base = designateCorrectiveTeam(input);
  const context = correctiveContext(input);

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

/**
 * Executa a designação usando a sessão autenticada do navegador.
 *
 * Esta rotina é deliberadamente client-side: o cliente Supabase do projeto
 * persiste a sessão no browser, enquanto uma server function sem propagação do
 * token perde o contexto de RLS e pode receber uma lista vazia sem erro.
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
    // .neq() ignora valores NULL no Postgres. As condições abaixo incluem
    // chamados legados/recém-importados que ainda não têm status/origem preenchidos.
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
    };
  }

  const plan = planCorrectiveDesignations(osList as CorrectiveDesignationRow[]);
  let updatedCount = 0;
  let failed = 0;

  for (const update of plan.updates) {
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
    totalProcessed: osList.length,
    unchanged: plan.unchanged,
    noSignal: plan.noSignal,
    reviewNeeded: plan.reviewNeeded,
    lowConfidence: plan.lowConfidence,
    failed,
  };
}

/** Compatibilidade com o nome anterior usado por integrações antigas. */
export const reclassifyAllOsWithAi = designateAllCorrectiveOrders;
