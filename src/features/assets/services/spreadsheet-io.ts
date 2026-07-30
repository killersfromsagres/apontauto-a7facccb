// Leitura/escrita de planilhas preservando o máximo possível do arquivo original.
//
// .xlsx -> ExcelJS (mantém estilos, larguras, fórmulas, filtros, abas ocultas)
// .xls / .csv -> SheetJS (formatos sem estilo; convertidos na saída)

import type { FillOptions, RowResult, TargetColumns } from "./sheet-fill";
import { METHOD_HEADER, STATUS_HEADER, STATUS_LABEL, detectHeaderRow } from "./sheet-fill";
import type { ColumnSpec } from "./xlsx-report";
import {
  DATE_FMT,
  ELECTRIC,
  FONT,
  NAVY,
  TEXT_LIGHT,
  THIN_BORDER,
  ZEBRA,
  addCorporateHeader,
  applyStatusConditionalFormatting,
  autoFitColumns,
  finishTable,
  writeTableHeader,
  writeTableRows,
} from "./xlsx-report";

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
  return {
    name,
    rows,
    headerRow,
    headers,
    totalRows: Math.max(rows.length - headerRow - 1, 0),
    hidden,
  };
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
      throw new Error(
        "Não foi possível abrir o arquivo .xlsx (pode estar corrompido ou protegido).",
      );
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

export interface ProcessMeta {
  /** Nome do arquivo original enviado pelo usuário. */
  originalFileName: string;
  /** Usuário que executou o processamento. */
  user: string;
  catalogName: string;
  catalogVersion: number | string | null;
  processedAt: Date;
  durationMs: number;
  options: FillOptions;
  totals: Record<string, number>;
  /** Ativos do catálogo (usado apenas quando `includeCatalogSheet`). */
  catalogAssets?: { code: string; name: string; level: string; parentCode: string }[];
}

const RESUMO_SHEET = "Resumo do Processamento";
const NAO_ENCONTRADOS_SHEET = "Ativos Não Encontrados";
const BASE_SHEET = "Base de Ativos Utilizada";

const pad = (n: number) => String(n).padStart(2, "0");

/** PCM_ATIVOS_PREENCHIDO_YYYY-MM-DD_HH-mm.xlsx */
export function processedFileName(date = new Date()) {
  const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const t = `${pad(date.getHours())}-${pad(date.getMinutes())}`;
  return `PCM_ATIVOS_PREENCHIDO_${d}_${t}.xlsx`;
}

const statusLabelOf = (r: RowResult) =>
  r.method === "manual" ? "Correção manual" : STATUS_LABEL[r.status];

async function loadExcelJS() {
  const mod: any = await import("exceljs");
  return (mod.default ?? mod) as any;
}

/** Aplica os resultados e devolve o arquivo pronto para download. */
export async function writeProcessed(
  loaded: LoadedWorkbook,
  plans: SheetPlan[],
  meta?: ProcessMeta,
): Promise<{ blob: Blob; fileName: string; validation: ValidationReport }> {
  const ExcelJS = await loadExcelJS();
  let wb: any;

  if (loaded.kind === "xlsx") {
    // Trabalha sobre a instância já carregada: preserva estilos, fórmulas,
    // mesclagens, filtros, imagens e abas ocultas do arquivo original.
    wb = loaded.workbook;
    for (const plan of plans) {
      const ws = wb.getWorksheet(plan.sheetName);
      if (!ws) continue;
      applyToExcelJsSheet(ws, plan);
    }
  } else {
    // .xls / .csv -> monta um XLSX novo a partir das matrizes atualizadas
    wb = new ExcelJS.Workbook();
    for (const sheet of loaded.sheets) {
      const plan = plans.find((p) => p.sheetName === sheet.name);
      const rows = sheet.rows.map((r) => r.slice());
      if (plan) applyToMatrix(rows, plan);
      const ws = wb.addWorksheet(safeSheetName(sheet.name));
      rows.forEach((r, i) => (ws.getRow(i + 1).values = [undefined, ...r]));
      styleImportedSheet(ws, plan?.headerRow ?? sheet.headerRow, rows);
    }
  }

  if (meta) {
    addResumoSheet(wb, plans, meta);
    addUnmatchedSheet(wb, plans);
    if (meta.options.includeCatalogSheet && meta.catalogAssets?.length) {
      addCatalogSheet(wb, meta.catalogAssets);
    }
  }

  wb.creator = "APONTAUTO · Inteligência de Ativos";
  wb.modified = meta?.processedAt ?? new Date();

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const validation = await validateOutput(buf);
  return { blob, fileName: processedFileName(meta?.processedAt), validation };
}

const safeSheetName = (name: string) =>
  (name || "Planilha").replace(/[\\/*?:[\]]/g, " ").slice(0, 31);

/** Formatação leve para planilhas vindas de .xls/.csv (sem estilo original). */
function styleImportedSheet(ws: any, headerRow: number, rows: string[][]) {
  const header = ws.getRow(headerRow + 1);
  header.font = { name: FONT, size: 11, bold: true, color: { argb: TEXT_LIGHT } };
  header.eachCell?.((cell: any) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ELECTRIC } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = THIN_BORDER;
  });
  header.height = 20;
  ws.views = [{ state: "frozen", ySplit: headerRow + 1 }];
  const cols = rows[headerRow]?.length ?? 0;
  for (let c = 1; c <= cols; c++) {
    let max = 10;
    for (let r = headerRow; r < Math.min(rows.length, headerRow + 400); r++) {
      const len = String(rows[r]?.[c - 1] ?? "").length;
      if (len > max) max = len;
    }
    ws.getColumn(c).width = Math.min(max + 3, 46);
  }
  if (cols > 0) {
    ws.autoFilter = {
      from: { row: headerRow + 1, column: 1 },
      to: { row: Math.max(rows.length, headerRow + 1), column: cols },
    };
  }
}

/* ------------------------------------------------------------------ abas + */

function addResumoSheet(wb: any, plans: SheetPlan[], meta: ProcessMeta) {
  const existing = wb.getWorksheet(RESUMO_SHEET);
  if (existing) wb.removeWorksheet(existing.id);
  const ws = wb.addWorksheet(RESUMO_SHEET, { properties: { tabColor: { argb: NAVY } } });

  const when = meta.processedAt;
  addCorporateHeader(
    ws,
    "APONTAUTO · Inteligência de Ativos",
    `Resumo do processamento — ${when.toLocaleString("pt-BR")}`,
    4,
  );

  const info: [string, string][] = [
    ["Arquivo original", meta.originalFileName],
    ["Data e hora", when.toLocaleString("pt-BR")],
    ["Usuário", meta.user || "—"],
    ["Base de ativos", meta.catalogName],
    ["Versão da base", meta.catalogVersion == null ? "—" : String(meta.catalogVersion)],
    ["Abas processadas", plans.map((p) => p.sheetName).join(", ") || "—"],
    ["Tempo de processamento", `${(meta.durationMs / 1000).toFixed(1)} s`],
  ];

  const infoCols: ColumnSpec[] = [
    { header: "Informação", width: 28 },
    { header: "Valor", width: 62, wrap: true },
  ];
  let row = writeTableHeader(ws, 4, infoCols);
  row = writeTableRows(ws, row, infoCols, info);

  row += 1;
  const totalsCols: ColumnSpec[] = [
    { header: "Status", width: 34 },
    { header: "Quantidade", width: 16, numFmt: "#,##0" },
  ];
  const totalsRows: [string, number][] = [
    ["Abas processadas", meta.totals.sheets ?? plans.length],
    ["Linhas com ativo", meta.totals.rowsWithAsset ?? 0],
    ["Resolvidos pela hierarquia", meta.totals.tree ?? 0],
    ["Fallback legado", meta.totals.legacy ?? 0],
    ["Valores preservados", meta.totals.preserved ?? 0],
    ["Conflitos", meta.totals.conflicts ?? 0],
    ["Não encontrados", meta.totals.unmatched ?? 0],
    ["Células alteradas", meta.totals.changed ?? 0],
  ];
  const totalsHeader = row;
  row = writeTableHeader(ws, row, totalsCols);
  row = writeTableRows(ws, row, totalsCols, totalsRows);
  applyStatusConditionalFormatting(ws, 1, totalsHeader + 1, row - 1);

  row += 1;
  const optCols: ColumnSpec[] = [
    { header: "Opção utilizada", width: 44 },
    { header: "Valor", width: 16 },
  ];
  const yn = (v: boolean) => (v ? "Sim" : "Não");
  const optRows: [string, string][] = [
    ["Sobrescrever valores existentes", yn(meta.options.overwrite)],
    ["Coluna “Método de Resolução”", yn(meta.options.addMethodColumn)],
    ["Comentário na célula", yn(meta.options.addComment)],
    ["Aba “Base de Ativos Utilizada”", yn(meta.options.includeCatalogSheet)],
  ];
  row = writeTableHeader(ws, row, optCols);
  row = writeTableRows(ws, row, optCols, optRows);

  ws.getColumn(1).width = 34;
  ws.getColumn(2).width = 62;
}

function addUnmatchedSheet(wb: any, plans: SheetPlan[]) {
  const existing = wb.getWorksheet(NAO_ENCONTRADOS_SHEET);
  if (existing) wb.removeWorksheet(existing.id);
  const ws = wb.addWorksheet(NAO_ENCONTRADOS_SHEET, {
    properties: { tabColor: { argb: "FFB91C1C" } },
  });

  const cols: ColumnSpec[] = [
    { header: "Aba", width: 22 },
    { header: "Linha", width: 10, numFmt: "0" },
    { header: "Código do ativo", width: 22, text: true },
    { header: "Prédio (original)", width: 20 },
    { header: "Andar (original)", width: 18 },
    { header: "Ambiente (original)", width: 26 },
    { header: "Status do Match", width: 22 },
    { header: "Motivo", width: 42, wrap: true },
    { header: "Sugestão / correção manual", width: 34, wrap: true },
  ];

  const data: unknown[][] = [];
  for (const plan of plans) {
    for (const r of plan.results) {
      if (r.status !== "unmatched" && r.status !== "conflict") continue;
      const suggestion =
        r.status === "conflict"
          ? `Calculado: ${r.computed.filter(Boolean).join(" · ") || "—"}`
          : r.computed.some(Boolean)
            ? r.computed.join(" · ")
            : "";
      data.push([
        plan.sheetName,
        r.row,
        r.code,
        r.current[0],
        r.current[1],
        r.current[2],
        statusLabelOf(r),
        r.status === "conflict"
          ? "Conflito entre o valor existente e o valor calculado"
          : r.issues.join("; ") || "Código não encontrado no catálogo",
        suggestion,
      ]);
    }
  }

  addCorporateHeader(
    ws,
    "Ativos não encontrados e conflitos",
    `${data.length} ocorrência(s) para revisão manual`,
    cols.length,
  );
  const headerRow = 4;
  const first = writeTableHeader(ws, headerRow, cols);
  const last = writeTableRows(ws, first, cols, data);
  autoFitColumns(ws, cols, data);
  finishTable(ws, headerRow, cols.length, last - 1);
  applyStatusConditionalFormatting(ws, 7, first, Math.max(last - 1, first));
}

function addCatalogSheet(
  wb: any,
  assets: { code: string; name: string; level: string; parentCode: string }[],
) {
  const existing = wb.getWorksheet(BASE_SHEET);
  if (existing) wb.removeWorksheet(existing.id);
  const ws = wb.addWorksheet(BASE_SHEET, { state: "hidden" });
  const cols: ColumnSpec[] = [
    { header: "Código", width: 24, text: true },
    { header: "Denominação", width: 48, wrap: true },
    { header: "Nível", width: 18 },
    { header: "Código do pai", width: 24, text: true },
  ];
  addCorporateHeader(ws, "Base de ativos utilizada", `${assets.length} ativo(s)`, cols.length);
  const headerRow = 4;
  const first = writeTableHeader(ws, headerRow, cols);
  const data = assets.map((a) => [a.code, a.name, a.level, a.parentCode]);
  const last = writeTableRows(ws, first, cols, data);
  finishTable(ws, headerRow, cols.length, last - 1);
}

/* ------------------------------------------------------------- validação + */

export interface ValidationReport {
  ok: boolean;
  sheets: number;
  refErrors: string[];
}

/** Reabre o arquivo gerado para garantir que não está corrompido nem com #REF!. */
async function validateOutput(buffer: ArrayBuffer): Promise<ValidationReport> {
  try {
    const ExcelJS = await loadExcelJS();
    const check = new ExcelJS.Workbook();
    await check.xlsx.load(buffer);
    const refErrors: string[] = [];
    for (const name of [RESUMO_SHEET, NAO_ENCONTRADOS_SHEET, BASE_SHEET]) {
      const ws = check.getWorksheet(name);
      if (!ws) continue;
      ws.eachRow((row: any, rowNumber: number) => {
        row.eachCell?.({ includeEmpty: false }, (cell: any, col: number) => {
          const v = cell.value;
          const text =
            typeof v === "string"
              ? v
              : v && typeof v === "object" && (v as any).error
                ? String((v as any).error)
                : "";
          if (text.includes("#REF!")) refErrors.push(`${name}!${col}:${rowNumber}`);
        });
      });
    }
    return { ok: refErrors.length === 0, sheets: check.worksheets.length, refErrors };
  } catch {
    return { ok: false, sheets: 0, refErrors: ["Arquivo gerado não pôde ser reaberto"] };
  }
}

/* --------------------------------------------------------------- modelo -- */

export const TEMPLATE_COLUMNS = [
  "Prédio",
  "Andar",
  "Ambiente",
  "Número OS",
  "Denominação OS",
  "Centro de Custo",
  "Criticidade",
  "Data Prevista Máxima",
  "Descrição OS",
  "Prioridade",
  "Solicitante",
  "Unidade de Negócio",
  "Ativo",
  "Denominação Ativo",
  "Data/Hora Solicitação",
  "Técnico",
  "Data Limite",
  STATUS_HEADER,
];

/** Gera o modelo vazio, já formatado, para preenchimento manual. */
export async function buildBlankTemplate(): Promise<{ blob: Blob; fileName: string }> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "APONTAUTO · Inteligência de Ativos";
  const ws = wb.addWorksheet("Ordens de Serviço", {
    properties: { tabColor: { argb: NAVY } },
  });

  const dateCols = new Set(["Data Prevista Máxima", "Data/Hora Solicitação", "Data Limite"]);
  const cols: ColumnSpec[] = TEMPLATE_COLUMNS.map((header) => ({
    header,
    text: header === "Ativo" || header === "Número OS",
    numFmt: dateCols.has(header) ? DATE_FMT : undefined,
    width: header === "Descrição OS" || header === "Denominação OS" ? 42 : undefined,
  }));

  addCorporateHeader(
    ws,
    "APONTAUTO · Modelo de planilha PCM",
    `Preencha as colunas abaixo e envie em Inteligência de Ativos · ${new Date().toLocaleDateString("pt-BR")}`,
    cols.length,
  );
  const headerRow = 4;
  writeTableHeader(ws, headerRow, cols);
  autoFitColumns(ws, cols, []);
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.text) col.numFmt = "@";
    else if (c.numFmt) col.numFmt = c.numFmt;
  });
  // Reserva 500 linhas com bordas discretas para uso imediato.
  for (let r = headerRow + 1; r <= headerRow + 500; r++) {
    const row = ws.getRow(r);
    cols.forEach((_, i) => {
      const cell = row.getCell(i + 1);
      cell.border = THIN_BORDER;
      cell.font = { name: FONT, size: 10 };
      if ((r - headerRow) % 2 === 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      }
    });
    row.commit?.();
  }
  finishTable(ws, headerRow, cols.length, headerRow + 500);
  applyStatusConditionalFormatting(
    ws,
    TEMPLATE_COLUMNS.indexOf(STATUS_HEADER) + 1,
    headerRow + 1,
    headerRow + 500,
  );

  const buf = await wb.xlsx.writeBuffer();
  return {
    blob: new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName: "PCM_MODELO_PLANILHA.xlsx",
  };
}

/**
 * Índices finais das colunas de destino, acrescentando as que faltam.
 *
 * As colunas novas são adicionadas SEMPRE ao final da aba: inserir no meio
 * deslocaria fórmulas, mesclagens e validações do arquivo original.
 */
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

  const at = Math.max(headerLen, plan.ativoIndex + 1);
  missing.forEach((m, i) => {
    t[m.key] = at + i;
  });
  return { targets: t, inserts: { at, headers: missing.map((m) => m.header) } };
}

function applyToExcelJsSheet(ws: any, plan: SheetPlan) {
  const headerRowNum = plan.headerRow + 1;
  const { targets, inserts } = resolveWriteColumns(plan, ws.columnCount ?? 0);

  if (inserts) {
    const headerRow = ws.getRow(headerRowNum);
    const model = headerRow.getCell(Math.max(plan.ativoIndex + 1, 1));
    inserts.headers.forEach((h, i) => {
      const idx = inserts.at + i + 1;
      const cell = headerRow.getCell(idx);
      cell.value = h;
      cell.font = model.font ?? { bold: true };
      cell.fill = model.fill;
      cell.border = model.border;
      cell.alignment = model.alignment ?? { vertical: "middle", wrapText: true };
      ws.getColumn(idx).width = Math.max(String(h).length + 6, 18);
    });
    headerRow.commit?.();
  }
  let firstDataRow = Number.MAX_SAFE_INTEGER;
  let lastDataRow = 0;

  for (const r of plan.results) {
    if (r.status === "empty") continue;
    const row = ws.getRow(r.row);
    if (r.row < firstDataRow) firstDataRow = r.row;
    if (r.row > lastDataRow) lastDataRow = r.row;
    const set = (colIdx: number, value: string) => {
      if (colIdx < 0 || !value) return;
      row.getCell(colIdx + 1).value = value;
    };
    set(targets.predio, r.final[0]);
    set(targets.andar, r.final[1]);
    set(targets.ambiente, r.final[2]);
    if (targets.status >= 0) row.getCell(targets.status + 1).value = statusLabelOf(r);
    if (plan.options.addMethodColumn && targets.method >= 0)
      row.getCell(targets.method + 1).value = METHOD_LABEL[r.method] ?? r.method;
    if (plan.options.addComment && targets.predio >= 0) {
      row.getCell(targets.predio + 1).note = `Ativo ${r.code} · catálogo ${plan.catalogName}`;
    }
    row.commit?.();
  }

  if (targets.status >= 0 && lastDataRow >= firstDataRow) {
    applyStatusConditionalFormatting(ws, targets.status + 1, firstDataRow, lastDataRow);
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
    if (targets.status >= 0) set(targets.status, statusLabelOf(r));
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
  const rows = [
    ["Aba", "Linha", "Ativo", "Motivo", "Prédio atual", "Andar atual", "Ambiente atual"],
  ];
  for (const plan of plans) {
    for (const r of plan.results) {
      if (r.status !== "unmatched" && r.status !== "conflict") continue;
      rows.push([
        plan.sheetName,
        String(r.row),
        r.code,
        r.status === "conflict"
          ? "Conflito com valor existente"
          : r.issues.join("; ") || "Código não encontrado",
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
