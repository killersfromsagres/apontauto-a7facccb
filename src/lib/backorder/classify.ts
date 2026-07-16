// Classificador automático de serviço para OS de backorder.
// Ordem de decisão:
//   1) Se a Categoria original mapeia direto para uma das 7 finais, usa.
//   2) Caso contrário, aplica regras de palavras-chave sobre a descrição
//      (case-insensitive, sem acentos), na ordem declarada.
//   3) Fallback → "Gerenciamento".

export const CATEGORIAS = [
  "Chaveiro",
  "Civil",
  "Refrigeração",
  "Elétrica",
  "Hidráulica",
  "Pintura",
  "Gerenciamento",
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
};

const norm = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Mapeamento inicial da Categoria de origem → categoria final. */
const CATEGORIA_ORIGEM: Array<[RegExp, Categoria]> = [
  [/chave/, "Chaveiro"],
  [/civil/, "Civil"],
  [/marcen/, "Civil"],
  [/climat|refrig|ar\s*condic/, "Refrigeração"],
  [/eletr/, "Elétrica"],
  [/hidr/, "Hidráulica"],
  [/pint/, "Pintura"],
];

/** Regras de palavras-chave, aplicadas em ordem. Primeira que casar vence. */
export const KEYWORD_RULES: Array<{ categoria: Categoria; keywords: string[] }> = [
  {
    categoria: "Chaveiro",
    keywords: ["chave", "copia de chave", "abrir porta", "fechadura", "segredo"],
  },
  {
    categoria: "Refrigeração",
    keywords: [
      "ar condicionado",
      "ar-condicionado",
      "climatizacao",
      "vazamento de ar",
      "bebedouro",
      "camara fria",
      "exaustor",
      "split",
    ],
  },
  {
    categoria: "Hidráulica",
    keywords: [
      "torneira",
      "valvula",
      "vazamento",
      "ralo",
      "entupimento",
      "esgoto",
      "caixa d'agua",
      "caixa dagua",
      "acessorio sanitario",
      "vaso sanitario",
      "descarga",
      "sifao",
      "mictorio",
    ],
  },
  {
    categoria: "Elétrica",
    keywords: [
      "circuito eletrico",
      "iluminacao",
      "interruptor",
      "luminaria",
      "tomada",
      "lampada",
      "cabo",
      "fio",
      "quadro eletrico",
      "disjuntor",
      "reator",
    ],
  },
  {
    categoria: "Pintura",
    keywords: ["pintar", "pintura", "repintura", "tinta"],
  },
  {
    categoria: "Civil",
    keywords: [
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
      "alvenaria",
      "gesso",
      "forro",
      "piso",
      "revestimento",
      "parede",
    ],
  },
  {
    categoria: "Gerenciamento",
    keywords: [
      "acompanhamento tecnico",
      "apoio evento",
      "os migrada",
      "utilidades",
      "limpeza",
      "jardin",
      "paisag",
      "outros",
    ],
  },
];

export function classifyBackorder(input: {
  descricao?: string;
  categoria?: string;
  servico?: string;
}): Categoria {
  const cat = norm(input.categoria);
  for (const [re, out] of CATEGORIA_ORIGEM) if (re.test(cat)) return out;

  const hay = [input.descricao, input.servico, input.categoria].map(norm).join(" | ");
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (hay.includes(norm(kw))) return rule.categoria;
    }
  }
  return "Gerenciamento";
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
};
