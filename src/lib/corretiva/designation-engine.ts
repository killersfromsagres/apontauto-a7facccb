import {
  EQUIPES,
  classifyTeamByText,
  type Equipe,
  type TeamClassificationResult,
} from "@/lib/backorder/team-classifier";

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

const FIELD_WEIGHTS: Record<WeightedField, number> = {
  nome_os: 5,
  equipamento: 4,
  ativo: 2.5,
  local: 1.5,
  predio: 0.75,
  andar: 0.25,
  solicitante: 0.5,
};

const CONTEXT_RULES: ContextRule[] = [
  {
    equipe: "Refrigeração",
    score: 22,
    pattern:
      /\b(ar condicionado|split|fancoil|fan coil|fan coil|cassete|cassette|condensadora|evaporadora|compressor|chiller|vrf|vrv|hvac|climatizacao|refrigeracao|camara fria|freezer|geladeira|serpentina)\b/,
    evidence: "equipamento ou serviço de climatização/refrigeração",
  },
  {
    equipe: "Hidráulica",
    score: 18,
    pattern:
      /\b(vazamento|vazando|entupido|entupimento|torneira|sifao|ralo|esgoto|vaso sanitario|mictorio|descarga|tubulacao|encanamento|registro de agua|caixa d agua|bomba d agua|boca de lobo|canaleta|caixa pluvial|rede pluvial|efluente)\b/,
    evidence: "rede hidráulica, sanitária ou pluvial",
  },
  {
    equipe: "Elétrica",
    score: 22,
    pattern:
      /\b(lampada|luminaria|refletor|tomada|interruptor|disjuntor|quadro eletrico|painel eletrico|curto circuito|sem energia|falta de energia|fiacao|cabeamento eletrico|ponto eletrico|aterramento|reator|sensor de presenca|nobreak|no break|qgbt|qdl|qdc|ccm|contator|fusivel|transformador|eletroduto|inversor de frequencia|tensao|voltagem)\b/,
    evidence: "instalação, alimentação ou equipamento elétrico",
  },
  {
    equipe: "Chaveiro",
    score: 20,
    pattern:
      /\b(fechadura|miolo|cadeado|chaveiro|copia de chave|chave quebrada|destrancar|porta travada|porta trancada|trinco|lingueta|macaneta|cilindro|mola de porta)\b/,
    evidence: "fechamento, chave ou ferragem de acesso",
  },
  {
    equipe: "Pintura",
    score: 20,
    pattern:
      /\b(pintura|pintar|repintura|repintar|tinta|verniz|retoque|demarcacao de piso|sinalizacao de piso|faixa amarela|pintura de piso|pintura de parede)\b/,
    evidence: "pintura, acabamento ou demarcação",
  },
  {
    equipe: "Limpeza",
    score: 16,
    pattern:
      /\b(limpeza|higienizacao|lavagem|varricao|desinfeccao|sujeira|residuo|conservacao|coleta de residuos)\b/,
    evidence: "limpeza, higienização ou conservação",
  },
  {
    equipe: "Civil",
    score: 18,
    pattern:
      /\b(alvenaria|parede|forro|teto|drywall|gesso|reboco|trinca|rachadura|piso|azulejo|revestimento|calcada|telhado|telha|infiltracao|concreto|argamassa|guarda corpo|corrimao|esquadria|batente|vidro|marcenaria|mobiliario|armario|mesa|cadeira)\b/,
    evidence: "estrutura, acabamento predial ou mobiliário",
  },
];

const STRONG_DOMAIN_RULES: ContextRule[] = [
  {
    equipe: "Elétrica",
    score: 55,
    pattern:
      /\b(qgbt|qdl|qdc|ccm|quadro (?:geral |de )?(?:baixa tensao|distribuicao|energia|eletrico)|painel eletrico|disjuntor|contator|rele termico|rele de protecao|fusivel|transformador|barramento|tomada|interruptor|luminaria|lampada|refletor|curto circuito|cabo eletrico|fiacao eletrica|eletroduto|aterramento|inversor de frequencia|nobreak|no break|sem energia|falta de energia)\b/,
    evidence: "evidência elétrica específica",
  },
  {
    equipe: "Refrigeração",
    score: 60,
    pattern:
      /\b(ar condicionado|split|fancoil|fan coil|cassete|cassette|condensadora|evaporadora|chiller|vrf|vrv|hvac|compressor frigorifico|gas refrigerante|serpentina|camara fria|freezer|geladeira)\b/,
    evidence: "equipamento HVAC/refrigeração identificado",
  },
  {
    equipe: "Hidráulica",
    score: 55,
    pattern:
      /\b(torneira|sifao|ralo|esgoto|vaso sanitario|mictorio|descarga|registro de agua|tubulacao de agua|encanamento|caixa d agua|bomba d agua|boca de lobo|caixa pluvial|rede pluvial|efluente)\b/,
    evidence: "componente hidráulico/sanitário específico",
  },
  {
    equipe: "Chaveiro",
    score: 60,
    pattern:
      /\b(fechadura|miolo de fechadura|cadeado|copia de chave|chave quebrada|destrancar|porta travada|porta trancada|trinco|lingueta|macaneta|cilindro de fechadura)\b/,
    evidence: "componente de chave/fechadura identificado",
  },
  {
    equipe: "Pintura",
    score: 55,
    pattern:
      /\b(repintura|repintar|pintura|pintar|tinta|verniz|retoque de pintura|demarcacao de piso|faixa amarela|pintura de piso|pintura de parede)\b/,
    evidence: "serviço de pintura identificado",
  },
  {
    equipe: "Civil",
    score: 50,
    pattern:
      /\b(alvenaria|drywall|gesso|reboco|trinca|rachadura|azulejo|revestimento|calcada|telhado|telha|concreto|argamassa|guarda corpo|corrimao|esquadria|marcenaria)\b/,
    evidence: "serviço civil/predial específico",
  },
];

const HYDRAULIC_CLEANING =
  /\blimpeza (?:de |da |das |do |dos )?(calha|ralo|canaleta|boca de lobo|caixa pluvial|rede pluvial)\b/;
const HVAC_CLEANING =
  /\b(limpeza|higienizacao) (?:de |da |do )?(ar condicionado|split|fancoil|fan coil|evaporadora|condensadora)\b/;
const ELECTRIC_SHOWER =
  /\bchuveiro (eletrico|queimado|nao aquece|sem aquecer|resistencia)\b/;
const HYDRAULIC_SHOWER =
  /\bchuveiro (vazando|pingando|registro|canopla|manopla)\b/;

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
    scores.Hidráulica += 45;
    scores.Limpeza = Math.max(0, scores.Limpeza - 20);
    scores.Civil = Math.max(0, scores.Civil - 12);
    evidence.unshift("limpeza de elemento hidráulico/pluvial");
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

  // Um vazamento genérico não deve transformar um equipamento HVAC em Hidráulica.
  if (STRONG_DOMAIN_RULES[1].pattern.test(fullText)) {
    scores.Hidráulica = Math.min(scores.Hidráulica, scores.Refrigeração * 0.45);
  }

  // Termos genéricos como "quadro", "porta", "fixar" ou "piso" não podem
  // superar uma evidência elétrica explícita.
  if (STRONG_DOMAIN_RULES[0].pattern.test(fullText)) {
    scores.Civil = Math.min(scores.Civil, scores.Elétrica * 0.5);
    scores.Chaveiro = Math.min(scores.Chaveiro, scores.Elétrica * 0.5);
  }

  if (STRONG_DOMAIN_RULES[3].pattern.test(fullText)) {
    scores.Civil = Math.min(scores.Civil, scores.Chaveiro * 0.45);
  }
}

/**
 * Motor contextual de designação para Corretivas.
 *
 * Analisa descrição, equipamento, ativo, local, prédio, andar e solicitante.
 * Evidências técnicas específicas recebem precedência sobre palavras genéricas
 * e sobre uma equipe previamente preenchida incorretamente.
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

  // Só preserva a equipe atual em empate técnico real. Uma leitura forte da OS
  // pode corrigir inclusive uma equipe reconhecida que veio errada da origem.
  if (
    currentTeam &&
    currentTeam !== topTeam &&
    scores[currentTeam] > 0 &&
    scores[currentTeam] >= topScore * 0.94 &&
    gapRatio < 0.08
  ) {
    selectedTeam = currentTeam;
    preservedCurrent = true;
    evidence.unshift("equipe atual preservada em empate técnico");
  }

  const selectedScore = scores[selectedTeam];
  const ambiguo = !preservedCurrent && secondScore > 0 && gapRatio < 0.16;
  const confianca: TeamClassificationResult["confianca"] =
    selectedScore >= 28 && !ambiguo
      ? "alta"
      : selectedScore >= 10 && gapRatio >= 0.1
        ? "media"
        : "baixa";

  return {
    equipe: selectedTeam,
    confianca,
    ambiguo,
    hasSignal: true,
    preservedCurrent,
    scores,
    evidence: [...new Set(evidence)].slice(0, 8),
  };
}
