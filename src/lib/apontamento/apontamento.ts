export { downloadBlob } from "@/lib/download";

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

const DEFAULT_WORK_BLOCKS: [number, number][] = [
  [8 * 60, 12 * 60],
  [13 * 60, 17 * 60],
];

export type ApontamentoMode = "split" | "pair";

export interface ApontamentoOptions {
  /** Blocos de trabalho em minutos desde 00:00. Ex.: [[360, 780]] = 06:00-13:00 */
  workBlocks?: [number, number][];
  /**
   * "split" (padrão): distribui as OS entre os técnicos, sem repetir.
   * "pair": todos os técnicos recebem TODAS as OS e o mesmo horário (dupla).
   */
  mode?: ApontamentoMode;
}

/**
 * Distribui OS entre os técnicos conforme o modo escolhido.
 * - split: cada técnico recebe um lote exclusivo de OS.
 * - pair: todos os técnicos recebem as mesmas OS e horários (trabalho em dupla).
 */
export function calcularApontamento(
  { tecnicos, data, osList }: ApontamentoInput,
  options: ApontamentoOptions = {},
): ApontamentoRow[] {
  const techs = tecnicos.map((t) => t.trim()).filter(Boolean);
  if (techs.length === 0 || osList.length === 0) return [];
  const blocks = options.workBlocks ?? DEFAULT_WORK_BLOCKS;
  const mode = options.mode ?? "split";

  const rows: ApontamentoRow[] = [];

  if (mode === "pair") {
    for (const tecnico of techs) {
      rows.push(...programarTecnico(tecnico, data, osList, blocks));
    }
    return rows;
  }

  const chunks = splitEvenly(osList, techs.length);
  techs.forEach((tecnico, i) => {
    const osChunk = chunks[i];
    if (!osChunk?.length) return;
    rows.push(...programarTecnico(tecnico, data, osChunk, blocks));
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

function programarTecnico(
  tecnico: string,
  data: string,
  osChunk: string[],
  workBlocks: [number, number][],
): ApontamentoRow[] {
  const count = osChunk.length;
  if (!count) return [];
  const rows: ApontamentoRow[] = [];

  const blockSizes = workBlocks.map(([a, b]) => b - a);
  const totalBlockMin = blockSizes.reduce((a, b) => a + b, 0);

  // Distribui as OS entre os blocos de trabalho proporcionalmente à duração
  const perBlock = blockSizes.map((size) => Math.floor((count * size) / totalBlockMin));
  let assigned = perBlock.reduce((a, b) => a + b, 0);
  let rr = 0;
  while (assigned < count) {
    perBlock[rr % perBlock.length]++;
    assigned++;
    rr++;
  }

  let osIdx = 0;
  for (let b = 0; b < workBlocks.length; b++) {
    const n = perBlock[b];
    if (!n) continue;
    const [blockStart, blockEnd] = workBlocks[b];
    const dur = blockEnd - blockStart;
    const durations = randomSplit(n, dur);
    let cursor = blockStart;
    for (let k = 0; k < n; k++) {
      const start = cursor;
      const end = k === n - 1 ? blockEnd : cursor + durations[k];
      rows.push({
        tecnico,
        dataInicio: composeDate(data, start),
        dataFinal: composeDate(data, end),
        os: osChunk[osIdx++],
      });
      cursor = end;
    }
  }

  return rows;
}

/**
 * Divide `total` minutos em `n` partes inteiras que somam exatamente `total`,
 * com variação aleatória controlada para evitar horários idênticos entre
 * técnicos/dias. Respeita um piso mínimo por OS e mantém a duração média.
 */
function randomSplit(n: number, total: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [total];
  const avg = total / n;
  const minMin = Math.max(5, Math.floor(avg * 0.6));
  const maxMin = Math.max(minMin + 1, Math.ceil(avg * 1.4));

  // Pesos aleatórios em torno de 1.0 (±30%) — média se aproxima do tempo padrão.
  const weights = Array.from({ length: n }, () => 0.7 + Math.random() * 0.6);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const durs = weights.map((w) =>
    Math.max(minMin, Math.min(maxMin, Math.round((w / sumW) * total))),
  );

  // Ajusta o arredondamento para bater exatamente com o total.
  let diff = total - durs.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (diff !== 0 && guard < n * 200) {
    const idx = Math.floor(Math.random() * n);
    const step = diff > 0 ? 1 : -1;
    const next = durs[idx] + step;
    if (next >= minMin && next <= maxMin) {
      durs[idx] = next;
      diff -= step;
    }
    guard++;
  }
  // Se ainda sobrou diferença (limites apertados), joga no último item.
  if (diff !== 0) durs[n - 1] += diff;
  return durs;
}

function composeDate(dateStr: string, mins: number): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const h = Math.floor(mins / 60);
  const mm = mins % 60;
  // Use UTC so ExcelJS preserva o horário exato (evita deslocamento por fuso).
  return new Date(Date.UTC(y, m - 1, d, h, mm, 0));
}

export async function generateApontamentoWorkbook(
  titulo: string,
  rows: ApontamentoRow[],
): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistema de Apontamento";
  const ws = wb.addWorksheet(titulo, { views: [{ state: "frozen", ySplit: 1 }] });

  ws.columns = [
    { key: "tecnico", width: 22 },
    { key: "ini", width: 20, style: { numFmt: "dd/mm/yyyy hh:mm" } },
    { key: "fim", width: 20, style: { numFmt: "dd/mm/yyyy hh:mm" } },
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

  const bodyFills = ["FFFCAFA7", "FFB7EDB7", "FFB7EDB7", "FFD8B4FE"];
  for (const r of rows) {
    const row = ws.addRow([r.tecnico, r.dataInicio, r.dataFinal, r.os]);
    row.getCell(2).numFmt = "dd/mm/yyyy hh:mm";
    row.getCell(3).numFmt = "dd/mm/yyyy hh:mm";
    row.eachCell((cell, col) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: bodyFills[col - 1] },
      };
      cell.font = { color: { argb: "FF000000" } };
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
