// Leitura/escrita de planilhas preservando o máximo possível do arquivo original.
//
// .xlsx -> ExcelJS (mantém estilos, larguras, fórmulas, filtros, abas ocultas)
// .xls / .csv -> SheetJS (formatos sem estilo; convertidos na saída)

import type { FillOptions, RowResult, TargetColumns } from "./sheet-fill";
import { METHOD_HEADER, STATUS_HEADER, STATUS_LABEL, detectHeaderRow } from "./sheet-fill";

export type WorkbookKind = "xlsx" | "legacy-xls" | "csv";

export interface SheetData {
  name: string;
  /** Matriz completa (linhas x colunas) já como texto. */
  rows: string[][];
  headerRow: number;
  headers: string[];
  totalRows: number;
  hidden: boolean;
}

export interface LoadedWorkbook {
  kind: WorkbookKind;
  fileName: string;
  fileSize: number;
  sheets: SheetData[];
  /** Instância ExcelJS quando kind === "xlsx". */
  workbook?: any;
  /** Instância SheetJS nos demais casos. */
  raw?: any;
}

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function validateFile(file: File): string | null {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (!["xlsx", "xls", "csv"].includes(ext)) {
    return "Formato não suportado. Envie um arquivo .xlsx, .xls ou .csv.";
  }
  if (file.size === 0) return "O arquivo está vazio ou corrompido.";
  if (file.size > MAX_FILE_BYTES) {
    return `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). O limite é 25 MB.`;
  }
  return null;
}

const cellText = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "object") {
    const v = value as any;
    if (v.richText) return v.richText.map((t: any) => t.text).join("");
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v.formula != null) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (v.error) return String(v.error);
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
};

function buildSheet(name: string, rows: string[][], hidden: boolean): SheetData {
  const headerRow = detectHeaderRow(rows);
  const headers = (rows[headerRow] ?? []).map((h) => String(h ?? "").trim());
  return { name, rows, headerRow, headers, totalRows: Math.max(rows.length - headerRow - 1, 0), hidden };
}

/** Lê o arquivo e devolve todas as abas com as matrizes de texto. */
export async function loadWorkbook(file: File): Promise<LoadedWorkbook> {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const buffer = await file.arrayBuffer();

  if (ext === "xlsx") {
    const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));
    const wb = new (ExcelJS as any).Workbook();
    try {
      await wb.xlsx.load(buffer);
    } catch (e) {
      throw new Error("Não foi possível abrir o arquivo .xlsx (pode estar corrompido ou protegido).");
    }
    const sheets: SheetData[] = wb.worksheets.map((ws: any) => {
      const rows: string[][] = [];
      const last = ws.rowCount ?? 0;
      for (let r = 1; r <= last; r++) {
        const row = ws.getRow(r);
        const arr: string[] = [];
        const width = Math.max(ws.columnCount ?? 0, (row.values?.length ?? 1) - 1);
        for (let c = 1; c <= width; c++) arr.push(cellText(row.getCell(c).value));
        rows.push(arr);
      }
      return buildSheet(ws.name, rows, ws.state === "hidden" || ws.state === "veryHidden");
    });
    return { kind: "xlsx", fileName: file.name, fileSize: file.size, sheets, workbook: wb };
  }

  const XLSX = await import("xlsx");
  let raw: any;
  try {
    raw = XLSX.read(buffer, { type: "array", raw: false, cellDates: true });
  } catch {
    throw new Error("Não foi possível ler o arquivo (formato inválido ou corrompido).");
  }
  const sheets: SheetData[] = raw.SheetNames.map((name: string) => {
    const aoa = XLSX.utils.sheet_to_json<string[]>(raw.Sheets[name], {
      header: 1,
      defval: "",
      raw: false,
      blankrows: true,
    });
    const rows = (aoa as any[][]).map((r) => r.map((c) => String(c ?? "").trim()));
    return buildSheet(name, rows, false);
  });
  return {
    kind: ext === "csv" ? "csv" : "legacy-xls",
    fileName: file.name,
    fileSize: file.size,
    sheets,
    raw,
  };
}

/* -------------------------------------------------------------------------- */
/* Escrita                                                                     */
/* -------------------------------------------------------------------------- */

export interface SheetPlan {
  sheetName: string;
  headerRow: number;
  ativoIndex: number;
  targets: TargetColumns;
  results: RowResult[];
  options: FillOptions;
  catalogName: string;
}

const METHOD_LABEL: Record<string, string> = {
  tree: "Árvore (parent_code)",
  legacy: "Fallback legado",
  "existing-value": "Valor existente",
  manual: "Manual",
  unmatched: "Não encontrado",
};

/** Aplica os resultados e devolve o arquivo pronto para download. */
export async function writeProcessed(
  loaded: LoadedWorkbook,
  plans: SheetPlan[],
): Promise<{ blob: Blob; fileName: string }> {
  const base = loaded.fileName.replace(/\.(xlsx|xls|csv)$/i, "");

  if (loaded.kind === "xlsx") {
    const wb = loaded.workbook;
    for (const plan of plans) {
      const ws = wb.getWorksheet(plan.sheetName);
      if (!ws) continue;
      applyToExcelJsSheet(ws, plan);
    }
    const buf = await wb.xlsx.writeBuffer();
    return {
      blob: new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      fileName: `${base} - preenchido.xlsx`,
    };
  }

  // .xls / .csv -> gera XLSX novo a partir das matrizes atualizadas
  const XLSX = await import("xlsx");
  const out = XLSX.utils.book_new();
  for (const sheet of loaded.sheets) {
    const plan = plans.find((p) => p.sheetName === sheet.name);
    const rows = sheet.rows.map((r) => r.slice());
    if (plan) applyToMatrix(rows, plan);
    XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(rows), sheet.name.slice(0, 31));
  }
  const buf = XLSX.write(out, { bookType: "xlsx", type: "array" });
  return {
    blob: new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName: `${base} - preenchido.xlsx`,
  };
}

/** Índices finais das colunas de destino, inserindo-as se necessário. */
function resolveWriteColumns(
  plan: SheetPlan,
  headerLen: number,
): { targets: TargetColumns; inserts: { at: number; headers: string[] } | null } {
  const t = { ...plan.targets };
  const missing: { key: keyof TargetColumns; header: string }[] = [];
  if (t.predio < 0) missing.push({ key: "predio", header: "Prédio" });
  if (t.andar < 0) missing.push({ key: "andar", header: "Andar" });
  if (t.ambiente < 0) missing.push({ key: "ambiente", header: "Ambiente" });
  if (t.status < 0) missing.push({ key: "status", header: STATUS_HEADER });
  if (plan.options.addMethodColumn && t.method < 0)
    missing.push({ key: "method", header: METHOD_HEADER });

  if (missing.length === 0) return { targets: t, inserts: null };

  const at = plan.ativoIndex + 1; // imediatamente após a coluna Ativo
  // Desloca as colunas existentes que ficam depois do ponto de inserção.
  const shift = missing.length;
  (Object.keys(t) as (keyof TargetColumns)[]).forEach((k) => {
    if (t[k] >= at) t[k] += shift;
  });
  missing.forEach((m, i) => {
    t[m.key] = at + i;
  });
  return { targets: t, inserts: { at, headers: missing.map((m) => m.header) } };
}

function applyToExcelJsSheet(ws: any, plan: SheetPlan) {
  const headerRowNum = plan.headerRow + 1;
  const { targets, inserts } = resolveWriteColumns(plan, ws.columnCount ?? 0);

  if (inserts) {
    const rowCount = Math.max(ws.rowCount ?? 0, headerRowNum);
    const cols = inserts.headers.map((h) => {
      const col: any[] = new Array(rowCount).fill(null);
      col[plan.headerRow] = h; // índice 0 == linha 1
      return col;
    });
    ws.spliceColumns(inserts.at + 1, 0, ...cols);
    for (const h of inserts.headers) {
      const idx = inserts.at + inserts.headers.indexOf(h) + 1;
      const cell = ws.getRow(headerRowNum).getCell(idx);
      const model = ws.getRow(headerRowNum).getCell(Math.max(plan.ativoIndex + 1, 1));
      cell.font = model.font;
      cell.fill = model.fill;
      cell.border = model.border;
      cell.alignment = model.alignment;
      ws.getColumn(idx).width = Math.max(String(h).length + 6, 18);
    }
  }

  for (const r of plan.results) {
    if (r.status === "empty") continue;
    const row = ws.getRow(r.row);
    const set = (colIdx: number, value: string) => {
      if (colIdx < 0 || !value) return;
      row.getCell(colIdx + 1).value = value;
    };
    set(targets.predio, r.final[0]);
    set(targets.andar, r.final[1]);
    set(targets.ambiente, r.final[2]);
    if (targets.status >= 0) row.getCell(targets.status + 1).value = STATUS_LABEL[r.status];
    if (plan.options.addMethodColumn && targets.method >= 0)
      row.getCell(targets.method + 1).value = METHOD_LABEL[r.method] ?? r.method;
    if (plan.options.addComment && targets.predio >= 0) {
      row.getCell(targets.predio + 1).note = `Ativo ${r.code} · catálogo ${plan.catalogName}`;
    }
    row.commit?.();
  }
}

function applyToMatrix(rows: string[][], plan: SheetPlan) {
  const { targets, inserts } = resolveWriteColumns(plan, rows[plan.headerRow]?.length ?? 0);
  if (inserts) {
    for (let i = 0; i < rows.length; i++) {
      const filler = inserts.headers.map(() => "");
      const row = rows[i] ?? (rows[i] = []);
      while (row.length < inserts.at) row.push("");
      row.splice(inserts.at, 0, ...filler);
    }
    inserts.headers.forEach((h, i) => {
      rows[plan.headerRow][inserts.at + i] = h;
    });
  }
  for (const r of plan.results) {
    if (r.status === "empty") continue;
    const row = rows[r.row - 1];
    if (!row) continue;
    const set = (c: number, v: string) => {
      if (c < 0 || !v) return;
      while (row.length <= c) row.push("");
      row[c] = v;
    };
    set(targets.predio, r.final[0]);
    set(targets.andar, r.final[1]);
    set(targets.ambiente, r.final[2]);
    if (targets.status >= 0) set(targets.status, STATUS_LABEL[r.status]);
    if (plan.options.addMethodColumn && targets.method >= 0)
      set(targets.method, METHOD_LABEL[r.method] ?? r.method);
  }
}

/* -------------------------------------------------------------------------- */
/* Relatórios                                                                  */
/* -------------------------------------------------------------------------- */

export async function buildUnmatchedReport(
  fileName: string,
  plans: SheetPlan[],
): Promise<{ blob: Blob; fileName: string }> {
  const XLSX = await import("xlsx");
  const rows = [["Aba", "Linha", "Ativo", "Motivo", "Prédio atual", "Andar atual", "Ambiente atual"]];
  for (const plan of plans) {
    for (const r of plan.results) {
      if (r.status !== "unmatched" && r.status !== "conflict") continue;
      rows.push([
        plan.sheetName,
        String(r.row),
        r.code,
        r.status === "conflict" ? "Conflito com valor existente" : r.issues.join("; ") || "Código não encontrado",
        r.current[0],
        r.current[1],
        r.current[2],
      ]);
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Não encontrados");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return {
    blob: new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName: `${fileName.replace(/\.(xlsx|xls|csv)$/i, "")} - nao encontrados.xlsx`,
  };
}
