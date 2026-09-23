import { supabase } from "@/integrations/supabase/client";
import { EQUIPES, type Equipe } from "@/lib/backorder/team-classifier";

export type CorrectiveAiReviewRow = {
  id: string;
  numero_os?: string | null;
  nome_os?: string | null;
  equipamento?: string | null;
  ativo?: string | null;
  local?: string | null;
  predio?: string | null;
  andar?: string | null;
  solicitante?: string | null;
  equipe?: string | null;
};

export type CorrectiveAiDecision = {
  id: string;
  equipe: Equipe | null;
  confianca: "alta" | "media" | "baixa";
  motivo: string;
};

type CorrectiveAiProvider = "openrouter-free" | "lovable-gateway" | "none";
type InvokeInput = { data: { rows: CorrectiveAiReviewRow[] } };

const ALLOWED_TEAMS = new Set<string>(EQUIPES);
const MAX_BATCH = 40;

function cleanText(value: unknown, max = 2200) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function validateRows(rows: unknown): CorrectiveAiReviewRow[] {
  if (!Array.isArray(rows)) throw new Error("Lista de chamados inválida.");
  if (rows.length > MAX_BATCH) throw new Error(`O agente aceita no máximo ${MAX_BATCH} chamados por lote.`);

  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    .map((row) => ({
      id: cleanText(row.id, 180),
      numero_os: cleanText(row.numero_os, 120) || null,
      nome_os: cleanText(row.nome_os, 2200) || null,
      equipamento: cleanText(row.equipamento, 500) || null,
      ativo: cleanText(row.ativo, 300) || null,
      local: cleanText(row.local, 350) || null,
      predio: cleanText(row.predio, 200) || null,
      andar: cleanText(row.andar, 120) || null,
      solicitante: cleanText(row.solicitante, 240) || null,
      equipe: cleanText(row.equipe, 120) || null,
    }))
    .filter((row) => row.id && row.nome_os);
}

function sanitizeDecisions(value: unknown): {
  available: boolean;
  provider: CorrectiveAiProvider;
  decisions: CorrectiveAiDecision[];
} {
  if (!value || typeof value !== "object") {
    return { available: false, provider: "none", decisions: [] };
  }

  const raw = value as Record<string, unknown>;
  const provider: CorrectiveAiProvider =
    raw.provider === "openrouter-free" || raw.provider === "lovable-gateway"
      ? raw.provider
      : "none";
  const decisions: CorrectiveAiDecision[] = [];

  if (Array.isArray(raw.decisions)) {
    for (const item of raw.decisions) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const id = cleanText(row.id, 180);
      if (!id) continue;
      const rawTeam = cleanText(row.equipe, 80);
      const equipe = ALLOWED_TEAMS.has(rawTeam) ? (rawTeam as Equipe) : null;
      const rawConfidence = cleanText(row.confianca, 20).toLowerCase();
      const confianca: CorrectiveAiDecision["confianca"] =
        rawConfidence === "alta"
          ? "alta"
          : rawConfidence === "media" || rawConfidence === "média"
            ? "media"
            : "baixa";
      decisions.push({
        id,
        equipe,
        confianca,
        motivo: cleanText(row.motivo || "Leitura contextual do agente de IA.", 240),
      });
    }
  }

  return {
    available: Boolean(raw.available) && decisions.length > 0,
    provider,
    decisions,
  };
}

export async function classifyAmbiguousCorrectiveOrdersWithAi({ data }: InvokeInput) {
  const rows = validateRows(data?.rows);
  if (!rows.length) {
    return {
      available: true,
      provider: "openrouter-free" as CorrectiveAiProvider,
      decisions: [] as CorrectiveAiDecision[],
    };
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    return {
      available: false,
      provider: "none" as CorrectiveAiProvider,
      decisions: [] as CorrectiveAiDecision[],
    };
  }

  const { data: response, error } = await supabase.functions.invoke("maintenance-team-classifier", {
    body: {
      rows: rows.map((row) => ({
        id: row.id,
        numero_os: row.numero_os,
        nome_os: row.nome_os,
        equipamento: row.equipamento,
        ativo: row.ativo,
        local: row.local,
        predio: row.predio,
        andar: row.andar,
        solicitante: row.solicitante,
        equipe_atual: row.equipe,
      })),
    },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    console.warn("[Designar/IA] Edge Function indisponível:", error);
    return {
      available: false,
      provider: "none" as CorrectiveAiProvider,
      decisions: [] as CorrectiveAiDecision[],
    };
  }

  return sanitizeDecisions(response);
}
