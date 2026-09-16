/**
 * Classificação determinística de prioridade para chamados corretivos.
 *
 * Objetivos:
 * - destacar risco real e continuidade operacional antes de simples antiguidade;
 * - reconhecer Backorder pela origem real do chamado (tipo/tipo_importacao);
 * - usar SLA e aging sem transformar todo Backorder em crítico;
 * - manter o mesmo resultado no sistema, Excel, PDF e Programação.
 */
export type PriorityLevel = "CRÍTICA" | "ALTA" | "MÉDIA" | "NORMAL";
export type PriorityDueState =
  | "OVERDUE"
  | "DUE_SOON"
  | "DUE_WEEK"
  | "ON_TIME"
  | "NO_DUE";

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
  tipo?: string | null;
  tipo_importacao?: string | null;
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
  isBackorder: boolean;
  ageDays: number;
  dueState: PriorityDueState;
  daysToDue: number | null;
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
  CRÍTICA: { bg: "#FACC15", fg: "#111827" },
  ALTA: { bg: "#F97316", fg: "#111827" },
  MÉDIA: { bg: "#38BDF8", fg: "#082F49" },
  NORMAL: { bg: "#E2E8F0", fg: "#334155" },
};

export const BACKORDER_HEX = { bg: "#DC2626", fg: "#FFFFFF" } as const;

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * A base atual identifica Backorder principalmente em `tipo = Backorder`.
 * `tipo_importacao` também é aceito para bases antigas/integrações, sem depender
 * de o texto da descrição conter a palavra backorder.
 */
export function isBackorderCorrective(input: PriorityInput): boolean {
  const values = [normalizeText(input.tipo), normalizeText(input.tipo_importacao)];
  return values.some((value) => value === "BACKORDER" || value.startsWith("BACKORDER "));
}

type Rule = {
  terms: string[];
  points: number;
  reason: string;
  unless?: string[];
};

const RULES: Rule[] = [
  {
    terms: [
      "CURTO CIRCUITO",
      "CHOQUE",
      "FAISCA",
      "FUMACA",
      "CHEIRO DE QUEIMADO",
      "PRINCIPIO DE INCENDIO",
      "INCENDIO",
      "FOGO",
      "SUPERAQUEC",
      "CABO EXPOSTO",
      "FIO EXPOSTO",
      "ENERGIZADO",
    ],
    points: 66,
    reason: "Risco elétrico/incêndio",
  },
  {
    terms: ["INUNDAC", "ALAGAMENTO", "ALAGADO", "ALAGANDO", "TRANSBORD"],
    points: 55,
    reason: "Alagamento/inundação",
  },
  {
    terms: [
      "EMERGENCIA",
      "URGENTE",
      "URGENCIA",
      "DESABAMENTO",
      "INTERDIC",
      "INTERDITAD",
      "ISOLAR AREA",
      "SAIDA DE EMERGENCIA",
      "HIDRANTE",
      "BOTAO DE EMERGENCIA",
      "BOTOEIRA DE EMERGENCIA",
    ],
    points: 42,
    reason: "Segurança/emergência",
  },
  {
    terms: ["RISCO", "SEGURANCA", "CIPA", "ACIDENTE", "PERIGO"],
    points: 24,
    reason: "Risco de segurança identificado",
  },
  {
    terms: ["VAZAMENTO", "VAZANDO", "GOTEIRA", "INFILTRAC", "PINGANDO AGUA"],
    unless: ["SEM VAZAMENTO", "NAO HA VAZAMENTO", "VERIFICAR SE HA VAZAMENTO"],
    points: 32,
    reason: "Vazamento/infiltração ativa",
  },
  {
    terms: ["AGUA CORRENDO", "AGUA ESCORRENDO", "AGUA O TEMPO TODO", "AGUA TEMPO INTEIRO", "VAZAMENTO CONTINUO"],
    points: 18,
    reason: "Perda contínua de água",
  },
  {
    terms: ["FALTA DE AGUA", "SEM AGUA", "FALTA AGUA", "SEM ABASTECIMENTO"],
    points: 35,
    reason: "Falta de água",
  },
  {
    terms: ["ESGOTO", "ENTUPI", "OBSTRU", "REFLUXO", "FOSSA", "MICTORIO ENTUP", "VASO ENTUP"],
    points: 32,
    reason: "Esgoto/entupimento",
  },
  {
    terms: ["SEM ENERGIA", "FALTA DE ENERGIA", "QUEDA DE ENERGIA", "DISJUNTOR DESARM", "PAINEL DESLIG"],
    points: 34,
    reason: "Interrupção de energia",
  },
  {
    terms: ["ILUMINACAO DE EMERGENCIA", "LUZ DE EMERGENCIA", "ROTA DE FUGA", "ROTA DE EMERGENCIA"],
    points: 34,
    reason: "Iluminação/rota de emergência",
  },
  {
    terms: ["ESTRADA", "ESTACIONAMENTO", "PASSAGEM DE PEDESTRE", "PASSAGEM DE PEDESTRES", "CIRCULACAO EXTERNA"],
    points: 10,
    reason: "Circulação externa afetada",
  },
  {
    terms: ["VIDRO QUEBRADO", "VIDRO TRINCADO", "RISCO DE CORTE", "CORTANTE"],
    points: 36,
    reason: "Risco de corte/vidro",
  },
  {
    terms: ["PESSOA PRESA", "PRESO NO ELEVADOR", "ELEVADOR PARADO"],
    points: 48,
    reason: "Elevador/pessoa presa",
  },
  {
    terms: ["BANHEIRO", "SANITARIO", "VASO SANITARIO", "VALVULA DE DESCARGA", "DESCARGA", "MICTORIO", "TORNEIRA", "LAVATORIO", "CHUVEIRO"],
    points: 14,
    reason: "Área sanitária afetada",
  },
  {
    terms: ["COZINHA", "REFEITORIO", "RESTAURANTE", "COPA", "CAMARA FRIA"],
    points: 16,
    reason: "Área de alimentação",
  },
  {
    terms: ["CCM", "SALA DE CONTROLE", "SALA CONTROLE", "LABORATORIO", "DATA CENTER", "CPD"],
    points: 18,
    reason: "Área operacional crítica",
  },
  {
    terms: ["FECHADURA", "PORTA TRAVADA", "PORTA NAO ABRE", "PORTA NAO FECHA", "CATRACA", "PORTAO", "CONTROLE DE ACESSO", "CHAVE QUEBRADA"],
    points: 20,
    reason: "Acesso comprometido",
  },
  {
    terms: ["PARADO", "PAROU DE FUNCIONAR", "NAO FUNCIONA", "NAO ESTA FUNCIONANDO", "INOPERANTE", "FORA DE OPERACAO", "PRODUCAO PARADA", "LINHA PARADA", "QUEIMADO"],
    points: 20,
    reason: "Equipamento/área inoperante",
  },
  {
    terms: ["AR CONDICIONADO", "AR CONDICIONADO", "FANCOIL", "CHILLER", "SPLIT", "EVAPORADORA", "CONDENSADORA"],
    points: 7,
    reason: "Climatização afetada",
  },
  {
    terms: ["PLATAFORMA ELEVATORIA", "TRABALHO EM ALTURA", "NR 35", "ACESSO EM ALTURA"],
    points: 8,
    reason: "Intervenção em altura",
  },
  {
    terms: ["PRIORIT", "QUANTO ANTES", "COM URGENCIA", "IMEDIATAMENTE"],
    points: 10,
    reason: "Solicitação explícita de prioridade",
  },
];

function parseDate(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12);
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
    if (["REJEIT", "CONCLUID", "FECHAD", "ENCERRAD"].some((x) => status.includes(x))) continue;
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

function containsAny(haystack: string, terms: string[]) {
  return terms.some((term) => haystack.includes(term));
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
      input.tipo,
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

  const hasWater = containsAny(haystack, ["VAZAMENTO", "VAZANDO", "GOTEIRA", "INFILTRAC", "ALAG", "AGUA", "ESGOTO"]);
  const hasElectricalContext = containsAny(haystack, ["ELETR", "FIACAO", "FIO ", "FIA ", "CABO", "QUADRO", "PAINEL", "DISJUNTOR", "TOMADA", "COMPRESSOR"]);
  const sensitiveArea = reasons.includes("Área sanitária afetada") || reasons.includes("Área de alimentação") || reasons.includes("Área operacional crítica");

  if (hasWater && sensitiveArea) {
    score += 12;
    addReason(reasons, "Água em ambiente sensível");
  }
  if (hasWater && hasElectricalContext) {
    score += 30;
    addReason(reasons, "Água próxima de instalação elétrica");
  }
  if (reasons.includes("Climatização afetada") && reasons.includes("Área operacional crítica")) {
    score += 18;
    addReason(reasons, "Climatização de área crítica");
  }
  if (reasons.includes("Intervenção em altura") && reasons.includes("Risco de segurança identificado")) {
    score += 10;
    addReason(reasons, "Risco associado a trabalho em altura");
  }

  const severity = managerSeverity(input);
  score += severity.points;
  if (severity.reason) addReason(reasons, severity.reason);

  const reference = startOfDay(referenceDate);
  const due = parseDate(input.data_sla) ?? parseDate(input.data_programada);
  let dueState: PriorityDueState = "NO_DUE";
  let daysToDue: number | null = null;
  if (due) {
    const days = Math.round((startOfDay(due).getTime() - reference.getTime()) / 86_400_000);
    daysToDue = days;
    if (days < 0) {
      dueState = "OVERDUE";
      score += Math.min(40, 20 + Math.abs(days));
      addReason(reasons, `SLA vencido há ${Math.abs(days)} dia(s)`);
    } else if (days <= 2) {
      dueState = "DUE_SOON";
      score += 18;
      addReason(reasons, "SLA vence em até 2 dias");
    } else if (days <= 7) {
      dueState = "DUE_WEEK";
      score += 9;
      addReason(reasons, "SLA vence nesta semana");
    } else {
      dueState = "ON_TIME";
    }
  }

  const created = parseDate(input.data_criacao);
  const ageDays = created
    ? Math.max(0, Math.floor((reference.getTime() - startOfDay(created).getTime()) / 86_400_000))
    : 0;
  if (ageDays >= 90) {
    score += 19;
    addReason(reasons, `Aberto há ${ageDays} dias`);
  } else if (ageDays >= 60) {
    score += 15;
    addReason(reasons, `Aberto há ${ageDays} dias`);
  } else if (ageDays >= 30) {
    score += 10;
    addReason(reasons, `Aberto há ${ageDays} dias`);
  } else if (ageDays >= 15) {
    score += 5;
    addReason(reasons, `Aberto há ${ageDays} dias`);
  }

  const isBackorder = isBackorderCorrective(input);
  if (isBackorder) {
    // Backorder é visibilidade/aging, não sinônimo de emergência.
    score += ageDays >= 60 ? 12 : ageDays >= 30 ? 8 : ageDays >= 15 ? 5 : 3;
    addReason(reasons, ageDays > 0 ? `Backorder há ${ageDays} dia(s)` : "Backorder");
  }

  if (normalizeText(input.material_status) === "SOLICITADO") {
    score += 3;
    addReason(reasons, "Aguardando material");
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  const level: PriorityLevel =
    bounded >= 68
      ? "CRÍTICA"
      : bounded >= 42
        ? "ALTA"
        : bounded >= 20
          ? "MÉDIA"
          : "NORMAL";

  return {
    level,
    score: bounded,
    isBackorder,
    ageDays,
    dueState,
    daysToDue,
    reasons: reasons.length > 0 ? reasons.slice(0, 6) : ["Sem agravantes identificados"],
  };
}

export function isHighPriority(level: PriorityLevel) {
  return level === "CRÍTICA" || level === "ALTA";
}

export function comparePriority(a: PriorityResult, b: PriorityResult) {
  const byLevel = PRIORITY_ORDER[a.level] - PRIORITY_ORDER[b.level];
  if (byLevel !== 0) return byLevel;
  const byScore = b.score - a.score;
  if (byScore !== 0) return byScore;
  // No empate real, um Backorder antigo merece ser atendido antes sem passar à
  // frente de um nível/score tecnicamente mais crítico.
  const byBackorder = Number(b.isBackorder) - Number(a.isBackorder);
  if (byBackorder !== 0) return byBackorder;
  return b.ageDays - a.ageDays;
}
