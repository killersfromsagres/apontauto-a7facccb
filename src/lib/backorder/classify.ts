// Classificador automático de serviço para OS de backorder.
// Ordem de decisão:
//   1) Se a Categoria original mapeia direto para uma das categorias finais, usa —
//      exceto quando há sinais de Pintura na descrição (Pintura tem prioridade).
//   2) Caso contrário, aplica regras de palavras-chave sobre a descrição
//      (case-insensitive, sem acentos), na ordem declarada.
//   3) Regra especial: se casou "Civil" e a descrição menciona pintura /
//      demarcação / sinalização de piso, reclassifica como "Pintura".
//   4) Fallback → "Outros" (para revisão manual).

export const CATEGORIAS = [
  "Chaveiro",
  "Civil",
  "Refrigeração",
  "Elétrica",
  "Hidráulica",
  "Pintura",
  "Gerenciamento",
  "Outros",
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const CATEGORIA_COLOR: Record<Categoria, string> = {
  Chaveiro: "#EAB308",
  Civil: "#A16207",
  Refrigeração: "#06B6D4",
  Elétrica: "#F59E0B",
  Hidráulica: "#3B82F6",
  Pintura: "#EC4899",
  Gerenciamento: "#64748B",
  Outros: "#FBBF24",
};

const norm = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Mapeamento inicial da Categoria de origem → categoria final. */
const CATEGORIA_ORIGEM: Array<[RegExp, Categoria]> = [
  [/chave/, "Chaveiro"],
  [/climat|refrig|ar\s*condic/, "Refrigeração"],
  [/eletr/, "Elétrica"],
  [/hidr/, "Hidráulica"],
  [/pint/, "Pintura"],
  [/civil|marcen/, "Civil"],
];

/** Regras de palavras-chave, aplicadas em ordem. Primeira que casar vence.
 *  Pintura vem antes de Civil de propósito, e há uma regra final que
 *  reclassifica Civil→Pintura se a descrição mencionar pintura/demarcação. */
export const KEYWORD_RULES: Array<{ categoria: Categoria; keywords: string[] }> = [
  {
    categoria: "Chaveiro",
    keywords: ["chave", "fechadura", "cadeado", "trinco", "cilindro", "macaneta", "segredo", "abrir porta"],
  },
  {
    categoria: "Refrigeração",
    keywords: [
      "ar condicionado",
      "ar-condicionado",
      "split",
      "climatizacao",
      "geladeira",
      "camara fria",
      "freezer",
      "chiller",
      "bebedouro",
      "refrigerador",
      "vazamento de ar",
      "exaustor",
    ],
  },
  {
    categoria: "Hidráulica",
    keywords: [
      "hidraulica",
      "vazamento",
      "torneira",
      "valvula",
      "registro",
      "encanamento",
      "esgoto",
      "caixa d'agua",
      "caixa dagua",
      "bomba",
      "ralo",
      "descarga",
      "sifao",
      "mictorio",
      "vaso sanitario",
      "acessorio sanitario",
      "entupimento",
    ],
  },
  {
    categoria: "Elétrica",
    keywords: [
      "eletrica",
      "circuito eletrico",
      "tomada",
      "disjuntor",
      "lampada",
      "iluminacao",
      "quadro eletrico",
      "cabo",
      "fiacao",
      "luminaria",
      "interruptor",
      "reator",
      "infraestrutura eletrica",
    ],
  },
  {
    categoria: "Pintura",
    keywords: [
      "pintar",
      "pintura",
      "repintura",
      "tinta",
      "textura",
      "verniz",
      "demarcacao de piso",
      "sinalizacao de piso",
      "faixa de piso",
    ],
  },
  {
    categoria: "Civil",
    keywords: [
      "alvenaria",
      "piso",
      "parede",
      "teto",
      "forro",
      "revestimento",
      "telha",
      "calcada",
      "drywall",
      "estrutural",
      "trinca",
      "gesso",
      "reboco",
      "batente",
      "esquadria",
      "carpete",
      "porta",
      "janela",
      "mobiliario",
      "layout",
      "quadro",
      "suporte",
      "dispenser",
      "retirar material",
      "marcenaria",
    ],
  },
];

/** Palavras que forçam Pintura mesmo que caia em Civil. */
const PINTURA_OVERRIDE = [
  "pintura",
  "pintar",
  "repintura",
  "tinta",
  "verniz",
  "demarcacao de piso",
  "sinalizacao de piso",
  "faixa de piso",
];

export interface DynamicRule {
  equipe: Categoria;
  palavra_chave: string;
  fonte: "descricao" | "categoria";
  prioridade: number;
}

/** Regras dinâmicas carregadas do banco (via setDynamicRules).
 *  Quando definidas, substituem as regras hardcoded padrão. */
let DYNAMIC_RULES: DynamicRule[] | null = null;

export function setDynamicRules(rules: DynamicRule[] | null): void {
  DYNAMIC_RULES = rules && rules.length > 0 ? [...rules].sort((a, b) => a.prioridade - b.prioridade) : null;
}

export function classifyBackorder(input: {
  descricao?: string;
  categoria?: string;
  servico?: string;
}): Categoria {
  const desc = norm([input.descricao, input.servico].filter(Boolean).join(" | "));
  const cat = norm(input.categoria);

  // -- Modo dinâmico (regras do banco) -------------------------------
  if (DYNAMIC_RULES) {
    for (const rule of DYNAMIC_RULES) {
      const haystack = rule.fonte === "categoria" ? cat : desc;
      if (haystack.includes(norm(rule.palavra_chave))) return rule.equipe;
    }
    return "Outros";
  }

  // -- Modo estático (fallback quando o banco não respondeu) ---------
  const hay = [input.descricao, input.servico, input.categoria].map(norm).join(" | ");
  let hit: Categoria | null = null;
  for (const [re, out] of CATEGORIA_ORIGEM) {
    if (re.test(cat)) {
      hit = out;
      break;
    }
  }
  if (!hit) {
    for (const rule of KEYWORD_RULES) {
      if (rule.keywords.some((kw) => hay.includes(norm(kw)))) {
        hit = rule.categoria;
        break;
      }
    }
  }
  if (hit === "Civil" && PINTURA_OVERRIDE.some((kw) => hay.includes(norm(kw)))) {
    return "Pintura";
  }
  return hit ?? "Outros";
}

/** Equipe sugerida a partir da categoria (editável na UI). */
export const CATEGORIA_TO_EQUIPE: Record<Categoria, string> = {
  Chaveiro: "CHAVEIRO",
  Civil: "CIVIL",
  Refrigeração: "CLIMATIZAÇÃO E REFRIGERAÇÃO",
  Elétrica: "ELÉTRICA",
  Hidráulica: "HIDRÁULICA",
  Pintura: "CIVIL",
  Gerenciamento: "GERENCIAMENTO",
  Outros: "REVISAR",
};
