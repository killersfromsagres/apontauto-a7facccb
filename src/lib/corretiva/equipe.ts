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
