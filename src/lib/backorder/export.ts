// Exportador Excel — Programação de Backorder.
//
// Prédio / Andar / Ambiente são gravados como VALORES ESTÁTICOS já
// resolvidos pelo motor hierárquico (resolveAtivoTree em assets.ts),
// que sobe a árvore por codigo_pai/nivel — funciona para OS abertas
// em qualquer nível (Ambiente ou Equipamento) e não depende do
// tamanho do código. O arquivo exportado é autossuficiente: não usa
// fórmulas VLOOKUP, não referencia abas auxiliares e não quebra ao
// ser aberto em outra máquina.

import type { BackorderRow } from "./reader";

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();
// Paleta moderna — navy escuro + azul de destaque + zebra suave.
const TITLE_BG = argb("#0B1F4D");
const HEADER_BG = argb("#1E3A8A");
const HEADER_FG = argb("#FFFFFF");
const ROW_ALT_BG = argb("#F1F5F9");
const BORDER_SOFT = argb("#CBD5E1");
const BORDER_STRONG = argb("#0B1F4D");
const TAB_COLOR = argb("#1E3A8A");

type ColKey =
  | "os"
  | "nome"
  | "predio"
  | "andar"
  | "ambiente"
  | "atividade"
  | "data"
  | "equipe"
  | "solicitante";

interface ColDef {
  key: ColKey;
  label: string;
  width: number;
  align?: "left" | "center";
}

// Larguras pensadas por tipo de conteúdo (evita colunas todas iguais).
const COLUMN_ORDER: ColDef[] = [
  { key: "os", label: "OS", width: 12, align: "center" },
  { key: "nome", label: "Nome", width: 46, align: "left" },
  { key: "predio", label: "Prédio", width: 26, align: "left" },
  { key: "andar", label: "Andar", width: 22, align: "left" },
  { key: "ambiente", label: "Ambiente", width: 30, align: "left" },
  { key: "atividade", label: "Atividade", width: 16, align: "center" },
  { key: "data", label: "Data", width: 14, align: "center" },
  { key: "equipe", label: "Equipe", width: 22, align: "center" },
  { key: "solicitante", label: "Solicitante", width: 28, align: "left" },
];

function colLetter(idx: number): string {
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
  /** Base de ativos para a aba auxiliar (fórmulas VLOOKUP vivas). */
  assets?: Array<{ ativo: string; denominacao: string }>;
}): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apont Auto";
  wb.created = new Date();

  // ---------- Aba auxiliar "ativos" ----------
  const ativosSheet = wb.addWorksheet("ativos", { properties: { tabColor: { argb: argb("#94A3B8") } } });
  ativosSheet.columns = [
    { header: "Ativo", key: "ativo", width: 22 },
    { header: "Denominação Ativo", key: "denominacao", width: 64 },
  ];
  const ativosHead = ativosSheet.getRow(1);
  ativosHead.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.font = { name: "Aptos", bold: true, size: 12, color: { argb: HEADER_FG } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  ativosHead.height = 24;
  ativosSheet.views = [{ state: "frozen", ySplit: 1 }];
  const assets = input.assets ?? [];
  for (const a of assets) ativosSheet.addRow({ ativo: a.ativo, denominacao: a.denominacao });

  // ---------- Aba principal ----------
  const ws = wb.addWorksheet("BACKORDER", {
    views: [{ state: "frozen", ySplit: 2, showGridLines: false }],
    properties: { tabColor: { argb: TAB_COLOR } },
  });

  const visibleCols = COLUMN_ORDER;
  const ATIVO_COL_INDEX = visibleCols.length + 1;
  const ATIVO_COL_LETTER = colLetter(ATIVO_COL_INDEX);

  ws.columns = [
    ...visibleCols.map((c) => ({ key: c.key, width: c.width })),
    { key: "__ativo", width: 22, hidden: true },
  ];

  // Título mesclado
  ws.mergeCells(1, 1, 1, visibleCols.length);
  const title = ws.getCell(1, 1);
  const totalRows = input.rows.length;
  title.value = `${input.titulo}  ·  Programação de Backorder  ·  ${totalRows} OS`;
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_BG } };
  title.font = { name: "Aptos ExtraBold", bold: true, size: 18, color: { argb: HEADER_FG } };
  title.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 40;

  // Cabeçalho
  const head = ws.getRow(2);
  visibleCols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.label;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.font = { name: "Aptos", bold: true, size: 12, color: { argb: HEADER_FG } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "medium", color: { argb: BORDER_STRONG } },
      bottom: { style: "medium", color: { argb: BORDER_STRONG } },
      left: { style: "thin", color: { argb: BORDER_STRONG } },
      right: { style: "thin", color: { argb: BORDER_STRONG } },
    };
  });
  head.getCell(ATIVO_COL_INDEX).value = "Ativo";
  head.height = 30;

  const sorted = [...input.rows].sort(
    (a, b) => new Date(a.data_solicitacao).getTime() - new Date(b.data_solicitacao).getTime(),
  );

  let rowIdx = 3;
  for (const r of sorted) {
    const row = ws.getRow(rowIdx);
    const isAlt = rowIdx % 2 === 1; // linhas alternadas para zebra

    const ativoRef = `$${ATIVO_COL_LETTER}${rowIdx}`;
    const buildFormula = (chars: number) =>
      `IFERROR(VLOOKUP(LEFT(${ativoRef},${chars}),ativos!$A:$B,2,0),"")`;

    const values: Record<ColKey, unknown> = {
      os: r.os,
      nome: r.nome,
      predio: r.ativo ? { formula: buildFormula(5) } : "",
      andar: r.ativo ? { formula: buildFormula(7) } : "",
      ambiente: r.ativo ? { formula: buildFormula(String(r.ativo).length) } : "",
      atividade: "Corretiva",
      data: fmtDate(r.data_solicitacao),
      equipe: r.equipe,
      solicitante: r.outros,
    };

    visibleCols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = values[c.key] as never;
      cell.font = { name: "Aptos", size: 11, color: { argb: "FF0F172A" } };
      cell.alignment = {
        vertical: "middle",
        horizontal: c.align ?? "left",
        wrapText: true,
      };
      cell.border = {
        top: { style: "thin", color: { argb: BORDER_SOFT } },
        bottom: { style: "thin", color: { argb: BORDER_SOFT } },
        left: { style: "thin", color: { argb: BORDER_SOFT } },
        right: { style: "thin", color: { argb: BORDER_SOFT } },
      };
      if (isAlt) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_ALT_BG } };
      }
    });
    // OS em negrito
    row.getCell(1).font = { name: "Aptos", bold: true, size: 11, color: { argb: TITLE_BG } };
    row.getCell(ATIVO_COL_INDEX).value = r.ativo;

    row.height = 28;
    rowIdx++;
  }

  // AutoFilter na linha 2 (cabeçalho) cobrindo todas colunas visíveis
  if (rowIdx > 3) {
    ws.autoFilter = {
      from: { row: 2, column: 1 },
      to: { row: rowIdx - 1, column: visibleCols.length },
    };
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
  ws.headerFooter = {
    oddFooter: "&LApont Auto&CPágina &P de &N&R&D",
  };

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
