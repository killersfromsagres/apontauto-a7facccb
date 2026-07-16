// Classificação automática da "Atividade" a partir do Nome/Descrição da OS.
// Case-insensitive, sem acento. Empate → primeira categoria da ordem abaixo.

export type Atividade =
  | "Chaveiro"
  | "Civil"
  | "Refrigeração"
  | "Elétrica"
  | "Hidráulica"
  | "Pintura"
  | "Pintura"
  | "Gerenciamento"
  | "Outros Serviços";

interface Rule {
  atividade: Exclude<Atividade, "Outros Serviços">;
  keywords: string[];
}

// Ordem = prioridade no empate.
export const CLASSIFY_RULES: Rule[] = [
  {
    atividade: "Chaveiro",
    keywords: ["chave", "fechadura", "cadeado", "trinco", "cilindro", "copia de chave"],
  },
  {
    atividade: "Civil",
    keywords: [
      "alvenaria", "piso", "parede", "teto", "forro", "revestimento", "telha",
      "calcada", "drywall", "reparo estrutural", "trinca", "infiltracao estrutural",
    ],
  },
  {
    atividade: "Refrigeração",
    keywords: [
      "ar condicionado", "split", "climatiz", "geladeira", "camara fria",
      "freezer", "chiller", "bebedouro",
    ],
  },
  {
    atividade: "Elétrica",
    keywords: [
      "eletric", "eletr", "tomada", "disjuntor", "lampada", "iluminacao",
      "quadro eletrico", "cabo", "fiacao", "luminaria",
    ],
  },
  {
    atividade: "Hidráulica",
    keywords: [
      "hidraulic", "vazamento", "torneira", "valvula", "registro",
      "encanamento", "esgoto", "caixa d agua", "caixa dagua", "bomba", "ralo",
    ],
  },
  {
    atividade: "Pintura",
    keywords: ["pintura", "pintar", "repintura", "textura", "verniz", "retoque de tinta"],
  },
  {
    atividade: "Gerenciamento",
    keywords: [
      "administrativo", "gestao", "acompanhamento", "vistoria", "relatorio",
      "sla", "plano preventivo", "rotina de inspecao", "gerenciamento",
    ],
  },
];

const norm = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function classifyAtividade(nome: string): Atividade {
  const text = norm(nome);
  if (!text.trim()) return "Outros Serviços";
  let bestCount = 0;
  let best: Atividade = "Outros Serviços";
  for (const rule of CLASSIFY_RULES) {
    let count = 0;
    for (const kw of rule.keywords) if (text.includes(kw)) count++;
    if (count > bestCount) {
      bestCount = count;
      best = rule.atividade;
    }
  }
  return best;
}

export const ATIVIDADES: Atividade[] = [
  "Chaveiro",
  "Civil",
  "Refrigeração",
  "Elétrica",
  "Hidráulica",
  "Pintura",
  "Gerenciamento",
  "Outros Serviços",
];

export const ATIVIDADE_COLOR: Record<Atividade, string> = {
  Chaveiro: "#EAB308",
  Civil: "#2563EB",
  Refrigeração: "#06B6D4",
  Elétrica: "#DC2626",
  Hidráulica: "#F97316",
  Pintura: "#9333EA",
  Gerenciamento: "#0F766E",
  "Outros Serviços": "#6B7280",
};
