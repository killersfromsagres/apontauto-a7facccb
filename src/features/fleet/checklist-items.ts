/** Itens do checklist veicular — enxuto, pensado para o celular. */
export type ChecklistGroup = {
  key: string;
  title: string;
  items: { key: string; label: string; critical?: boolean }[];
};

export const CHECKLIST_GROUPS: ChecklistGroup[] = [
  {
    key: "seguranca",
    title: "Segurança",
    items: [
      { key: "freios", label: "Freios", critical: true },
      { key: "pneus", label: "Pneus e estepe", critical: true },
      { key: "cintos", label: "Cintos de segurança", critical: true },
      { key: "luzes", label: "Faróis, setas e lanternas", critical: true },
    ],
  },
  {
    key: "mecanica",
    title: "Mecânica",
    items: [
      { key: "oleo", label: "Nível de óleo" },
      { key: "agua_radiador", label: "Água do radiador" },
      { key: "bateria", label: "Bateria / partida" },
      { key: "vazamentos", label: "Vazamentos aparentes", critical: true },
    ],
  },
  {
    key: "documentos",
    title: "Documentos e itens obrigatórios",
    items: [
      { key: "crlv", label: "CRLV em dia", critical: true },
      { key: "extintor", label: "Extintor / triângulo / macaco" },
      { key: "limpeza", label: "Limpeza interna e externa" },
    ],
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
  ok: "Conforme",
  atencao: "Atenção",
  critico: "Crítico",
};

export const STATUS_TONE: Record<string, string> = {
  ok: "border-emerald-400/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  atencao: "border-amber-400/50 bg-amber-500/15 text-amber-600 dark:text-amber-300",
  critico: "border-rose-400/50 bg-rose-500/15 text-rose-600 dark:text-rose-300",
};

export function overallFrom(statuses: string[]): "ok" | "atencao" | "critico" {
  if (statuses.includes("critico")) return "critico";
  if (statuses.includes("atencao")) return "atencao";
  return "ok";
}
