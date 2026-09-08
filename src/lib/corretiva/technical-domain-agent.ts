import { EQUIPES, type Equipe } from "@/lib/backorder/team-classifier";
import type { CorrectiveDesignationInput } from "@/lib/corretiva/designation-engine";

export type TechnicalDomainAnalysis = {
  equipe: Equipe | null;
  decisive: boolean;
  ambiguous: boolean;
  scores: Record<Equipe, number>;
  evidence: string[];
};

type TechnicalRule = {
  equipe: Equipe;
  score: number;
  pattern: RegExp;
  evidence: string;
};

export const normalizeCorrectiveText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const makeScores = (): Record<Equipe, number> =>
  Object.fromEntries(EQUIPES.map((team) => [team, 0])) as Record<Equipe, number>;

/*
 * Objetos técnicos. As expressões aceitam singular/plural e variações comuns
 * encontradas nas planilhas/OS. O agente usa estes sinais principalmente no
 * texto da atividade/equipamento; local/prédio não recebem poder decisivo.
 */
export const ELECTRICAL_OBJECT =
  /\b(iluminacao|sistema de iluminacao|pontos? de luz|lampadas?|luminarias?|refletores?|spots?|plafons?|arandelas?|leds?|tomadas?|interruptores?|disjuntores?|qgbt|qdl|qdc|ccm|quadro eletrico|quadro de energia|painel eletrico|curto circuito|fiacao eletrica|cabeamento eletrico|pontos? eletricos?|aterramento|reatores?|fotocelula|foto celula|sensores? de presenca|nobreak|no break|fusiveis?|fusivel|contatores?|transformadores?|eletrodutos?|inversores? de frequencia)\b/;

export const HYDRAULIC_OBJECT =
  /\b(mictorios?|privadas?|vasos? sanitarios?|bacias? sanitarias?|descargas?|valvulas? de descarga|torneiras?|sifoes?|ralos?|esgoto|tubulacoes?(?: de agua)?|encanamento|registros? de agua|caixas? d agua|bombas? d agua|bocas? de lobo|caixas? pluviais?|rede pluvial|efluente|pias?|cubas?|lavatorios?|bebedouros?|purificadores? de agua)\b/;

export const HVAC_OBJECT =
  /\b(ar condicionado|ar condicionados|split|splits|fancoil|fan coil|fan coils|cassete|cassettes|condensadoras?|evaporadoras?|chiller|chillers|vrf|vrv|hvac|compressores? frigorificos?|gas refrigerante|serpentinas?|camaras? frias?|freezers?|geladeiras?|refrigeradores?)\b/;

const LOCK_OBJECT =
  /\b(fechaduras?|miolos?(?: de fechadura)?|cadeados?|copias? de chaves?|chaves? quebradas?|destrancar|porta travada|porta trancada|trincos?|linguetas?|macanetas?|cilindros?(?: de fechadura)?|molas? de porta)\b/;

const PAINT_OBJECT =
  /\b(pintura|pintar|repintura|repintar|tintas?|verniz|retoques? de pintura|demarcacao de piso|sinalizacao de piso|faixas? amarelas?|pintura de piso|pintura de parede)\b/;

const CIVIL_OBJECT =
  /\b(alvenaria|drywall|gesso|reboco|trincas?|rachaduras?|azulejos?|revestimentos?|calcadas?|telhados?|telhas?|concreto|argamassa|guarda corpo|guarda corpos|corrimaos?|esquadrias?|marcenaria|vidros?|persianas?|forros?|pisos?|buracos?|mobiliario|armarios?|mesas?|cadeiras?)\b/;

const CLEANING_OBJECT =
  /\b(limpeza geral|higienizacao geral|lavagem|varricao|desinfeccao|sujeira|residuos?|coleta de residuos|conservacao)\b/;

const OBSTRUCTION =
  /\b(desentupimento|desentupir|desentupir|entupimentos?|entupid[oa]s?|hidrojateamento|hidrojato|obstrucao|obstruid[oa]s?)\b/;
const WATER_FAILURE = /\b(vazamentos?|vazando|pingando|gotejando|sem agua|falta de agua)\b/;
const ELECTRICAL_FAILURE =
  /\b(queimad[oa]s?|piscando|nao acende|nao acendem|sem luz|sem energia|falta de energia|curto|desarmando)\b/;

const SHOWER_HYDRAULIC =
  /\bchuveiros?\b(?:\s+[a-z0-9]+){0,5}\s+(vazando|pingando|vazamento|registro|canopla|manopla)\b|\b(vazamento|vazando|pingando|registro|canopla|manopla)(?:\s+[a-z0-9]+){0,5}\s+chuveiros?\b/;
const SHOWER_ELECTRICAL =
  /\b(troca|trocar|substituir|substituicao|instalar|instalacao)(?:\s+[a-z0-9]+){0,5}\s+chuveiros?\b|\bchuveiros?\b(?:\s+[a-z0-9]+){0,4}\s+(eletrico|queimado|resistencia|nao aquece|sem aquecer|frio)\b/;

const PRIMARY_RULES: TechnicalRule[] = [
  {
    equipe: "Elétrica",
    score: 110,
    pattern: ELECTRICAL_OBJECT,
    evidence: "agente técnico: componente/serviço elétrico identificado",
  },
  {
    equipe: "Hidráulica",
    score: 110,
    pattern: HYDRAULIC_OBJECT,
    evidence: "agente técnico: componente hidráulico/sanitário identificado",
  },
  {
    equipe: "Refrigeração",
    score: 118,
    pattern: HVAC_OBJECT,
    evidence: "agente técnico: equipamento de climatização/refrigeração identificado",
  },
  {
    equipe: "Chaveiro",
    score: 112,
    pattern: LOCK_OBJECT,
    evidence: "agente técnico: fechadura/chave/ferragem de acesso identificada",
  },
  {
    equipe: "Pintura",
    score: 96,
    pattern: PAINT_OBJECT,
    evidence: "agente técnico: serviço de pintura identificado",
  },
  {
    equipe: "Civil",
    score: 84,
    pattern: CIVIL_OBJECT,
    evidence: "agente técnico: serviço estrutural/civil identificado",
  },
  {
    equipe: "Limpeza",
    score: 76,
    pattern: CLEANING_OBJECT,
    evidence: "agente técnico: limpeza/conservação geral identificada",
  },
];

function addRuleMatches(
  scores: Record<Equipe, number>,
  evidence: string[],
  text: string,
  multiplier: number,
) {
  if (!text) return;
  for (const rule of PRIMARY_RULES) {
    if (!rule.pattern.test(text)) continue;
    scores[rule.equipe] += rule.score * multiplier;
    if (multiplier >= 0.5) evidence.push(rule.evidence);
  }
}

/**
 * Agente técnico determinístico para Corretivas.
 *
 * Prioriza o objeto/defeito descrito na OS e no equipamento. Localização entra
 * apenas como contexto fraco, evitando que palavras como banheiro, sala ou
 * prédio alterem a especialidade quando o serviço está claro.
 */
export function analyzeCorrectiveTechnicalDomain(
  input: CorrectiveDesignationInput,
): TechnicalDomainAnalysis {
  const scores = makeScores();
  const evidence: string[] = [];

  const primaryText = normalizeCorrectiveText(
    [input.nome_os, input.equipamento, input.ativo].filter(Boolean).join(" "),
  );
  const locationText = normalizeCorrectiveText(
    [input.local, input.predio, input.andar].filter(Boolean).join(" "),
  );

  addRuleMatches(scores, evidence, primaryText, 1);
  // Localização auxilia, mas nunca deve decidir sozinha uma especialidade.
  addRuleMatches(scores, evidence, locationText, 0.12);

  const hasHvac = HVAC_OBJECT.test(primaryText);
  const hasElectrical = ELECTRICAL_OBJECT.test(primaryText);
  const hasHydraulic = HYDRAULIC_OBJECT.test(primaryText);

  if (SHOWER_HYDRAULIC.test(primaryText)) {
    scores.Hidráulica += 150;
    scores.Elétrica = Math.min(scores.Elétrica, 45);
    evidence.unshift("agente técnico: chuveiro com falha hidráulica");
  } else if (SHOWER_ELECTRICAL.test(primaryText)) {
    scores.Elétrica += 150;
    scores.Hidráulica = Math.min(scores.Hidráulica, 45);
    evidence.unshift("agente técnico: troca/falha elétrica de chuveiro");
  }

  if (OBSTRUCTION.test(primaryText)) {
    scores.Hidráulica += 125;
    scores.Limpeza = Math.min(scores.Limpeza, 25);
    scores.Civil = Math.min(scores.Civil, 25);
    evidence.unshift("agente técnico: desentupimento/obstrução é Hidráulica");
  }

  if (WATER_FAILURE.test(primaryText) && !hasHvac) {
    scores.Hidráulica += 72;
    evidence.unshift("agente técnico: vazamento/falha de água identificado");
  }

  if (ELECTRICAL_FAILURE.test(primaryText) && hasElectrical) {
    scores.Elétrica += 60;
    evidence.unshift("agente técnico: falha elétrica explícita identificada");
  }

  // HVAC explícito mantém o domínio de Refrigeração mesmo quando há termos
  // genéricos de vazamento/energia na descrição do equipamento.
  if (hasHvac) {
    scores.Civil = Math.min(scores.Civil, scores.Refrigeração * 0.22);
    scores.Hidráulica = Math.min(scores.Hidráulica, scores.Refrigeração * 0.5);
  }

  // Regra operacional solicitada: Civil não absorve corretivas técnicas de
  // elétrica/hidráulica. Quando o componente técnico está claro, Civil e
  // Limpeza ficam apenas como evidência residual.
  if (hasElectrical && !hasHydraulic && !hasHvac) {
    scores.Civil = Math.min(scores.Civil, scores.Elétrica * 0.18);
    scores.Limpeza = Math.min(scores.Limpeza, scores.Elétrica * 0.18);
  }

  if (hasHydraulic && !hasElectrical && !hasHvac) {
    scores.Civil = Math.min(scores.Civil, scores.Hidráulica * 0.18);
    scores.Limpeza = Math.min(scores.Limpeza, scores.Hidráulica * 0.18);
  }

  const ordered = (Object.entries(scores) as Array<[Equipe, number]>).sort(
    (a, b) => b[1] - a[1],
  );
  const [topTeam, topScore] = ordered[0];
  const [, secondScore] = ordered[1];

  if (topScore <= 0) {
    return {
      equipe: null,
      decisive: false,
      ambiguous: true,
      scores,
      evidence: [],
    };
  }

  const gap = topScore - secondScore;
  const ambiguous = secondScore > 0 && gap < Math.max(24, topScore * 0.2);
  const decisive = topScore >= 88 && !ambiguous;

  return {
    equipe: topTeam,
    decisive,
    ambiguous,
    scores,
    evidence: [...new Set(evidence)].slice(0, 6),
  };
}
