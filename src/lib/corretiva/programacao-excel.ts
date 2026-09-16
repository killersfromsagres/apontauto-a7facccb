import ExcelJS from "exceljs";
import type { OsCacheRow } from "./db";
import {
  BACKORDER_HEX,
  classifyPriority,
  PRIORITY_HEX,
  type PriorityLevel,
} from "./priority-classifier";

export type ProgramacaoExportRow = OsCacheRow & {
  tipo_importacao?: string | null;
  programacao_status?: string | null;
  programacao_dia?: string | null;
  programacao_periodo?: string | null;
  programacao_equipe?: string | null;
};

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;
const C = {
  navy950: argb("#06111F"), navy900: argb("#0B1F33"), navy800: argb("#12314C"),
  blue700: argb("#1D4ED8"), blue600: argb("#2563EB"), sky50: argb("#F0F9FF"), sky700: argb("#0369A1"),
  amber700: argb("#B45309"), amber500: argb("#F59E0B"), rose700: argb("#BE123C"),
  white: argb("#FFFFFF"), slate900: argb("#0F172A"), slate700: argb("#334155"), slate500: argb("#64748B"),
  slate300: argb("#CBD5E1"), slate200: argb("#E2E8F0"), slate100: argb("#F1F5F9"), slate50: argb("#F8FAFC"),
  backorder: argb(BACKORDER_HEX.bg),
};

const FONT = "Aptos";
const FONT_DISPLAY = "Aptos Display";
export const OPERATIONS_FONT = "Aptos ExtraBold";
export const OPERATIONS_FONT_SIZE = 12;
export const OPERATIONS_ROW_HEIGHT = 66;

const thinBorder = {
  top: { style: "thin" as const, color: { argb: C.slate200 } },
  bottom: { style: "thin" as const, color: { argb: C.slate200 } },
  left: { style: "thin" as const, color: { argb: C.slate200 } },
  right: { style: "thin" as const, color: { argb: C.slate200 } },
};


const TEAM_STYLE: Record<string, { bg: string; fg: string; accent: string }> = {
  ELETRICA: { bg: "#FFF7E6", fg: "#92400E", accent: "#F59E0B" },
  HIDRAULICA: { bg: "#FFF7ED", fg: "#C2410C", accent: "#F97316" },
  CIVIL: { bg: "#F0FDFA", fg: "#0F766E", accent: "#2DD4BF" },
  CHAVEIRO: { bg: "#F5F3FF", fg: "#6D28D9", accent: "#8B5CF6" },
  PINTURA: { bg: "#FDF2F8", fg: "#BE185D", accent: "#EC4899" },
  REFRIGERACAO: { bg: "#F0F9FF", fg: "#0369A1", accent: "#38BDF8" },
  LIMPEZA: { bg: "#F0FDF4", fg: "#15803D", accent: "#22C55E" },
  OUTROS: { bg: "#F8FAFC", fg: "#475569", accent: "#94A3B8" },
};

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

function teamStyle(team: string | null | undefined) {
  const value = normalize(team);
  if (value.includes("ELETR")) return TEAM_STYLE.ELETRICA;
  if (value.includes("HIDRAUL")) return TEAM_STYLE.HIDRAULICA;
  if (value.includes("CIVIL")) return TEAM_STYLE.CIVIL;
  if (value.includes("CHAVE")) return TEAM_STYLE.CHAVEIRO;
  if (value.includes("PINT")) return TEAM_STYLE.PINTURA;
  if (value.includes("REFRIG") || value.includes("CLIMAT") || value.includes("AR COND")) return TEAM_STYLE.REFRIGERACAO;
  if (value.includes("LIMPE") || value.includes("HIGIEN")) return TEAM_STYLE.LIMPEZA;
  return TEAM_STYLE.OUTROS;
}

function statusLabel(status: string | null | undefined) {
  const value = normalize(status || "aberto");
  if (["CONCLUIDO", "CONCLUIDA", "FINALIZADO", "FINALIZADA", "FECHADO", "FECHADA"].includes(value)) return "Concluído";
  if (["EM ANDAMENTO", "EM EXECUCAO", "EXECUCAO", "ANDAMENTO"].includes(value)) return "Em andamento";
  if (["AGUARDANDO MATERIAL", "MATERIAL", "AGUARDANDO PECA", "AGUARDANDO PECAS"].includes(value)) return "Aguardando material";
  if (["CANCELADO", "CANCELADA"].includes(value)) return "Cancelado";
  return status ? String(status) : "Aberto";
}

function materialRequested(item: OsCacheRow) { return normalize(item.material_status) === "SOLICITADO"; }
function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}
function safeSheetName(value: string, used: Set<string>) {
  const base = value.replace(/[\\/*?:\[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Equipe";
  let candidate = base; let suffix = 2;
  while (used.has(candidate)) { const ending = ` ${suffix++}`; candidate = `${base.slice(0, Math.max(1, 31 - ending.length))}${ending}`; }
  used.add(candidate); return candidate;
}
function excelColumnName(index: number) {
  let value = Math.max(1, index); let result = "";
  while (value > 0) { value -= 1; result = String.fromCharCode(65 + (value % 26)) + result; value = Math.floor(value / 26); }
  return result;
}
function setWorkbookMetadata(workbook: ExcelJS.Workbook, title: string, generatedAt: Date) {
  workbook.creator = "Apont Auto"; workbook.lastModifiedBy = "Apont Auto"; workbook.company = "Apont Auto";
  workbook.title = title; workbook.subject = "Controle de chamados corretivos";
  workbook.description = "Corretivas priorizadas por risco, SLA, aging e Backorder.";
  workbook.created = generatedAt; workbook.modified = generatedAt; workbook.calcProperties.fullCalcOnLoad = true;
}
function configurePrint(sheet: ExcelJS.Worksheet, printArea: string, repeatRows?: string) {
  sheet.pageSetup = {
    orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, horizontalCentered: true,
    blackAndWhite: false, margins: { left: 0.18, right: 0.18, top: 0.35, bottom: 0.4, header: 0.15, footer: 0.15 }, printArea,
  };
  if (repeatRows) sheet.pageSetup.printTitlesRow = repeatRows;
  sheet.headerFooter.oddFooter = "&L&9Apont Auto · Corretivas&C&9Página &P de &N&R&9Prioridade operacional";
}
function priorityArgb(level: PriorityLevel) { return { bg: argb(PRIORITY_HEX[level].bg), fg: argb(PRIORITY_HEX[level].fg) }; }
function stylePriorityCell(cell: ExcelJS.Cell, level: PriorityLevel, score: number) {
  const colors = priorityArgb(level);
  cell.value = `${level} · ${score}`;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.bg } };
  cell.font = { name: OPERATIONS_FONT, size: 11.5, bold: true, color: { argb: colors.fg } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = thinBorder;
}
function visualLineCount(value: unknown, charsPerLine: number) {
  const text = String(value ?? "").trim(); if (!text) return 1;
  return text.split(/\r?\n/).reduce((total, part) => total + Math.max(1, Math.ceil(part.trim().length / charsPerLine)), 0);
}
function intelligentRowHeight(item: ProgramacaoExportRow, reasons: string, includeProgramControl: boolean) {
  const lines = Math.max(
    visualLineCount(reasons, 42), visualLineCount(item.equipe || "Sem equipe", 22),
    visualLineCount(`${item.predio || ""} / ${item.andar || ""}`, 22), visualLineCount(item.local || "", 28),
    visualLineCount(item.nome_os || "", 54), includeProgramControl ? visualLineCount(item.programacao_periodo || "", 28) : 1, 2,
  );
  return Math.min(330, Math.max(OPERATIONS_ROW_HEIGHT, 30 + lines * 20));
}
function hasProgramControl(items: ProgramacaoExportRow[]) {
  return items.some((item) => item.programacao_status || item.programacao_dia || item.programacao_periodo || item.programacao_equipe);
}

function buildOperationsSheet(
  workbook: ExcelJS.Workbook, name: string, items: ProgramacaoExportRow[], title: string, scope: string,
  generatedAt: Date, tabColor: string,
) {
  const includeProgramControl = hasProgramControl(items);
  const baseHeaders = [
    "OS", "Prioridade", "Tipo", "Motivo da prioridade", "Equipe", "Solicitante", "Prédio / Andar", "Local",
    "Descrição do Serviço", "Abertura", "SLA", "Material", "Status Atual",
  ];
  const programHeaders = ["Programação", "Dia programado", "Período da programação", "Equipe programada"];
  const headers = includeProgramControl ? [...baseHeaders, ...programHeaders] : baseHeaders;
  const widths = includeProgramControl
    ? [16, 18, 16, 48, 24, 24, 30, 38, 78, 16, 17, 18, 22, 22, 22, 32, 28]
    : [16, 18, 16, 48, 24, 24, 30, 38, 78, 16, 17, 18, 22];
  const lastColumn = excelColumnName(headers.length);
  const sheet = workbook.addWorksheet(name, { properties: { tabColor: { argb: tabColor }, defaultRowHeight: OPERATIONS_ROW_HEIGHT } });
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 5, showGridLines: false }];

  sheet.mergeCells(`A1:${lastColumn}1`); sheet.mergeCells(`A2:${lastColumn}2`);
  const titleCell = sheet.getCell("A1");
  titleCell.value = title.toUpperCase();
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy950 } };
  titleCell.font = { name: FONT_DISPLAY, size: 22, bold: true, color: { argb: C.white } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  const subtitle = sheet.getCell("A2");
  subtitle.value = `${scope} • ${items.length} OS • Gerado em ${generatedAt.toLocaleString("pt-BR")}`;
  subtitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy900 } };
  subtitle.font = { name: FONT, size: 10, bold: true, color: { argb: C.slate300 } };
  subtitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(1).height = 44; sheet.getRow(2).height = 25;

  const priorityCounts: Record<PriorityLevel, number> = { CRÍTICA: 0, ALTA: 0, MÉDIA: 0, NORMAL: 0 };
  let backorders = 0;
  items.forEach((item) => { const p = classifyPriority(item, generatedAt); priorityCounts[p.level] += 1; if (p.isBackorder) backorders += 1; });
  const cardRanges = includeProgramControl ? ["A3:D3", "E3:H3", "I3:L3", "M3:Q3"] : ["A3:C3", "D3:F3", "G3:I3", "J3:M3"];
  const cards = [
    [cardRanges[0], `TOTAL · ${items.length}`, C.blue700],
    [cardRanges[1], `CRÍTICA · ${priorityCounts.CRÍTICA}`, argb(PRIORITY_HEX.CRÍTICA.bg)],
    [cardRanges[2], `ALTA · ${priorityCounts.ALTA}`, argb(PRIORITY_HEX.ALTA.bg)],
    [cardRanges[3], `BACKORDER · ${backorders}`, C.backorder],
  ] as const;
  cards.forEach(([range, value, color]) => {
    sheet.mergeCells(range); const cell = sheet.getCell(range.split(":")[0]); cell.value = value;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    const foreground = String(value).startsWith("CRÍTICA") ? argb(PRIORITY_HEX.CRÍTICA.fg) : String(value).startsWith("ALTA") ? argb(PRIORITY_HEX.ALTA.fg) : String(value).startsWith("BACKORDER") ? argb(BACKORDER_HEX.fg) : C.white;
    cell.font = { name: FONT_DISPLAY, size: 11.5, bold: true, color: { argb: foreground } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  sheet.getRow(3).height = 31; sheet.getRow(4).height = 7;

  const headerRow = sheet.getRow(5);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1); cell.value = header;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy800 } };
    cell.font = { name: OPERATIONS_FONT, size: 10, bold: true, color: { argb: C.white } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; cell.border = thinBorder;
  });
  headerRow.height = 38;

  let rowNumber = 6;
  for (const item of items) {
    const row = sheet.getRow(rowNumber++); const priority = classifyPriority(item, generatedAt);
    const reasons = priority.reasons.slice(0, 4).join(" · ");
    const sla = priority.daysToDue == null ? "—" : priority.daysToDue < 0 ? `${Math.abs(priority.daysToDue)} dias vencido` : priority.daysToDue <= 2 ? `Vence em ${priority.daysToDue} dia(s)` : `${priority.daysToDue} dias`;
    const baseValues = [
      item.numero_os, "", priority.isBackorder ? "BACKORDER" : "CORRETIVA", reasons, item.equipe || "Sem equipe",
      item.solicitante || "—", `${item.predio || "—"} / ${item.andar || "—"}`, item.local || "—",
      item.nome_os || "Sem descrição", formatDate(item.data_criacao), sla, materialRequested(item) ? "SOLICITADO" : "—", statusLabel(item.status),
    ];
    const values = includeProgramControl ? [...baseValues, item.programacao_status || "EM PROGRAMAÇÃO", item.programacao_dia || "—", item.programacao_periodo || "—", item.programacao_equipe || item.equipe || "—"] : baseValues;
    values.forEach((value, index) => {
      const cell = row.getCell(index + 1); cell.value = value;
      const large = [0, 6, 7, 8].includes(index);
      cell.font = { name: large ? OPERATIONS_FONT : FONT, size: index === 8 ? 14 : [6, 7].includes(index) ? 12.5 : index === 0 ? 12 : 9.5, bold: large || index === 4, color: { argb: C.slate900 } };
      cell.alignment = { vertical: "middle", horizontal: [0, 1, 2, 9, 10, 11, 12, 13, 14].includes(index) ? "center" : "left", wrapText: true };
      cell.border = thinBorder; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowNumber % 2 === 0 ? C.slate50 : C.white } };
    });

    stylePriorityCell(row.getCell(2), priority.level, priority.score);
    const typeCell = row.getCell(3);
    if (priority.isBackorder) {
      typeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.backorder } };
      typeCell.font = { name: OPERATIONS_FONT, size: 10.5, bold: true, color: { argb: C.white } };
    } else {
      typeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate100 } };
      typeCell.font = { name: FONT, size: 9.5, bold: true, color: { argb: C.slate700 } };
    }
    typeCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

    const team = teamStyle(item.equipe); const teamCell = row.getCell(5);
    teamCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(team.bg) } };
    teamCell.font = { name: OPERATIONS_FONT, size: 10, bold: true, color: { argb: argb(team.fg) } };
    teamCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

    if (priority.dueState === "OVERDUE") {
      const slaCell = row.getCell(11); slaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#FFF1F2") } };
      slaCell.font = { name: FONT, size: 9.5, bold: true, color: { argb: C.rose700 } };
    }
    if (materialRequested(item)) {
      const cell = row.getCell(12); cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#FFFBEB") } };
      cell.font = { name: FONT, size: 9.5, bold: true, color: { argb: C.amber700 } };
    }
    if (includeProgramControl) {
      const cell = row.getCell(14); cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.sky50 } };
      cell.font = { name: OPERATIONS_FONT, size: 9.5, bold: true, color: { argb: C.sky700 } };
    }
    row.height = intelligentRowHeight(item, reasons, includeProgramControl);
  }

  if (items.length === 0) {
    sheet.mergeCells(`A6:${lastColumn}7`); const empty = sheet.getCell("A6"); empty.value = "Nenhuma OS disponível para esta exportação.";
    empty.font = { name: FONT, size: 11, bold: true, color: { argb: C.slate500 } }; empty.alignment = { vertical: "middle", horizontal: "center" };
  }
  const lastRow = Math.max(7, rowNumber - 1); sheet.autoFilter = `A5:${lastColumn}5`; configurePrint(sheet, `A1:${lastColumn}${lastRow}`, "1:5");
  return sheet;
}

function buildExecutiveSheet(workbook: ExcelJS.Workbook, items: ProgramacaoExportRow[], title: string, generatedAt: Date) {
  const sheet = workbook.addWorksheet("Visão Executiva", { properties: { tabColor: { argb: C.amber500 } } });
  for (let index = 1; index <= 12; index += 1) sheet.getColumn(index).width = 12;
  sheet.views = [{ state: "normal", showGridLines: false }];
  const counts: Record<PriorityLevel, number> = { CRÍTICA: 0, ALTA: 0, MÉDIA: 0, NORMAL: 0 }; let backorders = 0;
  items.forEach((item) => { const p = classifyPriority(item, generatedAt); counts[p.level] += 1; if (p.isBackorder) backorders += 1; });
  sheet.mergeCells("A1:L1"); const heading = sheet.getCell("A1"); heading.value = `${title.toUpperCase()} · VISÃO EXECUTIVA`;
  heading.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy950 } }; heading.font = { name: FONT_DISPLAY, size: 20, bold: true, color: { argb: C.white } };
  heading.alignment = { vertical: "middle", horizontal: "left", indent: 1 }; sheet.getRow(1).height = 44;
  const cards = [
    ["A3:C5", `TOTAL\n${items.length}`, C.blue700], ["D3:F5", `CRÍTICAS\n${counts.CRÍTICA}`, argb(PRIORITY_HEX.CRÍTICA.bg)],
    ["G3:I5", `ALTAS\n${counts.ALTA}`, argb(PRIORITY_HEX.ALTA.bg)], ["J3:L5", `BACKORDER\n${backorders}`, C.backorder],
  ] as const;
  cards.forEach(([range, value, color]) => { sheet.mergeCells(range); const cell = sheet.getCell(range.split(":")[0]); cell.value = value;
    const foreground = String(value).startsWith("CRÍTICAS") ? argb(PRIORITY_HEX.CRÍTICA.fg) : String(value).startsWith("ALTAS") ? argb(PRIORITY_HEX.ALTA.fg) : String(value).startsWith("BACKORDER") ? argb(BACKORDER_HEX.fg) : C.white;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } }; cell.font = { name: FONT_DISPLAY, size: 15, bold: true, color: { argb: foreground } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; });
  sheet.getRow(3).height = 28; sheet.getRow(4).height = 28; sheet.getRow(5).height = 28;
  sheet.mergeCells("A7:L7"); const note = sheet.getCell("A7");
  note.value = "Prioridade única para tela, Excel, PDF e Programação: risco real + SLA + antiguidade + contexto. Backorder é destacado e recebe aging, mas não vira crítico apenas por ser Backorder.";
  note.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate100 } }; note.font = { name: FONT, size: 10, bold: true, color: { argb: C.slate700 } };
  note.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; sheet.getRow(7).height = 44; configurePrint(sheet, "A1:L7"); return sheet;
}

export function buildProgramacaoWorkbook(osList: ProgramacaoExportRow[], equipeFiltro: string, aba: "corretiva" | "preventiva", generatedAt = new Date()) {
  const workbook = new ExcelJS.Workbook();
  const title = aba === "preventiva" ? "Programação de Backorder" : hasProgramControl(osList) ? "Corretivas em Programação" : "Programação de Corretivas";
  setWorkbookMetadata(workbook, title, generatedAt); buildExecutiveSheet(workbook, osList, title, generatedAt);
  buildOperationsSheet(workbook, "Programação Geral", osList, title, equipeFiltro, generatedAt, C.blue600);
  const usedNames = new Set(["Visão Executiva", "Programação Geral"]);
  const teams = [...new Set(osList.map((item) => item.equipe || "Sem equipe"))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  teams.forEach((team) => {
    const teamItems = osList.filter((item) => (item.equipe || "Sem equipe") === team); const sheetName = safeSheetName(`Equipe · ${team}`, usedNames); const palette = teamStyle(team);
    buildOperationsSheet(workbook, sheetName, teamItems, `${title} · ${team}`, `Equipe: ${team}`, generatedAt, argb(palette.accent));
  });
  workbook.worksheets.forEach((sheet) => { sheet.pageSetup.blackAndWhite = false; }); workbook.worksheets[0].state = "visible"; return workbook;
}

export async function generateProgramacaoExcel(osList: ProgramacaoExportRow[], equipeFiltro: string, aba: "corretiva" | "preventiva") {
  const generatedAt = new Date(); const workbook = buildProgramacaoWorkbook(osList, equipeFiltro, aba, generatedAt); const buffer = await workbook.xlsx.writeBuffer();
  const { saveAs } = await import("file-saver");
  const slug = equipeFiltro.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `programacao_${aba}_${slug || "todas_equipes"}_${generatedAt.toISOString().slice(0, 10)}.xlsx`);
}
