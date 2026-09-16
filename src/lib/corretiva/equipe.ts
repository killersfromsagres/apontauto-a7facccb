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
 * Paleta operacional consistente em todo o Corretiva Novo:
 * Elétrica=âmbar, Hidráulica=laranja, Civil=verde água, Chaveiro=roxo,
 * Pintura=rosa, Refrigeração=azul claro e Limpeza=verde.
 */
export type EquipeStyles = {
  row: string;
  dot: string;
  badge: string;
  button: string;
  menu: string;
  hex: string;
};


const STYLES: Record<string, EquipeStyles> = {
  eletrica: { row: "border-l-4 border-amber-400 bg-amber-50/70 hover:bg-amber-100/70 dark:bg-amber-500/[0.08] dark:hover:bg-amber-500/[0.14]", dot: "bg-amber-400", badge: "border-amber-400/50 bg-amber-500/[0.16] text-amber-800 dark:text-amber-100", button: "border-amber-400/50 bg-amber-500/[0.14] text-amber-800 dark:text-amber-100", menu: "border-amber-400/30 bg-amber-500/[0.12] text-amber-800 dark:text-amber-100", hex: "#F59E0B" },
  hidraulica: { row: "border-l-4 border-orange-400 bg-orange-50/70 hover:bg-orange-100/70 dark:bg-orange-500/[0.08] dark:hover:bg-orange-500/[0.14]", dot: "bg-orange-400", badge: "border-orange-400/50 bg-orange-500/[0.16] text-orange-800 dark:text-orange-100", button: "border-orange-400/50 bg-orange-500/[0.14] text-orange-800 dark:text-orange-100", menu: "border-orange-400/30 bg-orange-500/[0.12] text-orange-800 dark:text-orange-100", hex: "#F97316" },
  civil: { row: "border-l-4 border-teal-400 bg-teal-50/70 hover:bg-teal-100/70 dark:bg-teal-500/[0.08] dark:hover:bg-teal-500/[0.14]", dot: "bg-teal-400", badge: "border-teal-300/55 bg-teal-400/[0.16] text-teal-800 dark:text-teal-100", button: "border-teal-300/55 bg-teal-400/[0.14] text-teal-800 dark:text-teal-100", menu: "border-teal-300/35 bg-teal-400/[0.12] text-teal-800 dark:text-teal-100", hex: "#2DD4BF" },
  chaveiro: { row: "border-l-4 border-violet-400 bg-violet-50/70 hover:bg-violet-100/70 dark:bg-violet-500/[0.08] dark:hover:bg-violet-500/[0.14]", dot: "bg-violet-400", badge: "border-violet-400/50 bg-violet-500/[0.16] text-violet-800 dark:text-violet-100", button: "border-violet-400/50 bg-violet-500/[0.14] text-violet-800 dark:text-violet-100", menu: "border-violet-400/30 bg-violet-500/[0.12] text-violet-800 dark:text-violet-100", hex: "#8B5CF6" },
  pintura: { row: "border-l-4 border-pink-400 bg-pink-50/70 hover:bg-pink-100/70 dark:bg-pink-500/[0.08] dark:hover:bg-pink-500/[0.14]", dot: "bg-pink-400", badge: "border-pink-400/50 bg-pink-500/[0.16] text-pink-800 dark:text-pink-100", button: "border-pink-400/50 bg-pink-500/[0.14] text-pink-800 dark:text-pink-100", menu: "border-pink-400/30 bg-pink-500/[0.12] text-pink-800 dark:text-pink-100", hex: "#EC4899" },
  refrigeracao: { row: "border-l-4 border-sky-400 bg-sky-50/70 hover:bg-sky-100/70 dark:bg-sky-500/[0.08] dark:hover:bg-sky-500/[0.14]", dot: "bg-sky-400", badge: "border-sky-300/55 bg-sky-400/[0.16] text-sky-800 dark:text-sky-100", button: "border-sky-300/55 bg-sky-400/[0.14] text-sky-800 dark:text-sky-100", menu: "border-sky-300/35 bg-sky-400/[0.12] text-sky-800 dark:text-sky-100", hex: "#38BDF8" },
  limpeza: { row: "border-l-4 border-emerald-400 bg-emerald-50/70 hover:bg-emerald-100/70 dark:bg-emerald-500/[0.08] dark:hover:bg-emerald-500/[0.14]", dot: "bg-emerald-400", badge: "border-emerald-400/50 bg-emerald-500/[0.16] text-emerald-800 dark:text-emerald-100", button: "border-emerald-400/50 bg-emerald-500/[0.14] text-emerald-800 dark:text-emerald-100", menu: "border-emerald-400/30 bg-emerald-500/[0.12] text-emerald-800 dark:text-emerald-100", hex: "#22C55E" },
};

const NEUTRAL: EquipeStyles = {
  row: "border-l-4 border-transparent hover:bg-accent/60",
  dot: "bg-muted-foreground/40",
  badge: "border-white/10 bg-white/[0.04] text-muted-foreground",
  button: "border-white/10 bg-white/[0.04] text-foreground",
  menu: "border-white/10 bg-white/[0.04] text-foreground",
  hex: "#94A3B8",
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
  if (n.includes("refrig") || n.includes("ar condicionado") || n.includes("climatiza")) return STYLES.refrigeracao;
  if (n.includes("limpeza") || n.includes("higien") || n.includes("conserva") || n.includes("orcamento") || n.includes("compra") || n.includes("gerencia")) return STYLES.limpeza;
  return NEUTRAL;
}

export function equipeHex(equipe: string | null | undefined): string {
  return equipeStyles(equipe).hex;
}
