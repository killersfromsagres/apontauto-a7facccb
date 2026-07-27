// Filtro de equipe para colaboradores de Corretiva.
// A lista de equipes vem do banco (tabela corretiva_equipes) e é editável pelo admin.

export type EquipeFiltro = "todas" | string;

const KEY = "corretiva.minhaEquipe";

export function loadEquipe(): EquipeFiltro {
  if (typeof window === "undefined") return "todas";
  return window.localStorage.getItem(KEY) || "todas";
}

export function saveEquipe(v: EquipeFiltro) {
  if (typeof window === "undefined") return;
  if (v === "todas") window.localStorage.removeItem(KEY);
  else window.localStorage.setItem(KEY, v);
}

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function matchEquipe(osEquipe: string | null | undefined, filtro: EquipeFiltro): boolean {
  if (filtro === "todas") return true;
  return norm(osEquipe) === norm(filtro);
}

/**
 * Cores fluorescentes por equipe de corretiva:
 *  Hidráulica  → laranja fluorescente
 *  Civil       → verde água fluorescente
 *  Chaveiro    → roxo fluorescente
 *  Elétrica    → verde fluorescente
 *  Pintura     → rosa fluorescente
 *  Refrigeração→ azul bebê fluorescente (corretiva, não preventiva)
 */
export type EquipeStyles = { row: string; dot: string; badge: string };

const STYLES: Record<string, EquipeStyles> = {
  hidraulica: {
    row: "border-l-4 border-orange-400 bg-orange-50/70 hover:bg-orange-100/70 dark:bg-orange-500/10 dark:hover:bg-orange-500/20",
    dot: "bg-orange-400 shadow-[0_0_8px_2px_rgba(251,146,60,0.85)]",
    badge:
      "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-500/20 dark:text-orange-200 dark:border-orange-400/50 dark:shadow-[0_0_10px_-2px_rgba(251,146,60,0.7)]",
  },
  civil: {
    row: "border-l-4 border-teal-400 bg-teal-50/70 hover:bg-teal-100/70 dark:bg-teal-500/10 dark:hover:bg-teal-500/20",
    dot: "bg-teal-300 shadow-[0_0_8px_2px_rgba(45,212,191,0.85)]",
    badge:
      "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-500/20 dark:text-teal-200 dark:border-teal-400/50 dark:shadow-[0_0_10px_-2px_rgba(45,212,191,0.7)]",
  },
  chaveiro: {
    row: "border-l-4 border-purple-400 bg-purple-50/70 hover:bg-purple-100/70 dark:bg-purple-500/10 dark:hover:bg-purple-500/20",
    dot: "bg-purple-400 shadow-[0_0_8px_2px_rgba(192,132,252,0.85)]",
    badge:
      "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-500/20 dark:text-purple-200 dark:border-purple-400/50 dark:shadow-[0_0_10px_-2px_rgba(192,132,252,0.7)]",
  },
  eletrica: {
    row: "border-l-4 border-lime-400 bg-lime-50/70 hover:bg-lime-100/70 dark:bg-lime-500/10 dark:hover:bg-lime-500/20",
    dot: "bg-lime-400 shadow-[0_0_8px_2px_rgba(163,230,53,0.85)]",
    badge:
      "bg-lime-100 text-lime-800 border-lime-300 dark:bg-lime-500/20 dark:text-lime-200 dark:border-lime-400/50 dark:shadow-[0_0_10px_-2px_rgba(163,230,53,0.7)]",
  },
  pintura: {
    row: "border-l-4 border-pink-400 bg-pink-50/70 hover:bg-pink-100/70 dark:bg-pink-500/10 dark:hover:bg-pink-500/20",
    dot: "bg-pink-400 shadow-[0_0_8px_2px_rgba(244,114,182,0.85)]",
    badge:
      "bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-500/20 dark:text-pink-200 dark:border-pink-400/50 dark:shadow-[0_0_10px_-2px_rgba(244,114,182,0.7)]",
  },
  refrigeracao: {
    row: "border-l-4 border-sky-300 bg-sky-50/70 hover:bg-sky-100/70 dark:bg-sky-400/10 dark:hover:bg-sky-400/20",
    dot: "bg-sky-300 shadow-[0_0_8px_2px_rgba(125,211,252,0.9)]",
    badge:
      "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-400/20 dark:text-sky-200 dark:border-sky-300/50 dark:shadow-[0_0_10px_-2px_rgba(125,211,252,0.75)]",
  },
};

const NEUTRAL: EquipeStyles = {
  row: "border-l-4 border-transparent hover:bg-accent/60",
  dot: "bg-muted-foreground/40",
  badge: "",
};

/** Resolve o estilo de uma equipe (tolerante a acentos, sufixos e variações). */
export function equipeStyles(equipe: string | null | undefined): EquipeStyles {
  const n = norm(equipe);
  if (!n) return NEUTRAL;
  for (const key of Object.keys(STYLES)) {
    if (n.includes(key)) return STYLES[key];
  }
  if (n.includes("eletric")) return STYLES.eletrica;
  if (n.includes("hidraul")) return STYLES.hidraulica;
  if (n.includes("refrig") || n.includes("ar condicionado") || n.includes("climatiza"))
    return STYLES.refrigeracao;
  return NEUTRAL;
}
