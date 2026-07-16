// Exportador Excel — Programação de Backorder.
// Segue o mesmo padrão visual da Programação Semanal (weekly-exporter).

import type { BackorderRow } from "./reader";

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();
const HEADER_BG_L1 = argb("#002060");
const HEADER_BG_L2 = argb("#2B3095");

// Largura solicitada: 219 px. Excel usa "character units" (~7 px cada).
const COL_WIDTH = 31.28;
const COLUMNS = [
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


function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}

export async function generateBackorderExport(input: {
  titulo: string;
  rows: BackorderRow[];
}): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apont Auto";
  const ws = wb.addWorksheet("BACKORDER", { views: [{ state: "frozen", ySplit: 2 }] });
  ws.columns = COLUMNS.map((c) => ({ key: c.key, width: c.width }));

  ws.mergeCells(1, 1, 1, COLUMNS.length);
  const title = ws.getCell(1, 1);
  title.value = `${input.titulo}  ·  Programação de Backorder`;
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG_L1 } };
  title.font = { name: "Aptos ExtraBold", bold: true, size: 20, color: { argb: "FFFFFFFF" } };
  title.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 36;

  const head = ws.getRow(2);
  COLUMNS.forEach((c, i) => {
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
  head.height = 34;

  // Ordena ASC por data de solicitação (mais antigo primeiro)
  const sorted = [...input.rows].sort(
    (a, b) => new Date(a.data_solicitacao).getTime() - new Date(b.data_solicitacao).getTime(),
  );

  let rowIdx = 3;
  for (const r of sorted) {
    const row = ws.getRow(rowIdx++);
    const values: Record<string, string> = {
      os: r.os,
      nome: r.nome,
      predio: r.predio,
      andar: r.andar,
      espaco: r.espaco,
      atividade: r.atividade,
      termino_sla: fmtDate(r.termino_sla),
      equipe: r.equipe,
      ativo: r.ativo,
      outros: r.outros,
    };
    COLUMNS.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = values[c.key];
      cell.font = { name: "Aptos ExtraBold", bold: true, size: 13, color: { argb: "FF000000" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFBFBFBF" } },
        bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
        left: { style: "thin", color: { argb: "FFBFBFBF" } },
        right: { style: "thin", color: { argb: "FFBFBFBF" } },
      };
    });
    row.height = 34;
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
