/**
 * Classificação determinística de prioridade para chamados corretivos.
 * Não usa IA externa: recalcula a partir dos dados atuais da OS.
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
  ALTA: { bg: "#F97316", fg: "#111827" },
  MÉDIA: { bg: "#FDE047", fg: "#111827" },
  NORMAL: { bg: "#F1F5F9", fg: "#334155" },
};

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

type Rule = {
  terms: string[];
  points: number;
  reason: string;
  unless?: string[];
};

const RULES: Rule[] = [
  {
    terms: ["CURTO CIRCUITO", "CHOQUE", "FAISCA", "FUMACA", "CHEIRO DE QUEIMADO", "PRINCIPIO DE INCENDIO", "FOGO", "SUPERAQUEC"],
    points: 66,
    reason: "Risco elétrico/incêndio",
  },
  {
    terms: ["INUNDAC", "ALAGAMENTO", "ALAGADO", "ALAGANDO", "TRANSBORD"],
    points: 56,
    reason: "Alagamento/inundação",
  },
  {
    terms: ["EMERGENCIA", "URGENTE", "URGENCIA", "DESABAMENTO", "INTERDIC", "INTERDITAD", "ISOLAR AREA", "SAIDA DE EMERGENCIA", "HIDRANTE"],
    points: 44,
    reason: "Segurança/emergência",
  },
  {
    terms: ["VAZAMENTO", "VAZANDO", "GOTEIRA", "INFILTRAC"],
    unless: ["SEM VAZAMENTO", "NAO HA VAZAMENTO", "VERIFICAR SE HA VAZAMENTO"],
    points: 34,
    reason: "Vazamento de água",
  },
  {
    terms: ["FALTA DE AGUA", "SEM AGUA", "FALTA AGUA", "SEM ABASTECIMENTO"],
    points: 36,
    reason: "Falta de água",
  },
  {
    terms: ["ESGOTO", "ENTUPI", "OBSTRU", "REFLUXO", "FOSSA"],
    points: 34,
    reason: "Esgoto/entupimento",
  },
  {
    terms: ["SEM ENERGIA", "FALTA DE ENERGIA", "QUEDA DE ENERGIA", "DISJUNTOR DESARM", "PAINEL DESLIG"],
    points: 32,
    reason: "Interrupção de energia",
  },
  {
    terms: ["PESSOA PRESA", "PRESO NO ELEVADOR", "ELEVADOR PARADO"],
    points: 46,
    reason: "Elevador/pessoa presa",
  },
  {
    terms: ["BANHEIRO", "SANITARIO", "VASO SANITARIO", "VALVULA DE DESCARGA", "DESCARGA", "MICTORIO", "TORNEIRA", "LAVATORIO", "CHUVEIRO"],
    points: 18,
    reason: "Área sanitária afetada",
  },
  {
    terms: ["COZINHA", "REFEITORIO", "RESTAURANTE", "COPA", "CAMARA FRIA"],
    points: 18,
    reason: "Área de alimentação",
  },
  {
    terms: ["FECHADURA", "PORTA TRAVADA", "PORTA NAO ABRE", "PORTA NAO FECHA", "CATRACA", "PORTAO", "CONTROLE DE ACESSO", "CHAVE QUEBRADA"],
    points: 22,
    reason: "Acesso comprometido",
  },
  {
    terms: ["PARADO", "PAROU DE FUNCIONAR", "NAO FUNCIONA", "INOPERANTE", "FORA DE OPERACAO", "PRODUCAO PARADA", "LINHA PARADA"],
    points: 20,
    reason: "Equipamento/área parada",
  },
];

function parseDate(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match)
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function managerSeverity(input: PriorityInput) {
  let points = 0;
  let reason = "";
  for (const item of input.corretiva_problemas ?? []) {
    if (!item) continue;
    const status = normalizeText(item.status_gestor);
    if (["REJEIT", "CONCLUID", "FECHAD", "ENCERRAD"].some((x) => status.includes(x)))
      continue;
    const severity = normalizeText(item.gravidade);
    if (severity.includes("CRITIC") && points < 48) {
      points = 48;
      reason = "Gravidade crítica registrada";
    } else if (severity.includes("FALHA") && points < 22) {
      points = 22;
      reason = "Falha registrada pelo gestor";
    }
  }
  return { points, reason };
}

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
    addReason(reasons, rule.reason);
  }

  const hasWater = ["Vazamento de água", "Alagamento/inundação", "Esgoto/entupimento"].some((r) => reasons.includes(r));
  const sensitiveArea = ["Área sanitária afetada", "Área de alimentação"].some((r) => reasons.includes(r));
  if (hasWater && sensitiveArea) {
    score += 14;
    addReason(reasons, "Água em ambiente sensível");
  }
  if (hasWater && reasons.includes("Risco elétrico/incêndio")) {
    score += 20;
    addReason(reasons, "Água próxima de instalação elétrica");
  }

  const severity = managerSeverity(input);
  score += severity.points;
  if (severity.reason) addReason(reasons, severity.reason);

  const reference = startOfDay(referenceDate);
  const due = parseDate(input.data_sla) ?? parseDate(input.data_programada);
  if (due) {
    const days = Math.round((startOfDay(due).getTime() - reference.getTime()) / 86_400_000);
    if (days < 0) {
      score += Math.min(40, 20 + Math.abs(days));
      addReason(reasons, `SLA vencido há ${Math.abs(days)} dia(s)`);
    } else if (days <= 2) {
      score += 16;
      addReason(reasons, "SLA vence em até 2 dias");
    } else if (days <= 7) {
      score += 8;
      addReason(reasons, "SLA vence nesta semana");
    }
  }

  const created = parseDate(input.data_criacao);
  if (created) {
    const age = Math.max(
      0,
      Math.floor((reference.getTime() - startOfDay(created).getTime()) / 86_400_000),
    );
    if (age >= 60) {
      score += 16;
      addReason(reasons, `Aberto há ${age} dias`);
    } else if (age >= 30) {
      score += 10;
      addReason(reasons, `Aberto há ${age} dias`);
    } else if (age >= 15) {
      score += 5;
      addReason(reasons, `Aberto há ${age} dias`);
    }
  }

  if (normalizeText(input.material_status) === "SOLICITADO") {
    score += 4;
    addReason(reasons, "Aguardando material");
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
    reasons:
      reasons.length > 0
        ? reasons.slice(0, 5)
        : ["Sem agravantes identificados"],
  };
}

export function isHighPriority(level: PriorityLevel) {
  return level === "CRÍTICA" || level === "ALTA";
}

export function comparePriority(a: PriorityResult, b: PriorityResult) {
  return PRIORITY_ORDER[a.level] - PRIORITY_ORDER[b.level] || b.score - a.score;
}
