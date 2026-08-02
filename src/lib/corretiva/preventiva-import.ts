// Importação de OS de PREVENTIVA no módulo Corretiva (aba Preventivas).
// Reaproveita o leitor de planilha da corretiva e restringe a separação
// automática às 4 equipes de preventiva: Chaveiro, Civil, Hidráulica e Elétrica.

import { readCorretivaOsFile, type CorretivaOsImport } from "@/lib/corretiva/reader";
import { classificarEquipeOs } from "@/lib/corretiva/auto-equipe";

export const TIPO_PREVENTIVA = "Preventiva";

export const EQUIPES_PREVENTIVA = ["Chaveiro", "Civil", "Hidráulica", "Elétrica"] as const;
export type EquipePreventiva = (typeof EQUIPES_PREVENTIVA)[number];

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Casa um texto livre de equipe com uma das 4 equipes de preventiva. */
export function equipePreventivaFromText(valor: string | null | undefined): EquipePreventiva | null {
  const n = norm(valor);
  if (!n) return null;
  if (n.includes("chave") || n.includes("serralh")) return "Chaveiro";
  if (n.includes("hidraul") || n.includes("encanad")) return "Hidráulica";
  if (n.includes("eletr")) return "Elétrica";
  if (n.includes("civil") || n.includes("alvenaria") || n.includes("predial")) return "Civil";
  return null;
}

/**
 * Separação automática:
 * 1. usa a coluna Equipe quando reconhecível;
 * 2. senão, classifica pelo texto da OS;
 * 3. equipes fora das 4 (Pintura → Civil, Refrigeração → Elétrica) são redirecionadas.
 */
export function classificarPreventiva(row: CorretivaOsImport): EquipePreventiva {
  const daPlanilha = equipePreventivaFromText(row.equipe);
  if (daPlanilha) return daPlanilha;

  const c = classificarEquipeOs(row);
  switch (c.equipe) {
    case "Chaveiro":
      return "Chaveiro";
    case "Hidráulica":
      return "Hidráulica";
    case "Elétrica":
    case "Refrigeração":
      return "Elétrica";
    default:
      return "Civil";
  }
}

export type PreventivaRow = CorretivaOsImport & { tipo: string; equipe: EquipePreventiva };

export async function lerPreventivaFile(file: File): Promise<PreventivaRow[]> {
  const rows = await readCorretivaOsFile(file);
  return rows.map((r) => ({
    ...r,
    tipo: TIPO_PREVENTIVA,
    equipe: classificarPreventiva(r),
  }));
}

export function contarPorEquipe(rows: PreventivaRow[]): Record<EquipePreventiva, number> {
  const out = { Chaveiro: 0, Civil: 0, Hidráulica: 0, Elétrica: 0 } as Record<
    EquipePreventiva,
    number
  >;
  for (const r of rows) out[r.equipe]++;
  return out;
}

/** Verdadeiro quando a OS deve aparecer na aba Preventivas. */
export function isPreventiva(tipo: string | null | undefined): boolean {
  return norm(tipo).startsWith("prevent");
}
