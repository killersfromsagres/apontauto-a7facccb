// Geração da planilha "Programação de Backorder".
// Reproduz o padrão visual da Programação Semanal e embute a aba de ativos
// com fórmulas VLOOKUP/LEFT para Prédio/Andar/Espaço.

import type { AssetRef } from "./assets";

export interface BackorderExportRow {
  os: string;
  nome: string;
  ativo: string;
  atividade: string;
  termino_sla: string | null;
  equipe: string;
  data_solicitacao: string;
  outros: string;
}

const argbFromHex = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();
const HEADER_BG_L1 = argbFromHex("#002060");
const HEADER_BG_L2 = argbFromHex("#2B3095");

const COLUMNS: { key: string; label: string; width: number }[] = [
  { key: "os", label: "OS", width: 16 },
  { key: "nome", label: "Nome", width: 54 },
  { key: "predio", label: "Prédio", width: 20 },
  { key: "andar", label: "Andar", width: 18 },
  { key: "espaco", label: "Espaço", width: 34 },
  { key: "atividade", label: "Atividade", width: 20 },
  { key: "termino_sla", label: "Término SLA", width: 18 },
  { key: "equipe", label: "Equipe", width: 24 },
  { key: "ativo", label: "Ativo", width: 22 },
  { key: "outros", label: "Outros", width: 24 },
];

function formatBR(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
}

export interface BackorderExportInput {
  titulo: string; // Ex.: "SHERWIN WILLIAMS / DEMARCHI"
  rows: BackorderExportRow[]; // já ordenadas asc por data_solicitacao
  assets: AssetRef[];
}

export async function generateBackorderXlsx(input: BackorderExportInput): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apont Auto";

  // Aba Ativos primeiro (para a fórmula referenciar)
  const wsA = wb.addWorksheet("Ativos");
  wsA.columns = [
    { key: "ativo", header: "Ativo", width: 22 },
    { key: "denominacao", header: "Denominação Ativo", width: 60 },
  ];
  wsA.getRow(1).font = { bold: true };
  for (const a of input.assets) {
    wsA.addRow({ ativo: a.ativo, denominacao: a.denominacao });
  }

  const ws = wb.addWorksheet("Backorder", { views: [{ state: "frozen", ySplit: 2 }] });
  ws.columns = COLUMNS.map((c) => ({ key: c.key, width: c.width }));

  const totalCols = COLUMNS.length;
  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `${input.titulo}  ·  PROGRAMAÇÃO DE BACKORDER`;
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG_L1 } };
  titleCell.font = { name: "Aptos ExtraBold", bold: true, size: 20, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 36;

  const headerRow = ws.getRow(2);
  COLUMNS.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.label;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG_L2 } };
    cell.font = { name: "Aptos ExtraBold", bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin" }, bottom: { style: "thin" },
      left: { style: "thin" }, right: { style: "thin" },
    };
  });
  headerRow.height = 34;

  const ativoRange = `Ativos!$A:$B`;

  let rowIdx = 3;
  for (const r of input.rows) {
    const row = ws.getRow(rowIdx);
    // Ativo entra na coluna 9 (I). As fórmulas de Prédio/Andar/Espaço
    // referenciam I{linha}.
    row.getCell(1).value = r.os;
    row.getCell(2).value = r.nome;
    // Prédio (5) / Andar (7) / Espaço (completo) via VLOOKUP
    const ativoRef = `I${rowIdx}`;
    row.getCell(3).value = {
      formula: `IFERROR(VLOOKUP(LEFT(${ativoRef},5),${ativoRange},2,FALSE),"")`,
    } as unknown as string;
    row.getCell(4).value = {
      formula: `IFERROR(VLOOKUP(LEFT(${ativoRef},7),${ativoRange},2,FALSE),"")`,
    } as unknown as string;
    row.getCell(5).value = {
      formula: `IFERROR(VLOOKUP(${ativoRef},${ativoRange},2,FALSE),"")`,
    } as unknown as string;
    row.getCell(6).value = r.atividade;
    row.getCell(7).value = formatBR(r.termino_sla);
    row.getCell(8).value = r.equipe;
    row.getCell(9).value = r.ativo;
    row.getCell(10).value = r.outros;

    for (let c = 1; c <= totalCols; c++) {
      const cell = row.getCell(c);
      cell.font = { name: "Aptos SemiBold", size: 12, color: { argb: "FF000000" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFBFBFBF" } },
        bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
        left: { style: "thin", color: { argb: "FFBFBFBF" } },
        right: { style: "thin", color: { argb: "FFBFBFBF" } },
      };
    }
    row.height = 30;
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
