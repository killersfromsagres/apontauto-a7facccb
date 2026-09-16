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
 * Elétrica=âmbar, Hidráulica=azul, Civil=violeta, Chaveiro=ardósia,
 * Pintura=rosa, Refrigeração=ciano e Limpeza=verde.
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
  eletrica: {
    row: "border-l-4 border-amber-400 bg-amber-50/70 hover:bg-amber-100/70 dark:bg-amber-500/[0.08] dark:hover:bg-amber-500/[0.14]",
    dot: "bg-amber-400",
    badge: "border-amber-400/40 bg-amber-400/12 text-amber-800 dark:text-amber-200",
    button: "border-amber-400/45 bg-amber-400/12 text-amber-800 dark:text-amber-100",
    menu: "border-amber-400/25 bg-amber-400/10 text-amber-800 dark:text-amber-100",
    hex: "#F59E0B",
  },
  hidraulica: {
    row: "border-l-4 border-blue-400 bg-blue-50/70 hover:bg-blue-100/70 dark:bg-blue-500/[0.08] dark:hover:bg-blue-500/[0.14]",
    dot: "bg-blue-400",
    badge: "border-blue-400/40 bg-blue-400/12 text-blue-800 dark:text-blue-200",
    button: "border-blue-400/45 bg-blue-400/12 text-blue-800 dark:text-blue-100",
    menu: "border-blue-400/25 bg-blue-400/10 text-blue-800 dark:text-blue-100",
    hex: "#3B82F6",
  },
  civil: {
    row: "border-l-4 border-violet-400 bg-violet-50/70 hover:bg-violet-100/70 dark:bg-violet-500/[0.08] dark:hover:bg-violet-500/[0.14]",
    dot: "bg-violet-400",
    badge: "border-violet-400/40 bg-violet-400/12 text-violet-800 dark:text-violet-200",
    button: "border-violet-400/45 bg-violet-400/12 text-violet-800 dark:text-violet-100",
    menu: "border-violet-400/25 bg-violet-400/10 text-violet-800 dark:text-violet-100",
    hex: "#8B5CF6",
  },
  chaveiro: {
    row: "border-l-4 border-slate-400 bg-slate-50/70 hover:bg-slate-100/70 dark:bg-slate-400/[0.08] dark:hover:bg-slate-400/[0.14]",
    dot: "bg-slate-400",
    badge: "border-slate-400/40 bg-slate-400/12 text-slate-800 dark:text-slate-200",
    button: "border-slate-400/45 bg-slate-400/12 text-slate-800 dark:text-slate-100",
    menu: "border-slate-400/25 bg-slate-400/10 text-slate-800 dark:text-slate-100",
    hex: "#94A3B8",
  },
  pintura: {
    row: "border-l-4 border-pink-400 bg-pink-50/70 hover:bg-pink-100/70 dark:bg-pink-500/[0.08] dark:hover:bg-pink-500/[0.14]",
    dot: "bg-pink-400",
    badge: "border-pink-400/40 bg-pink-400/12 text-pink-800 dark:text-pink-200",
    button: "border-pink-400/45 bg-pink-400/12 text-pink-800 dark:text-pink-100",
    menu: "border-pink-400/25 bg-pink-400/10 text-pink-800 dark:text-pink-100",
    hex: "#EC4899",
  },
  refrigeracao: {
    row: "border-l-4 border-cyan-400 bg-cyan-50/70 hover:bg-cyan-100/70 dark:bg-cyan-500/[0.08] dark:hover:bg-cyan-500/[0.14]",
    dot: "bg-cyan-400",
    badge: "border-cyan-400/40 bg-cyan-400/12 text-cyan-800 dark:text-cyan-200",
    button: "border-cyan-400/45 bg-cyan-400/12 text-cyan-800 dark:text-cyan-100",
    menu: "border-cyan-400/25 bg-cyan-400/10 text-cyan-800 dark:text-cyan-100",
    hex: "#06B6D4",
  },
  limpeza: {
    row: "border-l-4 border-emerald-400 bg-emerald-50/70 hover:bg-emerald-100/70 dark:bg-emerald-500/[0.08] dark:hover:bg-emerald-500/[0.14]",
    dot: "bg-emerald-400",
    badge: "border-emerald-400/40 bg-emerald-400/12 text-emerald-800 dark:text-emerald-200",
    button: "border-emerald-400/45 bg-emerald-400/12 text-emerald-800 dark:text-emerald-100",
    menu: "border-emerald-400/25 bg-emerald-400/10 text-emerald-800 dark:text-emerald-100",
    hex: "#10B981",
  },
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
