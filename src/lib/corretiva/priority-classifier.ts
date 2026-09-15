/**
 * Classificador determinístico de prioridade de chamados corretivos.
 *
 * Não depende de IA, API externa ou rede: recebe a linha bruta de `corretiva_os`
 * (ou do cache local) e devolve nível, score e motivos curtos. É reexecutado
 * sempre que a base é recarregada/importada.
 */

export type PriorityLevel = "CRÍTICA" | "ALTA" | "MÉDIA" | "NORMAL";

export interface PriorityInput {
  id?: string | null;
  numero_os?: string | null;
  nome_os?: string | null;
  descricao?: string | null;
  local?: string | null;
  andar?: string | null;
  predio?: string | null;
  equipe?: string | null;
  status?: string | null;
  data_criacao?: string | null;
  data_sla?: string | null;
  data_programada?: string | null;
  material_status?: string | null;
  corretiva_problemas?:
    | Array<{ gravidade?: string | null; status_gestor?: string | null } | null>
    | null;
}

export interface PriorityResult {
  level: PriorityLevel;
  score: number;
  reasons: string[];
}

export const PRIORITY_ORDER: Record<PriorityLevel, number> = {
  CRÍTICA: 0,
  ALTA: 1,
  MÉDIA: 2,
  NORMAL: 3,
};

export const PRIORITY_HEX: Record<
  PriorityLevel,
  { bg: string; fg: string }
> = {
  CRÍTICA: { bg: "#DC2626", fg: "#FFFFFF" },
  ALTA: { bg: "#F97316", fg: "#1F2937" },
  MÉDIA: { bg: "#FDE047", fg: "#1F2937" },
  NORMAL: { bg: "#F1F5F9", fg: "#334155" },
};

/** Remove acentos, normaliza espaços e força caixa alta. */
export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

interface Rule {
  key: string;
  /** Termos que disparam a regra (já normalizados, sem acento). */
  terms: string[];
  /** Termos que, se presentes, cancelam a regra (evita falso positivo). */
  unless?: string[];
  points: number;
  reason: string;
}

const RULES: Rule[] = [
  {
    key: "alagamento",
    terms: ["INUNDAC", "ALAGAMENTO", "ALAGADO", "ALAGANDO", "TRANSBORD"],
    points: 46,
    reason: "Alagamento/inundação",
  },
  {
    key: "vazamento",
    terms: ["VAZAMENTO", "VAZANDO", "VAZA ", "GOTEIRA", "INFILTRAC"],
    unless: ["SEM VAZAMENTO", "NAO HA VAZAMENTO", "VERIFICAR SE HA VAZAMENTO"],
    points: 34,
    reason: "Vazamento de água",
  },
  {
    key: "falta-agua",
    terms: [
      "FALTA DE AGUA",
      "SEM AGUA",
      "FALTA AGUA",
      "AGUA NAO CHEGA",
      "SEM ABASTECIMENTO",
    ],
    points: 34,
    reason: "Falta de água",
  },
  {
    key: "esgoto",
    terms: [
      "ESGOTO",
      "ENTUPI",
      "ENTUPID",
      "OBSTRU",
      "REFLUXO",
      "MAU CHEIRO",
      "FOSSA",
    ],
    points: 32,
    reason: "Esgoto/entupimento",
  },
  {
    key: "sanitario",
    terms: [
      "BANHEIRO",
      "SANITARIO",
      "VASO SANITARIO",
      "VALVULA DE DESCARGA",
      "DESCARGA",
      "MICTORIO",
      "TORNEIRA",
      "LAVATORIO",
      "CHUVEIRO",
      "PIA ",
    ],
    points: 18,
    reason: "Área sanitária afetada",
  },
  {
    key: "alimentacao",
    terms: ["COZINHA", "REFEITORIO", "RESTAURANTE", "COPA", "CAMARA FRIA"],
    points: 18,
    reason: "Área de alimentação",
  },
  {
    key: "risco-eletrico",
    terms: [
      "CURTO CIRCUITO",
      "CURTO",
      "CHOQUE",
      "FAISCA",
      "FAISCANDO",
      "FUMACA",
      "QUEIMADO",
      "QUEIMANDO",
      "CHEIRO DE QUEIMADO",
      "SUPERAQUEC",
      "PRINCIPIO DE INCENDIO",
      "FOGO",
    ],
    points: 50,
    reason: "Risco elétrico/incêndio",
  },
  {
    key: "energia",
    terms: [
      "SEM ENERGIA",
      "FALTA DE ENERGIA",
      "QUEDA DE ENERGIA",
      "DISJUNTOR DESARM",
      "PAINEL DESLIG",
    ],
    points: 26,
    reason: "Interrupção de energia",
  },
  {
    key: "acesso",
    terms: [
      "FECHADURA",
      "PORTA TRAVADA",
      "PORTA NAO ABRE",
      "PORTA NAO FECHA",
      "CATRACA",
      "PORTAO",
      "CONTROLE DE ACESSO",
      "CHAVE QUEBRADA",
    ],
    points: 22,
    reason: "Acesso comprometido",
  },
  {
    key: "seguranca",
    terms: [
      "EMERGENCIA",
      "URGENTE",
      "URGENCIA",
      "RISCO",
      "ACIDENTE",
      "QUEDA DE ",
      "DESABAMENTO",
      "INTERDIC",
      "INTERDITAD",
      "ISOLAR AREA",
      "AREA ISOLADA",
      "SAIDA DE EMERGENCIA",
      "EXTINTOR",
      "HIDRANTE",
    ],
    points: 40,
    reason: "Segurança/emergência",
  },
  {
    key: "parada",
    terms: [
      "PARADO",
      "PAROU DE FUNCIONAR",
      "NAO FUNCIONA",
      "INOPERANTE",
      "FORA DE OPERACAO",
      "PRODUCAO PARADA",
      "LINHA PARADA",
    ],
    points: 20,
    reason: "Equipamento/área parada",
  },
  {
    key: "elevador",
    terms: ["ELEVADOR", "PESSOA PRESA", "PRESO NO"],
    points: 30,
    reason: "Elevador/pessoa presa",
  },
];

function severityFromProblems(input: PriorityInput): {
  points: number;
  reason?: string;
} {
  const problems = (input.corretiva_problemas ?? []).filter(Boolean) as Array<{
    gravidade?: string | null;
    status_gestor?: string | null;
  }>;
  let points = 0;
  let reason: string | undefined;
  for (const problem of problems) {
    const manager = normalizeText(problem.status_gestor);
    if (
      manager.includes("REJEIT") ||
      manager.includes("CONCLUID") ||
      manager.includes("FECHAD") ||
      manager.includes("ENCERRAD")
    ) {
      continue;
    }
    const severity = normalizeText(problem.gravidade);
    if (severity.includes("CRITIC") && points < 45) {
      points = 45;
      reason = "Gravidade crítica registrada";
    } else if (severity.includes("FALHA") && points < 22) {
      points = 22;
      reason = "Falha registrada pelo gestor";
    }
  }
  return { points, reason };
}

function parseDate(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const onlyDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (onlyDate) {
    return new Date(
      Number(onlyDate[1]),
      Number(onlyDate[2]) - 1,
      Number(onlyDate[3]),
      12,
    );
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const DAY_MS = 86_400_000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Classifica um chamado. `referenceDate` permite testes determinísticos.
 */
export function classifyPriority(
  input: PriorityInput,
  referenceDate: Date = new Date(),
): PriorityResult {
  const haystack = normalizeText(
    [
      input.nome_os,
      input.descricao,
      input.local,
      input.andar,
      input.predio,
      input.equipe,
    ]
      .filter(Boolean)
      .join(" "),
  );

  const reasons: string[] = [];
  let score = 0;

  for (const rule of RULES) {
    if (rule.unless?.some((term) => haystack.includes(term))) continue;
    if (!rule.terms.some((term) => haystack.includes(term))) continue;
    score += rule.points;
    reasons.push(rule.reason);
  }

  // Combinação de contexto: água + ambiente sensível agrava.
  const hasWater = reasons.includes("Vazamento de água") ||
    reasons.includes("Alagamento/inundação") ||
    reasons.includes("Esgoto/entupimento");
  const sensitiveArea =
    reasons.includes("Área sanitária afetada") ||
    reasons.includes("Área de alimentação");
  if (hasWater && sensitiveArea) {
    score += 14;
    reasons.push("Água em ambiente sensível");
  }
  if (hasWater && reasons.includes("Risco elétrico/incêndio")) {
    score += 18;
    reasons.push("Água próxima de instalação elétrica");
  }

  const severity = severityFromProblems(input);
  if (severity.points > 0) {
    score += severity.points;
    if (severity.reason) reasons.push(severity.reason);
  }

  const reference = startOfDay(referenceDate);
  const due = parseDate(input.data_sla) ?? parseDate(input.data_programada);
  if (due) {
    const diffDays = Math.round(
      (startOfDay(due).getTime() - reference.getTime()) / DAY_MS,
    );
    if (diffDays < 0) {
      score += Math.min(40, 20 + Math.abs(diffDays));
      reasons.push(`SLA vencido há ${Math.abs(diffDays)} dia(s)`);
    } else if (diffDays <= 2) {
      score += 16;
      reasons.push("SLA vence em até 2 dias");
    } else if (diffDays <= 7) {
      score += 8;
      reasons.push("SLA vence nesta semana");
    }
  }

  const created = parseDate(input.data_criacao);
  if (created) {
    const ageDays = Math.max(
      0,
      Math.round((reference.getTime() - startOfDay(created).getTime()) / DAY_MS),
    );
    if (ageDays >= 60) {
      score += 16;
      reasons.push(`Aberto há ${ageDays} dias`);
    } else if (ageDays >= 30) {
      score += 10;
      reasons.push(`Aberto há ${ageDays} dias`);
    } else if (ageDays >= 15) {
      score += 5;
      reasons.push(`Aberto há ${ageDays} dias`);
    }
  }

  if (normalizeText(input.material_status) === "SOLICITADO") {
    score += 4;
    reasons.push("Aguardando material");
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  const level: PriorityLevel =
    bounded >= 62
      ? "CRÍTICA"
      : bounded >= 38
        ? "ALTA"
        : bounded >= 18
          ? "MÉDIA"
          : "NORMAL";

  return {
    level,
    score: bounded,
    reasons: reasons.length > 0 ? reasons.slice(0, 5) : ["Sem agravantes identificados"],
  };
}

export function isHighPriority(level: PriorityLevel): boolean {
  return level === "CRÍTICA" || level === "ALTA";
}

/** Compara dois chamados pela prioridade (maior primeiro). */
export function comparePriority(a: PriorityResult, b: PriorityResult): number {
  return (
    PRIORITY_ORDER[a.level] - PRIORITY_ORDER[b.level] || b.score - a.score
  );
}
