import ExcelJS from "exceljs";
import { downloadBlob } from "@/lib/preventiva/exporter";

export interface ApontamentoRow {
  tecnico: string;
  dataInicio: Date;
  dataFinal: Date;
  os: string;
}

export interface ApontamentoInput {
  tecnicos: string[]; // IDs / matrículas
  data: string; // YYYY-MM-DD
  osList: string[];
}

const WORK_BLOCKS: [number, number][] = [
  [8 * 60, 12 * 60],
  [13 * 60, 17 * 60],
];

const TOTAL_MINUTES = WORK_BLOCKS.reduce((s, [a, b]) => s + (b - a), 0); // 480

/**
 * Distribui OS sequencialmente entre os técnicos.
 * Cada técnico recebe um lote de OS e completa sua carga horária (480 min)
 * dividida entre as OS do lote. As OS não se repetem entre técnicos.
 */
export function calcularApontamento({
  tecnicos,
  data,
  osList,
}: ApontamentoInput): ApontamentoRow[] {
  const techs = tecnicos.map((t) => t.trim()).filter(Boolean);
  if (techs.length === 0 || osList.length === 0) return [];

  const chunks = splitEvenly(osList, techs.length);
  const rows: ApontamentoRow[] = [];

  techs.forEach((tecnico, i) => {
    const osChunk = chunks[i];
    if (!osChunk?.length) return;
    rows.push(...programarTecnico(tecnico, data, osChunk));
  });

  return rows;
}

function splitEvenly<T>(items: T[], parts: number): T[][] {
  const out: T[][] = Array.from({ length: parts }, () => []);
  const base = Math.floor(items.length / parts);
  const extra = items.length % parts;
  let idx = 0;
  for (let i = 0; i < parts; i++) {
    const size = base + (i < extra ? 1 : 0);
    out[i] = items.slice(idx, idx + size);
    idx += size;
  }
  return out;
}

function programarTecnico(tecnico: string, data: string, osChunk: string[]): ApontamentoRow[] {
  const count = osChunk.length;
  const perOS = Math.floor(TOTAL_MINUTES / count);
  const rows: ApontamentoRow[] = [];

  let blockIdx = 0;
  let cursor = WORK_BLOCKS[0][0];

  for (let i = 0; i < count; i++) {
    while (blockIdx < WORK_BLOCKS.length && cursor + perOS > WORK_BLOCKS[blockIdx][1]) {
      blockIdx++;
      if (blockIdx < WORK_BLOCKS.length) cursor = WORK_BLOCKS[blockIdx][0];
    }
    if (blockIdx >= WORK_BLOCKS.length) break;

    const start = cursor;
    const end =
      i === count - 1 && blockIdx === WORK_BLOCKS.length - 1
        ? WORK_BLOCKS[blockIdx][1]
        : cursor + perOS;

    rows.push({
      tecnico,
      dataInicio: composeDate(data, start),
      dataFinal: composeDate(data, end),
      os: osChunk[i],
    });

    cursor = end;
  }

  return rows;
}

function composeDate(dateStr: string, mins: number): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const h = Math.floor(mins / 60);
  const mm = mins % 60;
  return new Date(y, m - 1, d, h, mm, 0);
}

export async function generateApontamentoWorkbook(
  titulo: string,
  rows: ApontamentoRow[],
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistema de Apontamento";
  const ws = wb.addWorksheet(titulo, { views: [{ state: "frozen", ySplit: 1 }] });

  ws.columns = [
    { key: "tecnico", width: 22 },
    { key: "ini", width: 20 },
    { key: "fim", width: 20 },
    { key: "os", width: 40 },
  ];

  const headers = ["Técnico", "Data Início", "Data Final", "OS"];
  const headerFills = [
    "FFFA8072", // salmon
    "FF7CC77C", // green
    "FF7CC77C", // green
    "FFD8B4FE", // light purple
  ];

  const headerRow = ws.addRow(headers);
  headerRow.height = 26;
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.font = { bold: true, color: { argb: "FF000000" } };
  headerRow.eachCell((cell, col) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: headerFills[col - 1] },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  });

  for (const r of rows) {
    const row = ws.addRow([r.tecnico, r.dataInicio, r.dataFinal, r.os]);
    row.getCell(2).numFmt = "dd/mm/yyyy hh:mm";
    row.getCell(3).numFmt = "dd/mm/yyyy hh:mm";
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", horizontal: "left" };
      cell.border = {
        top: { style: "hair", color: { argb: "FFCBD5E1" } },
        bottom: { style: "hair", color: { argb: "FFCBD5E1" } },
      };
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export { downloadBlob };
