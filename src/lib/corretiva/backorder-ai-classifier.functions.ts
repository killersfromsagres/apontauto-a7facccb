import { supabase } from "@/integrations/supabase/client";
import type { Equipe } from "@/lib/backorder/team-classifier";

export type BackorderAiProvider = "openrouter-free" | "lovable-gateway" | "none";
export type BackorderAiConfidence = "alta" | "media" | "baixa";

export type BackorderAiReviewRow = {
  id: string;
  numeroOs: string;
  descricao: string;
  equipamento?: string | null;
  ativo?: string | null;
  predio?: string | null;
  andar?: string | null;
  local?: string | null;
  equipeOriginal?: string | null;
  equipeTecnica?: string | null;
  confiancaTecnica?: string | null;
  ambiguoTecnico?: boolean;
};

export type BackorderAiDecision = {
  id: string;
  equipe: Equipe | null;
  confianca: BackorderAiConfidence;
  motivo: string;
};

export type BackorderAiReviewResponse = {
  available: boolean;
  provider: BackorderAiProvider;
  decisions: BackorderAiDecision[];
  error?: string;
};

type InvokeInput = { data: { rows: BackorderAiReviewRow[] } };

const ALLOWED_TEAMS = new Set<Equipe>([
  "Elétrica",
  "Hidráulica",
  "Civil",
  "Chaveiro",
  "Pintura",
  "Refrigeração",
  "Limpeza",
]);
const MAX_BATCH = 30;

function cleanText(value: unknown, max = 2200) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function validateRows(rows: unknown): BackorderAiReviewRow[] {
  if (!Array.isArray(rows)) throw new Error("Lista de Backorders inválida.");
  if (rows.length > MAX_BATCH) throw new Error(`Envie no máximo ${MAX_BATCH} chamados por lote.`);

  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    .map((row) => ({
      id: cleanText(row.id, 180),
      numeroOs: cleanText(row.numeroOs, 120),
      descricao: cleanText(row.descricao, 2200),
      equipamento: cleanText(row.equipamento, 500) || null,
      ativo: cleanText(row.ativo, 300) || null,
      predio: cleanText(row.predio, 200) || null,
      andar: cleanText(row.andar, 120) || null,
      local: cleanText(row.local, 350) || null,
      equipeOriginal: cleanText(row.equipeOriginal, 120) || null,
      equipeTecnica: cleanText(row.equipeTecnica, 120) || null,
      confiancaTecnica: cleanText(row.confiancaTecnica, 40) || null,
      ambiguoTecnico: Boolean(row.ambiguoTecnico),
    }))
    .filter((row) => row.id && row.descricao);
}

function sanitizeResponse(value: unknown): BackorderAiReviewResponse {
  if (!value || typeof value !== "object") {
    return { available: false, provider: "none", decisions: [], error: "Resposta inválida do classificador de IA." };
  }

  const raw = value as Record<string, unknown>;
  const provider: BackorderAiProvider =
    raw.provider === "openrouter-free" || raw.provider === "lovable-gateway"
      ? raw.provider
      : "none";
  const decisions: BackorderAiDecision[] = [];

  if (Array.isArray(raw.decisions)) {
    for (const item of raw.decisions) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const id = cleanText(row.id, 180);
      if (!id) continue;
      const rawTeam = cleanText(row.equipe, 80) as Equipe;
      const equipe = ALLOWED_TEAMS.has(rawTeam) ? rawTeam : null;
      const rawConfidence = cleanText(row.confianca, 20).toLowerCase();
      const confianca: BackorderAiConfidence =
        rawConfidence === "alta"
          ? "alta"
          : rawConfidence === "media" || rawConfidence === "média"
            ? "media"
            : "baixa";
      decisions.push({
        id,
        equipe,
        confianca,
        motivo: cleanText(row.motivo || "Leitura contextual do chamado.", 220),
      });
    }
  }

  return {
    available: Boolean(raw.available) && decisions.length > 0,
    provider,
    decisions,
    error: cleanText(raw.error, 320) || undefined,
  };
}

export async function classifyBackorderTeamsWithAi({ data }: InvokeInput): Promise<BackorderAiReviewResponse> {
  const rows = validateRows(data?.rows);
  if (!rows.length) return { available: true, provider: "openrouter-free", decisions: [] };

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    return {
      available: false,
      provider: "none",
      decisions: [],
      error: "Sessão autenticada indisponível para consultar a IA.",
    };
  }

  const { data: response, error } = await supabase.functions.invoke("maintenance-team-classifier", {
    body: { rows },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    console.warn("[Backorder/IA] Edge Function indisponível:", error);
    return {
      available: false,
      provider: "none",
      decisions: [],
      error: error.message || "Falha ao consultar o classificador de IA.",
    };
  }

  return sanitizeResponse(response);
}
