// Distribuição automática das OS de Refrigeração entre as 3 equipes.
// Regra: OS do mesmo prédio ficam com a mesma equipe (evita deslocamento
// desnecessário) e os prédios são distribuídos de forma balanceada
// (maior grupo primeiro → equipe com menos OS).

import { EQUIPES_REFRIGERACAO, type EquipeRefrig } from "./equipe";

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Reconhece uma equipe já preenchida na planilha ("Refrig 2", "equipe 3", "3"…). */
export function parseEquipe(value: unknown): EquipeRefrig | null {
  const v = norm(value);
  if (!v) return null;
  const m = v.match(/([123])\s*$/);
  if (m && (v.includes("refrig") || v.includes("equipe") || v.length <= 2)) {
    return EQUIPES_REFRIGERACAO[Number(m[1]) - 1];
  }
  for (const e of EQUIPES_REFRIGERACAO) {
    if (norm(e) === v) return e;
  }
  return null;
}

/**
 * Preenche `equipe` para todas as linhas que não têm equipe válida,
 * agrupando por prédio e balanceando a carga entre as 3 equipes.
 */
export function autoAssignEquipes<T extends { predio?: string | null; equipe?: string | null }>(
  rows: T[],
): T[] {
  const load: Record<EquipeRefrig, number> = {
    "Refrigeração 1": 0,
    "Refrigeração 2": 0,
    "Refrigeração 3": 0,
  };

  const pending = new Map<string, T[]>();

  for (const r of rows) {
    const existing = parseEquipe(r.equipe);
    if (existing) {
      r.equipe = existing;
      load[existing] += 1;
      continue;
    }
    const key = norm(r.predio) || "__sem_predio__";
    const list = pending.get(key);
    if (list) list.push(r);
    else pending.set(key, [r]);
  }

  const groups = Array.from(pending.values()).sort((a, b) => b.length - a.length);
  for (const group of groups) {
    const target = EQUIPES_REFRIGERACAO.reduce((best, e) => (load[e] < load[best] ? e : best));
    for (const r of group) r.equipe = target;
    load[target] += group.length;
  }

  return rows;
}
