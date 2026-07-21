// Classificador de Equipes por texto do Nome da OS.
// Regras determinísticas, ponderadas, com detecção de ambiguidade.
// Retorna uma das 5 equipes do processo e um flag de baixa confiança.
//
// Equipes finais alinhadas ao processo do usuário:
//   Chaveiro, Civil, Refrigeração, Hidráulica, Elétrica
// (Pintura/Demarcação/Gerenciamento são absorvidos em Civil, conforme o
//  critério manual: pintura e demarcação de piso viram Civil.)

import type { Categoria } from "./classify";

export type Equipe = "Chaveiro" | "Civil" | "Refrigeração" | "Hidráulica" | "Elétrica" | "Pintura";

export const EQUIPES: readonly Equipe[] = [
  "Chaveiro",
  "Civil",
  "Refrigeração",
  "Hidráulica",
  "Elétrica",
  "Pintura",
] as const;

export const EQUIPE_COR: Record<Equipe, string> = {
  Chaveiro: "#EAB308",
  Civil: "#A16207",
  Refrigeração: "#06B6D4",
  Hidráulica: "#3B82F6",
  Elétrica: "#F59E0B",
  Pintura: "#EC4899",
};

const norm = (v: unknown) =>
  " " +
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim() +
  " ";

interface Rule {
  equipe: Equipe;
  /** Peso maior = maior evidência. Termos muito específicos usam peso 3+. */
  peso: number;
  /** Termos (em minúsculo, sem acento) — casados como substring com bordas. */
  termos: string[];
}

// A ordem não importa: o motor soma pesos por equipe.
// Pesos: 4 = evidência decisiva (equipamento/serviço próprio da equipe),
//         3 = forte (termo específico), 2 = média, 1 = fraca/genérica.
const RULES: Rule[] = [
  // ---------------- Chaveiro ----------------
  {
    equipe: "Chaveiro",
    peso: 4,
    termos: [
      "fechadura", "miolo", "miolo de fechadura", "cadeado", "chaveiro",
      "copia de chave", "copiar chave", "confeccao de chave", "fazer chave",
      "destrancar", "destravar porta", "porta travada", "porta trancada",
      "chave quebrada", "abrir porta", "abrir gaveta", "gaveta travada",
    ],
  },
  {
    equipe: "Chaveiro",
    peso: 3,
    termos: [
      "macaneta", "lingueta", "trinco", "cilindro", "segredo",
      "papeleira", "saboneteira", "dispenser", "suporte de papel",
      "porta papel", "porta toalha", "porta sabonete",
      "fixar", "fixacao", "parafusar", "instalar suporte",
    ],
  },
  {
    equipe: "Chaveiro",
    peso: 2,
    termos: ["chave", "porta", "amortecedor de porta", "mola de porta"],
  },

  // ---------------- Hidráulica ----------------
  {
    equipe: "Hidráulica",
    peso: 4,
    termos: [
      "vazamento", "vazando", "entupimento", "entupido", "entupida",
      "descarga", "vaso sanitario", "vaso sanitario entupido",
      "torneira", "torneira pingando", "torneira vazando",
      "sifao", "ralo", "ralo entupido", "bebedouro", "purificador de agua",
      "mictorio", "mictorio entupido",
      "chuveiro vazando", "canopla",
    ],
  },
  {
    equipe: "Hidráulica",
    peso: 3,
    termos: [
      "registro", "registro de agua", "valvula", "valvula hidraulica",
      "tubulacao", "encanamento", "esgoto", "caixa d agua", "caixa dagua",
      "bomba d agua", "bomba dagua", "pia", "cuba", "lavatorio",
      "hidraulica", "hidraulico",
      "sem agua", "falta de agua", "sanitario",
    ],
  },
  {
    equipe: "Hidráulica",
    peso: 2,
    termos: ["agua", "vazao", "pressao de agua", "boia", "boia da caixa"],
  },

  // ---------------- Elétrica ----------------
  {
    equipe: "Elétrica",
    peso: 4,
    termos: [
      "lampada", "lampada queimada", "trocar lampada", "luminaria", "refletor",
      "spot", "globo", "iluminacao", "iluminacao queimada",
      "tomada", "tomada queimada", "interruptor",
      "disjuntor", "quadro eletrico", "painel eletrico", "curto circuito",
      "curto", "sem energia", "sem luz", "falta de energia",
      "chuveiro eletrico", "chuveiro nao aquece", "chuveiro queimado",
      "resistencia do chuveiro",
    ],
  },
  {
    equipe: "Elétrica",
    peso: 3,
    termos: [
      "eletrica", "eletrico", "cabeamento", "cabo de rede", "rede logica",
      "ponto de energia", "ponto eletrico", "aterramento", "reator",
      "antena", "hdmi", "tv sem sinal", "instalacao eletrica",
      "fiacao", "fio", "descarga eletrica",
    ],
  },
  {
    equipe: "Elétrica",
    peso: 2,
    termos: ["energia", "iluminar", "acender", "apagar", "carregador", "no break"],
  },

  // ---------------- Climatização e Refrigeração ----------------
  {
    equipe: "Refrigeração",
    peso: 4,
    termos: [
      "ar condicionado", "ar-condicionado", "arcondicionado", "split",
      "condensadora", "evaporadora", "climatizacao", "climatizador",
      "geladeira", "freezer", "camara fria", "camara frigorifica",
      "chiller", "vrf", "hvac", "refrigerador",
      "ar quente", "ar frio", "nao gela", "nao esta gelando",
      "falta de gas", "carga de gas", "gas refrigerante",
    ],
  },
  {
    equipe: "Refrigeração",
    peso: 3,
    termos: ["refrigeracao", "climatizado", "temperatura", "exaustor", "insuflamento"],
  },

  // ---------------- Pintura ----------------
  {
    equipe: "Pintura",
    peso: 4,
    termos: [
      "pintura", "pintar", "repintura", "repintar", "tinta", "textura", "verniz",
      "demarcacao de piso", "sinalizacao de piso", "faixa de piso", "faixa amarela",
      "pintura de piso", "pintura de parede", "retoque de pintura",
    ],
  },
  {
    equipe: "Pintura",
    peso: 3,
    termos: ["demarcacao", "sinalizacao", "descascado", "descascando", "parede manchada"],
  },

  // ---------------- Civil ----------------
  {
    equipe: "Civil",
    peso: 4,
    termos: [
      "alvenaria", "infiltracao", "telhado", "telha", "calha", "forro",
      "gesso", "drywall", "reboco", "trinca", "rachadura",
      "piso", "piso quebrado", "piso solto", "azulejo", "revestimento",
      "calcada", "buraco no piso", "buraco",
      "guarda corpo", "guarda-corpo", "corrimao",
      "jardinagem", "poda", "capina", "limpeza de area", "limpeza geral",
      "limpeza de vidros", "limpeza de placa",
      "mobiliario", "mesa", "cadeira", "armario", "estante",
      "montar", "montagem", "transferir", "mudanca de layout",
      "batente", "esquadria", "porta e batente", "trocar porta",
      "vidro", "trocar vidro",
    ],
  },
  {
    equipe: "Civil",
    peso: 3,
    termos: [
      "civil", "obra", "reforma", "reparo estrutural", "parede",
      "teto", "carpete", "marcenaria", "suporte de tv",
      "retirar material", "descarte", "estrutural",
    ],
  },
  {
    equipe: "Civil",
    peso: 2,
    termos: ["organizar", "instalar quadro", "quadro de aviso", "placa"],
  },
];

/** Termos que forçam Refrigeração mesmo quando aparecem em contexto elétrico
 *  (evita classificar "ar condicionado sem energia" como Elétrica). */
const REFRIG_LOCK = [
  "ar condicionado",
  "ar-condicionado",
  "arcondicionado",
  "split",
  "geladeira",
  "freezer",
  "camara fria",
  "chiller",
  "vrf",
];

/** Termos que forçam Hidráulica quando o contexto é vazamento em tubulação
 *  mesmo que apareçam palavras como "chuveiro" (parte hidráulica). */
const HIDR_LOCK = [
  "vazamento",
  "entupimento",
  "entupido",
  "torneira",
  "registro de agua",
  "vaso sanitario",
  "descarga",
  "sifao",
  "ralo",
  "esgoto",
];

/** "chuveiro eletrico" (aparelho) vs "chuveiro" (peça hidráulica). */
const CHUVEIRO_ELETRICO_RE = /\bchuveiro\s*(eletrico|nao\s*aquece|queimado|frio|resistencia)/;
const CHUVEIRO_HIDR_RE = /\bchuveiro\s*(vazando|pingando|canopla|registro|manopla)/;

export interface TeamClassificationResult {
  equipe: Equipe;
  confianca: "alta" | "media" | "baixa";
  ambiguo: boolean;
  /** Score por equipe (para debug/UI). */
  scores: Record<Equipe, number>;
  /** Segunda equipe em disputa (quando ambíguo). */
  segunda?: Equipe;
}

/** Classifica pelo texto do Nome (descrição da OS).
 *  - Retorna sempre uma equipe (fallback: Civil, marcada como ambígua).
 *  - `ambiguo=true` quando a diferença entre 1º e 2º lugar for pequena
 *    (< 40% de vantagem) — usar para marcar "Classificação sugerida – revisar". */
export function classifyTeamByText(nome: string): TeamClassificationResult {
  const text = norm(nome);

  // Chuveiro elétrico vs hidráulico — desambigua cedo.
  const forceEletrico = CHUVEIRO_ELETRICO_RE.test(text);
  const forceHidr = CHUVEIRO_HIDR_RE.test(text);

  const scores: Record<Equipe, number> = {
    Chaveiro: 0,
    Civil: 0,
    Refrigeração: 0,
    Hidráulica: 0,
    Elétrica: 0,
    Pintura: 0,
  };

  for (const rule of RULES) {
    for (const termo of rule.termos) {
      const t = ` ${termo} `;
      if (text.includes(t)) scores[rule.equipe] += rule.peso;
    }
  }

  // Locks contextuais.
  if (REFRIG_LOCK.some((k) => text.includes(` ${k} `))) {
    scores.Refrigeração += 6;
    scores.Elétrica = Math.max(0, scores.Elétrica - 3);
  }
  if (HIDR_LOCK.some((k) => text.includes(` ${k} `))) {
    scores.Hidráulica += 3;
  }
  if (forceEletrico) {
    scores.Elétrica += 6;
    scores.Hidráulica = Math.max(0, scores.Hidráulica - 4);
  }
  if (forceHidr) {
    scores.Hidráulica += 6;
    scores.Elétrica = Math.max(0, scores.Elétrica - 4);
  }

  const ordered = (Object.entries(scores) as Array<[Equipe, number]>).sort(
    (a, b) => b[1] - a[1],
  );
  const [top, topScore] = ordered[0];
  const [segunda, segScore] = ordered[1];

  // Sem qualquer sinal → cai em Civil e sinaliza ambiguidade para revisão.
  if (topScore === 0) {
    return {
      equipe: "Civil",
      confianca: "baixa",
      ambiguo: true,
      scores,
      segunda,
    };
  }

  // Diferença curta entre 1º e 2º → ambíguo.
  const vantagem = segScore === 0 ? 1 : (topScore - segScore) / topScore;
  const ambiguo = vantagem < 0.4 && segScore > 0;
  const confianca: TeamClassificationResult["confianca"] =
    topScore >= 6 && !ambiguo ? "alta" : ambiguo ? "baixa" : "media";

  return {
    equipe: top,
    confianca,
    ambiguo,
    scores,
    segunda: ambiguo ? segunda : undefined,
  };
}

/** Mapeia Equipe (5 grupos) → Categoria (tipo já existente no sistema).
 *  Como o schema atual usa Categoria, mantemos compatibilidade sem migrar dados. */
export function equipeToCategoria(equipe: Equipe): Categoria {
  return equipe as Categoria; // as 5 equipes são um subconjunto direto de Categoria
}
