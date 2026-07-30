/**
 * Catálogo oficial do checklist veicular (Fase 8).
 * Cada item aceita conforme / não conforme / não se aplica, observação,
 * gravidade e foto obrigatória quando não conforme.
 */

export type ItemStatus = "conforme" | "nao_conforme" | "nao_se_aplica";
export type Severity = "baixa" | "media" | "alta" | "critica";

export type ChecklistItemDef = {
  key: string;
  label: string;
  category: string;
  /** Item cuja falha grave costuma imobilizar o veículo. */
  safetyCritical?: boolean;
  /** Não se aplica a todos os veículos (ex.: extintor). */
  optional?: boolean;
};

export const CHECKLIST_CATEGORIES = [
  "Estrutura externa",
  "Rodagem",
  "Iluminação e sinalização",
  "Visibilidade",
  "Segurança ativa",
  "Cabine e ocupantes",
  "Mecânica e fluidos",
  "Documentos e equipamentos",
  "Conservação",
] as const;

export const CHECKLIST_ITEMS: ChecklistItemDef[] = [
  { key: "lataria", label: "Lataria e para-choques", category: "Estrutura externa" },
  { key: "portas_vidros", label: "Portas, fechaduras e vidros", category: "Estrutura externa" },
  { key: "pneus_estepe", label: "Pneus e estepe", category: "Rodagem", safetyCritical: true },
  { key: "rodas", label: "Rodas", category: "Rodagem", safetyCritical: true },
  {
    key: "farois",
    label: "Faróis, lanternas e setas",
    category: "Iluminação e sinalização",
    safetyCritical: true,
  },
  {
    key: "luz_freio",
    label: "Luz de freio",
    category: "Iluminação e sinalização",
    safetyCritical: true,
  },
  { key: "limpadores", label: "Limpadores e reservatório", category: "Visibilidade" },
  { key: "retrovisores", label: "Retrovisores", category: "Visibilidade", safetyCritical: true },
  { key: "buzina", label: "Buzina", category: "Segurança ativa" },
  { key: "freios", label: "Freios", category: "Segurança ativa", safetyCritical: true },
  { key: "direcao", label: "Direção", category: "Segurança ativa", safetyCritical: true },
  {
    key: "cintos",
    label: "Cintos de segurança",
    category: "Cabine e ocupantes",
    safetyCritical: true,
  },
  { key: "bancos", label: "Bancos", category: "Cabine e ocupantes" },
  {
    key: "painel",
    label: "Painel e luzes de advertência",
    category: "Cabine e ocupantes",
    safetyCritical: true,
  },
  { key: "oleo", label: "Óleo do motor", category: "Mecânica e fluidos", safetyCritical: true },
  {
    key: "arrefecimento",
    label: "Arrefecimento",
    category: "Mecânica e fluidos",
    safetyCritical: true,
  },
  { key: "vazamentos", label: "Vazamentos", category: "Mecânica e fluidos", safetyCritical: true },
  { key: "bateria", label: "Bateria", category: "Mecânica e fluidos" },
  { key: "documentos", label: "Documentos do veículo", category: "Documentos e equipamentos" },
  {
    key: "triangulo_macaco",
    label: "Triângulo, macaco e chave de roda",
    category: "Documentos e equipamentos",
  },
  {
    key: "extintor",
    label: "Extintor (quando aplicável)",
    category: "Documentos e equipamentos",
    optional: true,
  },
  { key: "limpeza_interna", label: "Limpeza interna", category: "Conservação" },
  { key: "limpeza_externa", label: "Limpeza externa", category: "Conservação" },
  { key: "carga_traseira", label: "Carga e compartimento traseiro", category: "Conservação" },
];

export const PHOTO_SLOTS = [
  { key: "frente", label: "Frente" },
  { key: "traseira", label: "Traseira" },
  { key: "lateral_esquerda", label: "Lateral esquerda" },
  { key: "lateral_direita", label: "Lateral direita" },
  { key: "painel", label: "Painel / quilometragem" },
  { key: "interior", label: "Interior ou compartimento de carga" },
] as const;

export const CHECKLIST_TYPES = [
  { value: "pre_uso", label: "Pré-uso" },
  { value: "pos_uso", label: "Pós-uso" },
  { value: "periodico", label: "Periódico" },
  { value: "devolucao", label: "Devolução" },
] as const;

export const SEVERITY_LABEL: Record<Severity, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

const SEVERITY_WEIGHT: Record<Severity, number> = {
  baixa: 2,
  media: 5,
  alta: 12,
  critica: 30,
};

export type FilledItem = {
  key: string;
  status: ItemStatus;
  severity?: Severity | null;
  notes?: string | null;
};

/** Score 0–100 de integridade do veículo a partir dos itens preenchidos. */
export function computeIntegrityScore(items: FilledItem[]): number {
  let penalty = 0;
  for (const it of items) {
    if (it.status !== "nao_conforme") continue;
    penalty += SEVERITY_WEIGHT[(it.severity ?? "media") as Severity];
  }
  return Math.max(0, Math.min(100, 100 - penalty));
}

export function hasCriticalBlock(items: FilledItem[]): boolean {
  return items.some((i) => i.status === "nao_conforme" && i.severity === "critica");
}

export function overallStatus(items: FilledItem[]): "conforme" | "com_ressalvas" | "nao_conforme" {
  const nc = items.filter((i) => i.status === "nao_conforme");
  if (nc.length === 0) return "conforme";
  if (nc.some((i) => i.severity === "alta" || i.severity === "critica")) return "nao_conforme";
  return "com_ressalvas";
}

/** Protocolo legível: CHK-AAAAMMDD-XXXX */
export function generateProtocol(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CHK-${stamp}-${rand}`;
}
