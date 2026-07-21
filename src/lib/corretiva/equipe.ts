// Filtro de equipe para colaboradores de Corretiva.
// A conta "climatizacao" é compartilhada, então a escolha é persistida
// localmente por dispositivo (localStorage).

export const EQUIPES_REFRIGERACAO = [
  "Corretiva 1",
  "Corretiva 2",
  "Corretiva 3",
] as const;

export type EquipeCorretiva = (typeof EQUIPES_REFRIGERACAO)[number];
export type EquipeFiltro = "todas" | EquipeCorretiva;

const KEY = "corretiva.minhaEquipe";

export function loadEquipe(): EquipeFiltro {
  if (typeof window === "undefined") return "todas";
  const v = window.localStorage.getItem(KEY);
  if (v && (EQUIPES_REFRIGERACAO as readonly string[]).includes(v)) {
    return v as EquipeFiltro;
  }
  return "todas";
}

export function saveEquipe(v: EquipeFiltro) {
  if (typeof window === "undefined") return;
  if (v === "todas") window.localStorage.removeItem(KEY);
  else window.localStorage.setItem(KEY, v);
}

/** Normaliza o campo `equipe` da OS para comparação tolerante a acentos/caixa. */
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
