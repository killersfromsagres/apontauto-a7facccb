/** Itens oficiais do certificado de inspeção veicular In-Haus. */
export type ChecklistGroup = {
  key: string;
  title: string;
  items: { key: string; label: string; critical?: boolean }[];
};

export const OFFICIAL_CHECKLIST_ITEMS = [
  { key: "nivel_oleo", label: "Nível de óleo" },
  { key: "troca_oleo", label: "Troca de óleo em dia" },
  { key: "kit_roda_macaco", label: "Kit (chave de roda e macaco)" },
  { key: "estepe", label: "Estepe", critical: true },
  { key: "farois", label: "Faróis", critical: true },
  { key: "lanternas", label: "Lanternas", critical: true },
  { key: "limpador_parabrisa", label: "Limpador de para-brisa" },
  { key: "pneus", label: "Pneus", critical: true },
  { key: "freios", label: "Freios", critical: true },
  { key: "documento_veiculo", label: "Documento do veículo", critical: true },
  { key: "combustivel", label: "Combustível" },
  { key: "lataria_pintura", label: "Lataria e pintura" },
] as const;

export const CHECKLIST_GROUPS: ChecklistGroup[] = [
  {
    key: "certificado_in_haus",
    title: "Check List de Itens",
    items: OFFICIAL_CHECKLIST_ITEMS.map((item) => ({ ...item })),
  },
];

export const PHOTO_CATEGORIES = [
  { key: "frente", label: "Frente" },
  { key: "traseira", label: "Traseira" },
  { key: "lateral_esquerda", label: "Lateral esquerda" },
  { key: "lateral_direita", label: "Lateral direita" },
  { key: "painel", label: "Painel / KM" },
  { key: "interior", label: "Interior" },
  { key: "avarias", label: "Avarias" },
] as const;

export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number]["key"];

export const STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  nok: "N/OK",
  atencao: "N/OK",
  critico: "N/OK",
};

export const STATUS_TONE: Record<string, string> = {
  ok: "border-emerald-400/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  nok: "border-rose-400/50 bg-rose-500/15 text-rose-600 dark:text-rose-300",
  atencao: "border-amber-400/50 bg-amber-500/15 text-amber-600 dark:text-amber-300",
  critico: "border-rose-400/50 bg-rose-500/15 text-rose-600 dark:text-rose-300",
};

export function overallFrom(statuses: string[]): "ok" | "atencao" {
  return statuses.some((status) => status !== "ok") ? "atencao" : "ok";
}
