import ExcelJS from "exceljs";
import type { OsCacheRow } from "./db";

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

const C = {
  navy950: argb("#06111F"),
  navy900: argb("#0B1F33"),
  navy800: argb("#12314C"),
  blue700: argb("#1D4ED8"),
  blue600: argb("#2563EB"),
  blue50: argb("#EFF6FF"),
  cyan600: argb("#0891B2"),
  cyan50: argb("#ECFEFF"),
  emerald700: argb("#047857"),
  emerald600: argb("#059669"),
  emerald50: argb("#ECFDF5"),
  amber700: argb("#B45309"),
  amber500: argb("#F59E0B"),
  amber50: argb("#FFFBEB"),
  rose700: argb("#BE123C"),
  rose600: argb("#E11D48"),
  rose50: argb("#FFF1F2"),
  violet700: argb("#6D28D9"),
  violet50: argb("#F5F3FF"),
  white: argb("#FFFFFF"),
  slate900: argb("#0F172A"),
  slate700: argb("#334155"),
  slate500: argb("#64748B"),
  slate300: argb("#CBD5E1"),
  slate200: argb("#E2E8F0"),
  slate100: argb("#F1F5F9"),
  slate50: argb("#F8FAFC"),
};

const FONT = "Aptos";
const FONT_DISPLAY = "Aptos Display";
const thinBorder = { style: "thin", color: { argb: C.slate200 } } as const;

const TEAM_PALETTE = [
  { bg: "#FFF7E6", fg: "#92400E", accent: "#F59E0B" },
  { bg: "#EAF7FF", fg: "#075985", accent: "#0EA5E9" },
  { bg: "#F3EEFF", fg: "#5B21B6", accent: "#8B5CF6" },
  { bg: "#ECFDF3", fg: "#047857", accent: "#10B981" },
  { bg: "#FFF0F6", fg: "#9D174D", accent: "#EC4899" },
  { bg: "#ECFEFF", fg: "#0E7490", accent: "#06B6D4" },
  { bg: "#F2F4F7", fg: "#344054", accent: "#667085" },
] as const;

function normalize(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash;
}

function teamStyle(team: string | null | undefined) {
  const explicit: Record<string, number> = {
    ELETRICA: 0,
    HIDRAULICA: 1,
    CIVIL: 2,
    LIMPEZA: 3,
    PINTURA: 4,
    REFRIGERACAO: 5,
    CHAVEIRO: 6,
  };
  const value = normalize(team) || "OUTROS";
  return TEAM_PALETTE[explicit[value] ?? hashText(value) % TEAM_PALETTE.length];
}

function statusLabel(status: string | null | undefined) {
  const value = normalize(status || "aberto");
  if (["CONCLUIDO", "CONCLUIDA", "FINALIZADO", "FINALIZADA", "FECHADO", "FECHADA"].includes(value)) return "Concluído";
  if (["EM ANDAMENTO", "EM EXECUCAO", "EXECUCAO", "ANDAMENTO"].includes(value)) return "Em andamento";
  if (["AGUARDANDO MATERIAL", "MATERIAL", "AGUARDANDO PECA", "AGUARDANDO PECAS"].includes(value)) return "Aguardando material";
  if (["CANCELADO", "CANCELADA"].includes(value)) return "Cancelado";
  return status ? String(status) : "Aberto";
}

function ageInDays(iso: string | null | undefined) {
  if (!iso) return 0;
  const timestamp = new Date(iso).getTime();
  return Number.isNaN(timestamp) ? 0 : Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function materialRequested(item: OsCacheRow) {
  return normalize(item.material_status) === "SOLICITADO";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

function safeSheetName(value: string, used: Set<string>) {
  const base = value.replace(/[\\/*?:\[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Equipe";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    const ending = ` ${suffix++}`;
    candidate = `${base.slice(0, Math.max(1, 31 - ending.length))}${ending}`;
  }
  used.add(candidate);
  return candidate;
}

function setWorkbookMetadata(workbook: ExcelJS.Workbook, title: string, generatedAt: Date) {
  workbook.creator = "Apont Auto";
  workbook.lastModifiedBy = "Apont Auto";
  workbook.company = "Apont Auto";
  workbook.title = title;
  workbook.subject = "Programação de execução de campo";
  workbook.description = "Relatório executivo premium de programação de ordens de serviço.";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  workbook.calcProperties.fullCalcOnLoad = true;
}

function styleTitle(sheet: ExcelJS.Worksheet, title: string, subtitle: string, lastColumn: string) {
  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.mergeCells(`A2:${lastColumn}2`);

  const titleCell = sheet.getCell("A1");
  titleCell.value = title;
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy950 } };
  titleCell.font = { name: FONT_DISPLAY, size: 22, bold: true, color: { argb: C.white } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  titleCell.border = { bottom: { style: "medium", color: { argb: C.amber500 } } };

  const subtitleCell = sheet.getCell("A2");
  subtitleCell.value = subtitle;
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy900 } };
  subtitleCell.font = { name: FONT, size: 9.5, bold: true, color: { argb: C.slate300 } };
  subtitleCell.alignment = { vertical: "middle", horizontal: "left", indent: 2 };

  sheet.getRow(1).height = 44;
  sheet.getRow(2).height = 24;
  sheet.getRow(3).height = 8;
}

function styleKpi(
  sheet: ExcelJS.Worksheet,
  labelRange: string,
  valueRange: string,
  label: string,
  value: string | number,
  tone: "blue" | "cyan" | "amber" | "rose" | "emerald",
) {
  const tones = {
    blue: { strong: C.blue700, soft: C.blue50 },
    cyan: { strong: C.cyan600, soft: C.cyan50 },
    amber: { strong: C.amber700, soft: C.amber50 },
    rose: { strong: C.rose700, soft: C.rose50 },
    emerald: { strong: C.emerald700, soft: C.emerald50 },
  };
  const style = tones[tone];
  sheet.mergeCells(labelRange);
  sheet.mergeCells(valueRange);
  const labelCell = sheet.getCell(labelRange.split(":")[0]);
  const valueCell = sheet.getCell(valueRange.split(":")[0]);

  labelCell.value = label;
  labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.strong } };
  labelCell.font = { name: FONT, size: 8.5, bold: true, color: { argb: C.white } };
  labelCell.alignment = { vertical: "middle", horizontal: "center" };

  valueCell.value = value;
  valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.soft } };
  valueCell.font = { name: FONT_DISPLAY, size: 16, bold: true, color: { argb: style.strong } };
  valueCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  valueCell.border = { bottom: thinBorder, left: thinBorder, right: thinBorder };
}

function applyTeamCell(cell: ExcelJS.Cell, team: string | null | undefined) {
  const palette = teamStyle(team);
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(palette.bg) } };
  cell.font = { name: FONT, size: 9.5, bold: true, color: { argb: argb(palette.fg) } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = { ...cell.border, left: { style: "medium", color: { argb: argb(palette.accent) } } };
}

function applySlaCell(cell: ExcelJS.Cell, days: number) {
  if (days >= 30) {
    cell.value = `${days} dias`;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.rose50 } };
    cell.font = { name: FONT, size: 9.5, bold: true, color: { argb: C.rose700 } };
  } else if (days >= 15) {
    cell.value = `${days} dias`;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.amber50 } };
    cell.font = { name: FONT, size: 9.5, bold: true, color: { argb: C.amber700 } };
  } else {
    cell.value = "No prazo";
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.emerald50 } };
    cell.font = { name: FONT, size: 9.5, bold: true, color: { argb: C.emerald700 } };
  }
  cell.alignment = { vertical: "middle", horizontal: "center" };
}

function applyMaterialCell(cell: ExcelJS.Cell, requested: boolean) {
  cell.value = requested ? "SOLICITADO" : "N/A";
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: requested ? C.amber50 : C.slate100 } };
  cell.font = { name: FONT, size: 9, bold: true, color: { argb: requested ? C.amber700 : C.slate500 } };
  cell.alignment = { vertical: "middle", horizontal: "center" };
}

function applyStatusCell(cell: ExcelJS.Cell, status: string) {
  const normalized = normalize(status);
  let strong = C.slate700;
  let soft = C.slate100;
  if (normalized === "CONCLUIDO") [strong, soft] = [C.emerald700, C.emerald50];
  else if (normalized === "EM ANDAMENTO") [strong, soft] = [C.blue700, C.blue50];
  else if (normalized === "AGUARDANDO MATERIAL") [strong, soft] = [C.amber700, C.amber50];
  else if (normalized === "CANCELADO") [strong, soft] = [C.rose700, C.rose50];
  cell.value = status;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: soft } };
  cell.font = { name: FONT, size: 9, bold: true, color: { argb: strong } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

function configurePrint(sheet: ExcelJS.Worksheet, printArea: string, repeatRows?: string) {
  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    horizontalCentered: true,
    margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.5, header: 0.2, footer: 0.2 },
    printArea,
  };
  if (repeatRows) sheet.pageSetup.printTitlesRow = repeatRows;
  sheet.headerFooter.oddFooter = "&L&9Apont Auto · Programação de Corretivas&C&9Página &P de &N&R&9Relatório operacional";
}

function buildOperationsSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  items: OsCacheRow[],
  title: string,
  scope: string,
  generatedAt: Date,
  tabColor: string,
) {
  const sheet = workbook.addWorksheet(name, { properties: { tabColor: { argb: tabColor }, defaultRowHeight: 18 } });
  const headers = ["ID", "OS", "Equipe", "Solicitante", "Prédio / Andar", "Local", "Descrição do Serviço", "Abertura", "SLA", "Material", "Status Atual"];
  const widths = [7, 15, 20, 27, 22, 25, 52, 15, 15, 17, 19];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });

  const teamCount = new Set(items.map((item) => item.equipe || "Sem equipe")).size;
  const slaRisk = items.filter((item) => ageInDays(item.data_criacao) >= 30).length;
  const materials = items.filter(materialRequested).length;

  styleTitle(sheet, title.toUpperCase(), `${scope}  •  ${items.length} OS  •  ${teamCount} equipe(s)  •  Gerado em ${generatedAt.toLocaleString("pt-BR")}`, "K");
  styleKpi(sheet, "A4:B4", "A5:B5", "TOTAL DE OS", items.length, "blue");
  styleKpi(sheet, "C4:E4", "C5:E5", "EQUIPES", teamCount, "cyan");
  styleKpi(sheet, "F4:H4", "F5:H5", "SLA CRÍTICO ≥ 30 DIAS", slaRisk, "rose");
  styleKpi(sheet, "I4:K4", "I5:K5", "MATERIAL SOLICITADO", materials, "amber");
  sheet.getRow(4).height = 20;
  sheet.getRow(5).height = 27;
  sheet.getRow(6).height = 8;

  sheet.mergeCells("A7:G7");
  sheet.mergeCells("H7:K7");
  const identity = sheet.getCell("A7");
  identity.value = "IDENTIFICAÇÃO DO CHAMADO";
  identity.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy800 } };
  identity.font = { name: FONT, size: 9, bold: true, color: { argb: C.white } };
  identity.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  const execution = sheet.getCell("H7");
  execution.value = "EXECUÇÃO DE CAMPO & PRIORIDADE";
  execution.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.cyan600 } };
  execution.font = { name: FONT, size: 9, bold: true, color: { argb: C.white } };
  execution.alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(7).height = 21;

  const headerRowNumber = 8;
  const headerRow = sheet.getRow(headerRowNumber);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index >= 7 ? C.cyan600 : C.navy900 } };
    cell.font = { name: FONT, size: 9.5, bold: true, color: { argb: C.white } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { top: thinBorder, bottom: { style: "medium", color: { argb: index >= 7 ? C.cyan600 : C.amber500 } }, left: thinBorder, right: thinBorder };
  });
  headerRow.height = 34;

  items.forEach((item, index) => {
    const row = sheet.getRow(headerRowNumber + 1 + index);
    const days = ageInDays(item.data_criacao);
    const status = statusLabel(item.status);
    row.values = [
      index + 1,
      item.numero_os || "—",
      item.equipe || "—",
      item.solicitante || "—",
      `${item.predio || "—"} / ${item.andar || "—"}`,
      item.local || "—",
      item.nome_os || "—",
      formatDate(item.data_criacao),
      "",
      "",
      "",
    ];
    row.height = 38;
    for (let column = 1; column <= headers.length; column += 1) {
      const cell = row.getCell(column);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? C.white : C.slate50 } };
      cell.font = { name: FONT, size: 9.5, color: { argb: C.slate900 } };
      cell.alignment = { vertical: "middle", horizontal: column === 1 || column === 2 || column >= 8 ? "center" : "left", wrapText: true, indent: column >= 3 && column <= 7 ? 1 : 0 };
      cell.border = { bottom: thinBorder, left: { style: column === 8 ? "medium" : "thin", color: { argb: column === 8 ? C.cyan600 : C.slate200 } }, right: thinBorder };
    }
    row.getCell(1).font = { name: FONT, size: 8.5, bold: true, color: { argb: C.slate500 } };
    row.getCell(2).font = { name: FONT_DISPLAY, size: 10.5, bold: true, color: { argb: C.blue700 } };
    row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.blue50 } };
    applyTeamCell(row.getCell(3), item.equipe);
    applySlaCell(row.getCell(9), days);
    applyMaterialCell(row.getCell(10), materialRequested(item));
    applyStatusCell(row.getCell(11), status);
  });

  const lastDataRow = headerRowNumber + items.length;
  sheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: Math.max(headerRowNumber, lastDataRow), column: headers.length } };
  sheet.views = [{ state: "frozen", xSplit: 2, ySplit: headerRowNumber, activeCell: `C${headerRowNumber + 1}`, showGridLines: false }];

  const summaryRowNumber = Math.max(headerRowNumber, lastDataRow) + 2;
  sheet.mergeCells(summaryRowNumber, 1, summaryRowNumber, 4);
  sheet.mergeCells(summaryRowNumber, 5, summaryRowNumber, 11);
  const summaryLabel = sheet.getCell(summaryRowNumber, 1);
  summaryLabel.value = "RESUMO DA PROGRAMAÇÃO";
  summaryLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy900 } };
  summaryLabel.font = { name: FONT, size: 9.5, bold: true, color: { argb: C.white } };
  summaryLabel.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  const summaryValue = sheet.getCell(summaryRowNumber, 5);
  summaryValue.value = `Total: ${items.length} OS  •  ${teamCount} equipes  •  ${slaRisk} SLA crítico  •  ${materials} com material solicitado`;
  summaryValue.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.blue700 } };
  summaryValue.font = { name: FONT, size: 9.5, bold: true, color: { argb: C.white } };
  summaryValue.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  sheet.getRow(summaryRowNumber).height = 30;

  configurePrint(sheet, `A1:K${summaryRowNumber}`, `1:${headerRowNumber}`);
  return sheet;
}

function buildExecutiveSheet(workbook: ExcelJS.Workbook, items: OsCacheRow[], title: string, scope: string, generatedAt: Date) {
  const sheet = workbook.addWorksheet("Visão Executiva", { properties: { tabColor: { argb: C.amber500 } } });
  for (let index = 1; index <= 12; index += 1) sheet.getColumn(index).width = 12;
  sheet.views = [{ state: "normal", showGridLines: false }];

  const teamCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  items.forEach((item) => {
    const team = item.equipe || "Sem equipe";
    const status = statusLabel(item.status);
    teamCounts.set(team, (teamCounts.get(team) || 0) + 1);
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
  });
  const teams = [...teamCounts.entries()].sort((a, b) => b[1] - a[1]);
  const statuses = [...statusCounts.entries()].sort((a, b) => b[1] - a[1]);
  const critical = items.filter((item) => ageInDays(item.data_criacao) >= 30).length;
  const materials = items.filter(materialRequested).length;
  const inProgress = items.filter((item) => statusLabel(item.status) === "Em andamento").length;

  styleTitle(sheet, "PROGRAMAÇÃO DE CORRETIVAS · VISÃO EXECUTIVA", `${title}  •  ${scope}  •  Gerado em ${generatedAt.toLocaleString("pt-BR")}`, "L");
  styleKpi(sheet, "A4:C4", "A5:C6", "TOTAL DE OS", items.length, "blue");
  styleKpi(sheet, "D4:F4", "D5:F6", "EQUIPES ATIVAS", teams.length, "cyan");
  styleKpi(sheet, "G4:I4", "G5:I6", "EM ANDAMENTO", inProgress, "amber");
  styleKpi(sheet, "J4:L4", "J5:L6", "SLA CRÍTICO ≥ 30 DIAS", critical, "rose");

  sheet.mergeCells("A8:F8");
  sheet.mergeCells("H8:L8");
  const teamTitle = sheet.getCell("A8");
  teamTitle.value = "DISTRIBUIÇÃO POR EQUIPE";
  teamTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy900 } };
  teamTitle.font = { name: FONT, size: 9.5, bold: true, color: { argb: C.white } };
  teamTitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  const statusTitle = sheet.getCell("H8");
  statusTitle.value = "STATUS OPERACIONAL";
  statusTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.cyan600 } };
  statusTitle.font = { name: FONT, size: 9.5, bold: true, color: { argb: C.white } };
  statusTitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  let teamRow = 9;
  teams.forEach(([team, count]) => {
    const palette = teamStyle(team);
    sheet.mergeCells(teamRow, 1, teamRow, 4);
    sheet.mergeCells(teamRow, 5, teamRow, 6);
    const nameCell = sheet.getCell(teamRow, 1);
    nameCell.value = team;
    nameCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(palette.bg) } };
    nameCell.font = { name: FONT, size: 9, bold: true, color: { argb: argb(palette.fg) } };
    nameCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    nameCell.border = { left: { style: "medium", color: { argb: argb(palette.accent) } }, bottom: thinBorder };
    const valueCell = sheet.getCell(teamRow, 5);
    valueCell.value = `${count} OS · ${items.length ? ((count / items.length) * 100).toFixed(1).replace(".", ",") : "0,0"}%`;
    valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate50 } };
    valueCell.font = { name: FONT, size: 9, bold: true, color: { argb: C.slate700 } };
    valueCell.alignment = { vertical: "middle", horizontal: "center" };
    valueCell.border = { bottom: thinBorder, right: thinBorder };
    sheet.getRow(teamRow).height = 24;
    teamRow += 1;
  });

  let statusRow = 9;
  statuses.forEach(([status, count]) => {
    sheet.mergeCells(statusRow, 8, statusRow, 10);
    sheet.mergeCells(statusRow, 11, statusRow, 12);
    const statusCell = sheet.getCell(statusRow, 8);
    const countCell = sheet.getCell(statusRow, 11);
    statusCell.value = status;
    statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate50 } };
    statusCell.font = { name: FONT, size: 9, bold: true, color: { argb: C.slate700 } };
    statusCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    statusCell.border = { left: thinBorder, bottom: thinBorder };
    countCell.value = count;
    countCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.cyan50 } };
    countCell.font = { name: FONT_DISPLAY, size: 10, bold: true, color: { argb: C.cyan600 } };
    countCell.alignment = { vertical: "middle", horizontal: "center" };
    countCell.border = { right: thinBorder, bottom: thinBorder };
    sheet.getRow(statusRow).height = 24;
    statusRow += 1;
  });

  const priorityStart = Math.max(teamRow, statusRow) + 2;
  sheet.mergeCells(priorityStart, 1, priorityStart, 12);
  const priorityTitle = sheet.getCell(priorityStart, 1);
  priorityTitle.value = "PRIORIDADES · CHAMADOS MAIS ANTIGOS";
  priorityTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy900 } };
  priorityTitle.font = { name: FONT, size: 9.5, bold: true, color: { argb: C.white } };
  priorityTitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  const priorityHeader = priorityStart + 1;
  const priorityHeaders = ["OS", "Equipe", "Local", "Dias", "Status", "Material"];
  const ranges = [[1, 2], [3, 4], [5, 7], [8, 8], [9, 10], [11, 12]];
  priorityHeaders.forEach((label, index) => {
    const [start, end] = ranges[index];
    if (start !== end) sheet.mergeCells(priorityHeader, start, priorityHeader, end);
    const cell = sheet.getCell(priorityHeader, start);
    cell.value = label;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate700 } };
    cell.font = { name: FONT, size: 8.5, bold: true, color: { argb: C.white } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
  });

  const priorities = [...items].sort((a, b) => ageInDays(b.data_criacao) - ageInDays(a.data_criacao)).slice(0, 10);
  priorities.forEach((item, index) => {
    const rowNumber = priorityHeader + 1 + index;
    const values = [item.numero_os || "—", item.equipe || "—", item.local || "—", ageInDays(item.data_criacao), statusLabel(item.status), materialRequested(item) ? "Solicitado" : "N/A"];
    ranges.forEach(([start, end], valueIndex) => {
      if (start !== end) sheet.mergeCells(rowNumber, start, rowNumber, end);
      const cell = sheet.getCell(rowNumber, start);
      cell.value = values[valueIndex];
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? C.white : C.slate50 } };
      cell.font = { name: FONT, size: 9, color: { argb: C.slate900 }, bold: start === 1 || start === 8 };
      cell.alignment = { vertical: "middle", horizontal: start === 5 ? "left" : "center", wrapText: true, indent: start === 5 ? 1 : 0 };
      cell.border = { bottom: thinBorder, left: thinBorder, right: thinBorder };
    });
    applyTeamCell(sheet.getCell(rowNumber, 3), item.equipe);
    applySlaCell(sheet.getCell(rowNumber, 8), ageInDays(item.data_criacao));
    applyStatusCell(sheet.getCell(rowNumber, 9), statusLabel(item.status));
    applyMaterialCell(sheet.getCell(rowNumber, 11), materialRequested(item));
    sheet.getRow(rowNumber).height = 28;
  });

  const attentionRow = priorityHeader + priorities.length + 2;
  sheet.mergeCells(attentionRow, 1, attentionRow, 6);
  sheet.mergeCells(attentionRow, 7, attentionRow, 12);
  const materialCard = sheet.getCell(attentionRow, 1);
  materialCard.value = `${materials} chamado(s) com material solicitado`;
  materialCard.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.amber50 } };
  materialCard.font = { name: FONT_DISPLAY, size: 10.5, bold: true, color: { argb: C.amber700 } };
  materialCard.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  materialCard.border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
  const slaCard = sheet.getCell(attentionRow, 7);
  slaCard.value = `${critical} chamado(s) com 30 dias ou mais de abertura`;
  slaCard.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.rose50 } };
  slaCard.font = { name: FONT_DISPLAY, size: 10.5, bold: true, color: { argb: C.rose700 } };
  slaCard.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  slaCard.border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
  sheet.getRow(attentionRow).height = 34;

  const legendRow = attentionRow + 2;
  sheet.mergeCells(legendRow, 1, legendRow, 12);
  const legend = sheet.getCell(legendRow, 1);
  legend.value = "LEGENDA SLA  ·  Verde: até 14 dias  ·  Âmbar: 15–29 dias  ·  Vermelho: 30 dias ou mais";
  legend.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate100 } };
  legend.font = { name: FONT, size: 8.5, bold: true, color: { argb: C.slate500 } };
  legend.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  legend.border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

  configurePrint(sheet, `A1:L${legendRow}`);
  return sheet;
}

export function buildProgramacaoWorkbook(
  osList: OsCacheRow[],
  equipeFiltro: string,
  aba: "corretiva" | "preventiva",
  generatedAt = new Date(),
) {
  const workbook = new ExcelJS.Workbook();
  const title = aba === "preventiva" ? "Programação de Backorder" : "Programação de Corretivas";
  const scope = `Equipe: ${equipeFiltro}`;
  setWorkbookMetadata(workbook, title, generatedAt);

  buildExecutiveSheet(workbook, osList, title, scope, generatedAt);
  buildOperationsSheet(workbook, "Programação Geral", osList, title, scope, generatedAt, C.blue600);

  const usedNames = new Set(["Visão Executiva", "Programação Geral"]);
  const teams = [...new Set(osList.map((item) => item.equipe || "Sem equipe"))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  teams.forEach((team) => {
    const teamItems = osList.filter((item) => (item.equipe || "Sem equipe") === team);
    const sheetName = safeSheetName(`Equipe · ${team}`, usedNames);
    const palette = teamStyle(team);
    buildOperationsSheet(workbook, sheetName, teamItems, `${title} · ${team}`, `Equipe: ${team}`, generatedAt, argb(palette.accent));
  });

  workbook.worksheets[0].state = "visible";
  return workbook;
}

export async function generateProgramacaoExcel(
  osList: OsCacheRow[],
  equipeFiltro: string,
  aba: "corretiva" | "preventiva",
) {
  const generatedAt = new Date();
  const workbook = buildProgramacaoWorkbook(osList, equipeFiltro, aba, generatedAt);
  const buffer = await workbook.xlsx.writeBuffer();
  const { saveAs } = await import("file-saver");
  const fileName = `programacao_${aba}_${equipeFiltro.toLowerCase().replace(/\s+/g, "_")}_${generatedAt.toISOString().slice(0, 10)}.xlsx`;
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName);
}
