// Exportador Excel — Programação de Backorder.
// Cada campo do relatório é montado por nome interno; a ordem das
// colunas é apenas uma configuração declarativa (COLUMN_ORDER). Assim,
// reordenar/adicionar/remover colunas depois é uma mudança pontual.
//
// Prédio / Andar / Espaço são gerados como fórmulas PROCV vivas
// contra uma aba auxiliar "ativos" que também vai no mesmo arquivo,
// exatamente como no modelo original. O código do Ativo é gravado em
// uma coluna oculta ao final da planilha e as fórmulas apontam para
// essa coluna (a letra é calculada em tempo de exportação, para que
// nada quebre se um dia a ordem for alterada).

import type { BackorderRow } from "./reader";

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();
const HEADER_BG_L1 = argb("#002060");
const HEADER_BG_L2 = argb("#2B3095");
const COL_WIDTH = 31.28;

type ColKey =
  | "os"
  | "nome"
  | "predio"
  | "andar"
  | "espaco"
  | "atividade"
  | "data"
  | "equipe"
  | "solicitante";

interface ColDef {
  key: ColKey;
  label: string;
  width: number;
}

// Ordem padrão de exportação — pode ser reordenada aqui sem impactar
// a lógica de cálculo (cada campo é resolvido pelo seu key).
const COLUMN_ORDER: ColDef[] = [
  { key: "os", label: "OS", width: COL_WIDTH },
  { key: "nome", label: "Nome", width: COL_WIDTH },
  { key: "predio", label: "Prédio", width: COL_WIDTH },
  { key: "andar", label: "Andar", width: COL_WIDTH },
  { key: "espaco", label: "Espaço", width: COL_WIDTH },
  { key: "atividade", label: "Atividade", width: COL_WIDTH },
  { key: "data", label: "Data", width: COL_WIDTH },
  { key: "equipe", label: "Equipe", width: COL_WIDTH },
  { key: "solicitante", label: "Solicitante", width: COL_WIDTH },
];

function colLetter(idx: number): string {
  // 1 → A, 26 → Z, 27 → AA …
  let n = idx;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}

export async function generateBackorderExport(input: {
  titulo: string;
  rows: BackorderRow[];
  /** Base de ativos para a aba auxiliar (fórmulas PROCV). */
  assets?: Array<{ ativo: string; denominacao: string }>;
}): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apont Auto";

  // ---------- Aba auxiliar "ativos" ----------
  const ativosSheet = wb.addWorksheet("ativos");
  ativosSheet.columns = [
    { header: "Ativo", key: "ativo", width: 20 },
    { header: "Denominação Ativo", key: "denominacao", width: 60 },
  ];
  const header = ativosSheet.getRow(1);
  header.font = { bold: true };
  const assets = input.assets ?? [];
  for (const a of assets) {
    ativosSheet.addRow({ ativo: a.ativo, denominacao: a.denominacao });
  }

  // ---------- Aba principal ----------
  const ws = wb.addWorksheet("BACKORDER", { views: [{ state: "frozen", ySplit: 2 }] });

  // Colunas visíveis + coluna oculta "Ativo" ao final
  const visibleCols = COLUMN_ORDER;
  const ATIVO_COL_INDEX = visibleCols.length + 1;
  const ATIVO_COL_LETTER = colLetter(ATIVO_COL_INDEX);

  ws.columns = [
    ...visibleCols.map((c) => ({ key: c.key, width: c.width })),
    { key: "__ativo", width: 20, hidden: true },
  ];

  // Título mesclado (só nas colunas visíveis)
  ws.mergeCells(1, 1, 1, visibleCols.length);
  const title = ws.getCell(1, 1);
  title.value = `${input.titulo}  ·  Programação de Backorder`;
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG_L1 } };
  title.font = { name: "Aptos ExtraBold", bold: true, size: 20, color: { argb: "FFFFFFFF" } };
  title.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 36;

  // Cabeçalho
  const head = ws.getRow(2);
  visibleCols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.label;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG_L2 } };
    cell.font = { name: "Aptos ExtraBold", bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  });
  // Cabeçalho da coluna oculta (para referência humana ao desocultar)
  head.getCell(ATIVO_COL_INDEX).value = "Ativo";
  head.height = 34;

  // Ordena ASC por data de solicitação (mais antigo primeiro)
  const sorted = [...input.rows].sort(
    (a, b) => new Date(a.data_solicitacao).getTime() - new Date(b.data_solicitacao).getTime(),
  );

  let rowIdx = 3;
  for (const r of sorted) {
    const row = ws.getRow(rowIdx);

    // Fórmulas PROCV vivas apontando para a aba "ativos" e para a
    // coluna oculta "Ativo" (letra calculada dinamicamente).
    const ativoRef = `$${ATIVO_COL_LETTER}${rowIdx}`;
    const buildFormula = (chars: number) =>
      `IFERROR(VLOOKUP(LEFT(${ativoRef},${chars}),ativos!$A:$B,2,0),"")`;

    const values: Record<ColKey, unknown> = {
      os: r.os,
      nome: r.nome,
      predio: r.ativo ? { formula: buildFormula(5) } : "",
      andar: r.ativo ? { formula: buildFormula(7) } : "",
      espaco: r.ativo ? { formula: buildFormula(String(r.ativo).length) } : "",
      atividade: "Corretiva",
      data: fmtDate(r.termino_sla),
      equipe: r.equipe,
      solicitante: r.outros,
    };

    visibleCols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = values[c.key] as never;
      cell.font = { name: "Aptos ExtraBold", bold: true, size: 13, color: { argb: "FF000000" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFBFBFBF" } },
        bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
        left: { style: "thin", color: { argb: "FFBFBFBF" } },
        right: { style: "thin", color: { argb: "FFBFBFBF" } },
      };
    });
    // Coluna oculta com o código do Ativo (fonte das fórmulas acima)
    row.getCell(ATIVO_COL_INDEX).value = r.ativo;

    row.height = 34;
    rowIdx++;
  }

  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    printTitlesRow: "1:2",
  };

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
