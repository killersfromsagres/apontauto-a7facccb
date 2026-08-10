// Sub-triagem por equipe a partir das RawRow lidas do reader.

import type { RawRow } from "./reader";

export type Equipe =
  | "CHAVEIRO"
  | "CIVIL"
  | "CLIMATIZAÇÃO E REFRIGERAÇÃO 1"
  | "CLIMATIZAÇÃO E REFRIGERAÇÃO 2"
  | "CLIMATIZAÇÃO E REFRIGERAÇÃO 3"
  | "ELÉTRICA"
  | "HIDRÁULICA"
  | "CORRETIVA";

export const EQUIPES_ORDEM: Equipe[] = [
  "CHAVEIRO",
  "CIVIL",
  "CLIMATIZAÇÃO E REFRIGERAÇÃO 1",
  "CLIMATIZAÇÃO E REFRIGERAÇÃO 2",
  "CLIMATIZAÇÃO E REFRIGERAÇÃO 3",
  "ELÉTRICA",
  "HIDRÁULICA",
  "CORRETIVA",
];

export const EQUIPE_COLOR: Record<Equipe, string> = {
  CHAVEIRO: "#4F4FD9",
  CIVIL: "#00863D",
  "CLIMATIZAÇÃO E REFRIGERAÇÃO 1": "#1688CE",
  "CLIMATIZAÇÃO E REFRIGERAÇÃO 2": "#007D02",
  "CLIMATIZAÇÃO E REFRIGERAÇÃO 3": "#A85D5F",
  ELÉTRICA: "#3EA9AB",
  HIDRÁULICA: "#DB8E03",
  CORRETIVA: "#FF0000",
};

const HIDRAULICA_KEYWORDS = [
  "caixa pluvial",
  "caixas pluviais",
  "fluente",
  "fluentes",
  "canaleta",
  "canaletas",
  "tubulação",
  "tubulacao",
  "tubulações",
  "tubulacoes",
  "limpeza de calha",
  "limpeza de calhas",
  "grelha",
  "grelhas",
  "ralo",
  "ralos",
  "boca de lobo",
  "bocas de lobo",
];

export const REFRIG_1 = ["A160", "A170", "ADC", "AMBULATÓRIO", "AMBULATORIO", "B203"];
export const REFRIG_2 = [
  "A220",
  "B115",
  "B290",
  "C110",
  "C120",
  "C340",
  "C380",
  "C45",
  "C46",
  "C49",
  "C65",
  "C70",
  "D240",
  "D246",
];
export const REFRIG_3 = [
  "D270",
  "D295",
  "D345",
  "D55",
  "E105",
  "E125",
  "E130",
  "E171",
  "E200",
  "E310",
  "E35",
  "E70",
  "E80",
  "F30",
  "FUNDAÇÃO ECO+",
  "FUNDACAO ECO+",
  "Z210",
  "Z310",
  "Z500",
];

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function isHidraulica(row: RawRow): boolean {
  const bag = norm(`${row.nomeOS} ${row.descricao}`);
  return HIDRAULICA_KEYWORDS.some((k) => bag.includes(norm(k)));
}

function refrigTeamForPredio(predio: string): Equipe {
  const p = norm(predio);
  const match = (arr: string[]) => arr.some((x) => norm(x) === p || p.startsWith(norm(x)));
  if (match(REFRIG_1)) return "CLIMATIZAÇÃO E REFRIGERAÇÃO 1";
  if (match(REFRIG_2)) return "CLIMATIZAÇÃO E REFRIGERAÇÃO 2";
  if (match(REFRIG_3)) return "CLIMATIZAÇÃO E REFRIGERAÇÃO 3";
  return "CLIMATIZAÇÃO E REFRIGERAÇÃO 1";
}

export interface TriagedOS extends RawRow {
  equipe: Equipe;
}

/**
 * Reclassifica as linhas em equipes finais, aplicando:
 * - Civil → separa Hidráulica por keywords; balanceia restante entre Civil/Chaveiro
 * - Climatização → Refrig 1/2/3 por prédio
 * - Elétrica → equipe única
 * - Outras categorias são ignoradas (não fazem parte da Programação Semanal)
 */
export function triage(rows: RawRow[]): TriagedOS[] {
  const out: TriagedOS[] = [];
  const civilPool: RawRow[] = [];

  // Ordena globalmente por Termino SLA
  const sorted = [...rows].sort((a, b) => a.terminoSLATs - b.terminoSLATs);

  for (const r of sorted) {
    switch (r.categoria) {
      case "CIVIL":
        if (isHidraulica(r)) out.push({ ...r, equipe: "HIDRÁULICA" });
        else civilPool.push(r);
        break;
      case "CLIMATIZAÇÃO E REFRIGERAÇÃO":
        out.push({ ...r, equipe: refrigTeamForPredio(r.predio) });
        break;
      case "ELÉTRICA":
        out.push({ ...r, equipe: "ELÉTRICA" });
        break;
      default:
        // Outras categorias (Abastec./Limpeza/Jardin.) não entram na programação semanal.
        break;
    }
  }

  civilPool.forEach((r, i) => {
    out.push({ ...r, equipe: i % 2 === 0 ? "CIVIL" : "CHAVEIRO" });
  });

  // Ordena por Equipe → Prédio → Andar → SLA
  return out.sort((a, b) => {
    if (a.equipe !== b.equipe)
      return EQUIPES_ORDEM.indexOf(a.equipe) - EQUIPES_ORDEM.indexOf(b.equipe);
    
    return (
      a.predio.localeCompare(b.predio) ||
      a.andar.localeCompare(b.andar) ||
      a.terminoSLATs - b.terminoSLATs
    );
  });
}

/**
 * Dada uma equipe selecionada no menu, retorna as equipes finais que devem
 * ser incluídas no arquivo daquela seleção.
 */
export function equipesRelacionadas(selecionada: Equipe): Equipe[] {
  if (selecionada === "CIVIL" || selecionada === "CHAVEIRO" || selecionada === "HIDRÁULICA") {
    return ["CIVIL", "CHAVEIRO", "HIDRÁULICA"];
  }
  return [selecionada];
}
