import {
  EQUIPES,
  classifyTeamByText,
  type Equipe,
  type TeamClassificationResult,
} from "@/lib/backorder/team-classifier";
import { analyzeCorrectiveTechnicalDomain } from "@/lib/corretiva/technical-domain-agent";

export type CorrectiveDesignationInput = {
  nome_os?: string | null;
  equipamento?: string | null;
  ativo?: string | null;
  local?: string | null;
  predio?: string | null;
  andar?: string | null;
  solicitante?: string | null;
  equipe?: string | null;
};

export type CorrectiveDesignationResult = {
  equipe: Equipe;
  confianca: TeamClassificationResult["confianca"];
  ambiguo: boolean;
  hasSignal: boolean;
  preservedCurrent: boolean;
  scores: Record<Equipe, number>;
  evidence: string[];
};

type WeightedField = Exclude<keyof CorrectiveDesignationInput, "equipe">;

type ContextRule = {
  equipe: Equipe;
  score: number;
  pattern: RegExp;
  evidence: string;
};

/*
 * Descrição/equipamento dominam a decisão. Local/prédio/andar são apenas
 * contexto para evitar que um texto como "trocar vidro no banheiro" seja
 * interpretado como Hidráulica só por causa da localização.
 */
const FIELD_WEIGHTS: Record<WeightedField, number> = {
  nome_os: 6,
  equipamento: 5,
  ativo: 3,
  local: 0.7,
  predio: 0.2,
  andar: 0.1,
  solicitante: 0.1,
};

const CONTEXT_RULES: ContextRule[] = [
  {
    equipe: "Refrigeração",
    score: 22,
    pattern:
      /\b(ar condicionado|ar condicionados|split|splits|fancoil|fan coil|fan coils|cassete|cassettes|condensadoras?|evaporadoras?|compressores?|chillers?|vrf|vrv|hvac|climatizacao|refrigeracao|camaras? frias?|freezers?|geladeiras?|serpentinas?)\b/,
    evidence: "equipamento ou serviço de climatização/refrigeração",
  },
  {
    equipe: "Hidráulica",
    score: 20,
    pattern:
      /\b(vazamentos?|vazando|entupid[oa]s?|entupimentos?|desentupimento|desentupir|torneiras?|sifoes?|ralos?|esgoto|vasos? sanitarios?|bacias? sanitarias?|mictorios?|privadas?|descargas?|tubulacoes?|encanamento|registros? de agua|caixas? d agua|bombas? d agua|bocas? de lobo|canaletas?|caixas? pluviais?|rede pluvial|efluente|hidrojateamento|hidrojato)\b/,
    evidence: "rede hidráulica, sanitária ou pluvial",
  },
  {
    equipe: "Elétrica",
    score: 24,
    pattern:
      /\b(iluminacao|lampadas?|luminarias?|refletores?|spots?|plafons?|arandelas?|leds?|tomadas?|interruptores?|disjuntores?|quadro eletrico|painel eletrico|curto circuito|sem energia|falta de energia|fiacao|cabeamento eletrico|pontos? eletricos?|aterramento|reatores?|fotocelula|foto celula|sensores? de presenca|nobreak|no break|qgbt|qdl|qdc|ccm|contatores?|fusiveis?|fusivel|transformadores?|eletrodutos?|inversores? de frequencia|tensao|voltagem)\b/,
    evidence: "instalação, alimentação ou equipamento elétrico",
  },
  {
    equipe: "Chaveiro",
    score: 20,
    pattern:
      /\b(fechaduras?|miolos?|cadeados?|chaveiro|copias? de chaves?|chaves? quebradas?|destrancar|porta travada|porta trancada|trincos?|linguetas?|macanetas?|cilindros?|molas? de porta)\b/,
    evidence: "fechamento, chave ou ferragem de acesso",
  },
  {
    equipe: "Pintura",
    score: 20,
    pattern:
      /\b(pintura|pintar|repintura|repintar|tintas?|verniz|retoques?|demarcacao de piso|sinalizacao de piso|faixas? amarelas?|pintura de piso|pintura de parede)\b/,
    evidence: "pintura, acabamento ou demarcação",
  },
  {
    equipe: "Limpeza",
    score: 16,
    pattern:
      /\b(limpeza geral|higienizacao geral|lavagem|varricao|desinfeccao|sujeira|residuos?|conservacao|coleta de residuos)\b/,
    evidence: "limpeza, higienização ou conservação",
  },
  {
    equipe: "Civil",
    score: 18,
    pattern:
      /\b(alvenaria|paredes?|forros?|tetos?|drywall|gesso|reboco|trincas?|rachaduras?|pisos?|azulejos?|revestimentos?|calcadas?|telhados?|telhas?|infiltracao|concreto|argamassa|guarda corpo|guarda corpos|corrimaos?|esquadrias?|batentes?|vidros?|persianas?|marcenaria|mobiliario|armarios?|mesas?|cadeiras?)\b/,
    evidence: "estrutura, acabamento predial ou mobiliário",
  },
];

const STRONG_ELECTRICAL_PATTERN =
  /\b(iluminacao|sistema de iluminacao|pontos? de luz|lampadas?|luminarias?|refletores?|spots?|plafons?|arandelas?|leds?|qgbt|qdl|qdc|ccm|quadro (?:geral |de )?(?:baixa tensao|distribuicao|energia|eletrico)|painel eletrico|disjuntores?|contatores?|reles? termicos?|reles? de protecao|fusiveis?|fusivel|transformadores?|barramento|tomadas?|interruptores?|curto circuito|cabos? eletricos?|fiacao eletrica|eletrodutos?|aterramento|inversores? de frequencia|nobreak|no break|sem energia|falta de energia|fotocelula|foto celula)\b/;
const STRONG_HVAC_PATTERN =
  /\b(ar condicionado|ar condicionados|split|splits|fancoil|fan coil|fan coils|cassete|cassettes|condensadoras?|evaporadoras?|chillers?|vrf|vrv|hvac|compressores? frigorificos?|gas refrigerante|serpentinas?|camaras? frias?|freezers?|geladeiras?)\b/;
const STRONG_HYDRAULIC_PATTERN =
  /\b(torneiras?|sifoes?|ralos?|esgoto|vasos? sanitarios?|bacias? sanitarias?|mictorios?|privadas?|descargas?|valvulas? de descarga|registros? de agua|tubulacoes? de agua|encanamento|caixas? d agua|bombas? d agua|bocas? de lobo|caixas? pluviais?|rede pluvial|efluente|desentupimento|desentupir|entupid[oa]s?|hidrojateamento|hidrojato)\b/;
const STRONG_LOCK_PATTERN =
  /\b(fechaduras?|miolos? de fechadura|cadeados?|copias? de chaves?|chaves? quebradas?|destrancar|porta travada|porta trancada|trincos?|linguetas?|macanetas?|cilindros? de fechadura)\b/;

const STRONG_DOMAIN_RULES: ContextRule[] = [
  {
    equipe: "Elétrica",
    score: 70,
    pattern: STRONG_ELECTRICAL_PATTERN,
    evidence: "evidência elétrica específica",
  },
  {
    equipe: "Refrigeração",
    score: 76,
    pattern: STRONG_HVAC_PATTERN,
    evidence: "equipamento HVAC/refrigeração identificado",
  },
  {
    equipe: "Hidráulica",
    score: 72,
    pattern: STRONG_HYDRAULIC_PATTERN,
    evidence: "componente hidráulico/sanitário específico",
  },
  {
    equipe: "Chaveiro",
    score: 68,
    pattern: STRONG_LOCK_PATTERN,
    evidence: "componente de chave/fechadura identificado",
  },
  {
    equipe: "Pintura",
    score: 58,
    pattern:
      /\b(repintura|repintar|pintura|pintar|tintas?|verniz|retoques? de pintura|demarcacao de piso|faixas? amarelas?|pintura de piso|pintura de parede)\b/,
    evidence: "serviço de pintura identificado",
  },
  {
    equipe: "Civil",
    score: 50,
    pattern:
      /\b(alvenaria|drywall|gesso|reboco|trincas?|rachaduras?|azulejos?|revestimentos?|calcadas?|telhados?|telhas?|concreto|argamassa|guarda corpo|guarda corpos|corrimaos?|esquadrias?|marcenaria|vidros?|persianas?)\b/,
    evidence: "serviço civil/predial específico",
  },
];

const HYDRAULIC_CLEANING =
  /\b(limpeza|higienizacao)(?:\s+[a-z0-9]+){0,5}\s+(privadas?|mictorios?|vasos? sanitarios?|ralos?|canaletas?|bocas? de lobo|caixas? pluviais?|rede pluvial)\b/;
const HVAC_CLEANING =
  /\b(limpeza|higienizacao) (?:de |da |do )?(ar condicionado|split|fancoil|fan coil|evaporadoras?|condensadoras?)\b/;
const ELECTRIC_SHOWER =
  /\bchuveiros?\b(?:\s+[a-z0-9]+){0,4}\s+(eletrico|queimado|nao aquece|sem aquecer|resistencia)\b/;
const HYDRAULIC_SHOWER =
  /\bchuveiros?\b(?:\s+[a-z0-9]+){0,4}\s+(vazando|pingando|registro|canopla|manopla)\b/;

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const makeScores = (): Record<Equipe, number> =>
  Object.fromEntries(EQUIPES.map((team) => [team, 0])) as Record<Equipe, number>;

export function canonicalCorrectiveTeam(
  value: string | null | undefined,
): Equipe | null {
  const text = normalize(value);
  if (!text) return null;
  if (text.includes("chave") || text.includes("serralh")) return "Chaveiro";
  if (text.includes("hidraul") || text.includes("encanad")) return "Hidráulica";
  if (text.includes("eletric")) return "Elétrica";
  if (
    text.includes("refrig") ||
    text.includes("climat") ||
    text.includes("ar condicionado")
  ) {
    return "Refrigeração";
  }
  if (text.includes("pint")) return "Pintura";
  if (
    text.includes("limpeza") ||
    text.includes("higien") ||
    text.includes("conserva") ||
    text.includes("gerencia")
  ) {
    return "Limpeza";
  }
  if (
    text.includes("civil") ||
    text.includes("alvenaria") ||
    text.includes("predial")
  ) {
    return "Civil";
  }
  return null;
}

function addFieldEvidence(
  scores: Record<Equipe, number>,
  evidence: string[],
  field: WeightedField,
  rawValue: string | null | undefined,
) {
  const value = String(rawValue ?? "").trim();
  if (!value) return;

  const result = classifyTeamByText(value);
  const weight = FIELD_WEIGHTS[field];
  let strongestScore = 0;

  for (const team of EQUIPES) {
    const contribution = result.scores[team] * weight;
    scores[team] += contribution;
    strongestScore = Math.max(strongestScore, contribution);
  }

  if (strongestScore > 0 && evidence.length < 6) {
    evidence.push(`${field}: ${result.equipe}`);
  }
}

function applyContextRules(
  scores: Record<Equipe, number>,
  evidence: string[],
  fullText: string,
) {
  for (const rule of CONTEXT_RULES) {
    if (!rule.pattern.test(fullText)) continue;
    scores[rule.equipe] += rule.score;
    if (evidence.length < 8) evidence.push(rule.evidence);
  }

  for (const rule of STRONG_DOMAIN_RULES) {
    if (!rule.pattern.test(fullText)) continue;
    scores[rule.equipe] += rule.score;
    evidence.unshift(rule.evidence);
  }

  if (HYDRAULIC_CLEANING.test(fullText)) {
    scores.Hidráulica += 60;
    scores.Limpeza = Math.max(0, scores.Limpeza - 30);
    scores.Civil = Math.max(0, scores.Civil - 20);
    evidence.unshift("limpeza de componente sanitário/hidráulico");
  }

  if (HVAC_CLEANING.test(fullText)) {
    scores.Refrigeração += 45;
    scores.Limpeza = Math.max(0, scores.Limpeza - 20);
    scores.Hidráulica = Math.max(0, scores.Hidráulica - 8);
    evidence.unshift("higienização de equipamento de climatização");
  }

  if (ELECTRIC_SHOWER.test(fullText)) {
    scores.Elétrica += 45;
    scores.Hidráulica = Math.max(0, scores.Hidráulica - 12);
    evidence.unshift("chuveiro com falha elétrica");
  }

  if (HYDRAULIC_SHOWER.test(fullText)) {
    scores.Hidráulica += 45;
    scores.Elétrica = Math.max(0, scores.Elétrica - 12);
    evidence.unshift("chuveiro com falha hidráulica");
  }

  if (STRONG_HVAC_PATTERN.test(fullText)) {
    scores.Hidráulica = Math.min(scores.Hidráulica, scores.Refrigeração * 0.45);
    scores.Civil = Math.min(scores.Civil, scores.Refrigeração * 0.35);
  }

  if (STRONG_ELECTRICAL_PATTERN.test(fullText) && !STRONG_HYDRAULIC_PATTERN.test(fullText)) {
    scores.Civil = Math.min(scores.Civil, scores.Elétrica * 0.28);
    scores.Chaveiro = Math.min(scores.Chaveiro, scores.Elétrica * 0.35);
    scores.Limpeza = Math.min(scores.Limpeza, scores.Elétrica * 0.2);
  }

  if (STRONG_HYDRAULIC_PATTERN.test(fullText) && !STRONG_ELECTRICAL_PATTERN.test(fullText)) {
    scores.Civil = Math.min(scores.Civil, scores.Hidráulica * 0.28);
    scores.Limpeza = Math.min(scores.Limpeza, scores.Hidráulica * 0.2);
    scores.Chaveiro = Math.min(scores.Chaveiro, scores.Hidráulica * 0.35);
  }

  if (STRONG_LOCK_PATTERN.test(fullText)) {
    scores.Civil = Math.min(scores.Civil, scores.Chaveiro * 0.35);
  }
}

function applyTechnicalAgent(
  scores: Record<Equipe, number>,
  evidence: string[],
  input: CorrectiveDesignationInput,
) {
  const analysis = analyzeCorrectiveTechnicalDomain(input);

  for (const team of EQUIPES) {
    scores[team] += analysis.scores[team];
  }

  if (analysis.evidence.length > 0) {
    evidence.unshift(...analysis.evidence);
  }

  if (!analysis.decisive || !analysis.equipe) return;

  // Proteção de domínio: Civil não deve absorver uma OS com evidência técnica
  // decisiva de elétrica/hidráulica. Limpeza também não deve ficar com um
  // desentupimento apenas porque a descrição começa com "limpeza".
  if (analysis.equipe === "Elétrica") {
    scores.Civil = Math.min(scores.Civil, scores.Elétrica * 0.16);
    scores.Limpeza = Math.min(scores.Limpeza, scores.Elétrica * 0.12);
  } else if (analysis.equipe === "Hidráulica") {
    scores.Civil = Math.min(scores.Civil, scores.Hidráulica * 0.16);
    scores.Limpeza = Math.min(scores.Limpeza, scores.Hidráulica * 0.12);
  } else if (analysis.equipe === "Refrigeração") {
    scores.Civil = Math.min(scores.Civil, scores.Refrigeração * 0.16);
    scores.Hidráulica = Math.min(scores.Hidráulica, scores.Refrigeração * 0.4);
  } else if (analysis.equipe === "Chaveiro") {
    scores.Civil = Math.min(scores.Civil, scores.Chaveiro * 0.25);
  }
}

/**
 * Motor contextual de designação para Corretivas.
 *
 * Analisa descrição, equipamento, ativo, local, prédio, andar e solicitante.
 * O agente técnico avalia primeiro o objeto/defeito da atividade; contexto de
 * localização entra apenas como sinal fraco. Evidências técnicas decisivas têm
 * precedência sobre palavras genéricas e sobre a equipe preenchida na origem.
 */
export function designateCorrectiveTeam(
  input: CorrectiveDesignationInput,
): CorrectiveDesignationResult {
  const scores = makeScores();
  const evidence: string[] = [];

  for (const field of Object.keys(FIELD_WEIGHTS) as WeightedField[]) {
    addFieldEvidence(scores, evidence, field, input[field]);
  }

  const fullText = normalize(
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

  applyContextRules(scores, evidence, fullText);
  applyTechnicalAgent(scores, evidence, input);

  const ordered = (Object.entries(scores) as Array<[Equipe, number]>).sort(
    (a, b) => b[1] - a[1],
  );
  const [topTeam, topScore] = ordered[0];
  const [, secondScore] = ordered[1];
  const currentTeam = canonicalCorrectiveTeam(input.equipe);

  if (topScore <= 0) {
    return {
      equipe: currentTeam ?? "Civil",
      confianca: "baixa",
      ambiguo: true,
      hasSignal: false,
      preservedCurrent: Boolean(currentTeam),
      scores,
      evidence: ["sem evidência técnica suficiente"],
    };
  }

  const gapRatio = secondScore <= 0 ? 1 : (topScore - secondScore) / topScore;
  let selectedTeam = topTeam;
  let preservedCurrent = false;

  // A equipe atual só é preservada em empate técnico real. Um componente
  // elétrico/hidráulico explícito corrige inclusive registros vindos como Civil.
  if (
    currentTeam &&
    currentTeam !== topTeam &&
    scores[currentTeam] > 0 &&
    scores[currentTeam] >= topScore * 0.96 &&
    gapRatio < 0.05
  ) {
    selectedTeam = currentTeam;
    preservedCurrent = true;
    evidence.unshift("equipe atual preservada em empate técnico real");
  }

  const selectedScore = scores[selectedTeam];
  const ambiguo = !preservedCurrent && secondScore > 0 && gapRatio < 0.14;
  const confianca: TeamClassificationResult["confianca"] =
    selectedScore >= 36 && !ambiguo
      ? "alta"
      : selectedScore >= 14 && gapRatio >= 0.1
        ? "media"
        : "baixa";

  return {
    equipe: selectedTeam,
    confianca,
    ambiguo,
    hasSignal: true,
    preservedCurrent,
    scores,
    evidence: [...new Set(evidence)].slice(0, 10),
  };
}
