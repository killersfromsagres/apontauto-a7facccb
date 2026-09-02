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
  emerald50: argb("#ECFDF5"),
  amber700: argb("#B45309"),
  amber500: argb("#F59E0B"),
  amber50: argb("#FFFBEB"),
  rose700: argb("#BE123C"),
  rose50: argb("#FFF1F2"),
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
export const OPERATIONS_FONT = "Aptos ExtraBold";
export const OPERATIONS_FONT_SIZE = 16;
// ExcelJS usa pontos. 170 px a 96 DPI = 127,5 pt.
export const OPERATIONS_ROW_HEIGHT = 127.5;
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
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
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
  if (
    ["CONCLUIDO", "CONCLUIDA", "FINALIZADO", "FINALIZADA", "FECHADO", "FECHADA"].includes(
      value,
    )
  )
    return "Concluído";
  if (["EM ANDAMENTO", "EM EXECUCAO", "EXECUCAO", "ANDAMENTO"].includes(value))
    return "Em andamento";
  if (
    ["AGUARDANDO MATERIAL", "MATERIAL", "AGUARDANDO PECA", "AGUARDANDO PECAS"].includes(
      value,
    )
  )
    return "Aguardando material";
  if (["CANCELADO", "CANCELADA"].includes(value)) return "Cancelado";
  return status ? String(status) : "Aberto";
}

function ageInDays(iso: string | null | undefined) {
  if (!iso) return 0;
  const timestamp = new Date(iso).getTime();
  return Number.isNaN(timestamp)
    ? 0
    : Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
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
  const base =
    value
      .replace(/[\\/*?:\[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 31) || "Equipe";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    const ending = ` ${suffix++}`;
    candidate = `${base.slice(0, Math.max(1, 31 - ending.length))}${ending}`;
  }
  used.add(candidate);
  return candidate;
}

function setWorkbookMetadata(
  workbook: ExcelJS.Workbook,
  title: string,
  generatedAt: Date,
) {
  workbook.creator = "Apont Auto";
  workbook.lastModifiedBy = "Apont Auto";
  workbook.company = "Apont Auto";
  workbook.title = title;
  workbook.subject = "Programação de execução de campo";
  workbook.description =
    "Relatório executivo premium de programação de ordens de serviço.";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  workbook.calcProperties.fullCalcOnLoad = true;
}

function styleTitle(
  sheet: ExcelJS.Worksheet,
  title: string,
  subtitle: string,
  lastColumn: string,
) {
  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.mergeCells(`A2:${lastColumn}2`);

  const titleCell = sheet.getCell("A1");
  titleCell.value = title;
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: C.navy950 },
  };
  titleCell.font = {
    name: FONT_DISPLAY,
    size: 22,
    bold: true,
    color: { argb: C.white },
  };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  titleCell.border = {
    bottom: { style: "medium", color: { argb: C.amber500 } },
  };

  const subtitleCell = sheet.getCell("A2");
  subtitleCell.value = subtitle;
  subtitleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: C.navy900 },
  };
  subtitleCell.font = {
    name: FONT,
    size: 10,
    bold: true,
    color: { argb: C.slate300 },
  };
  subtitleCell.alignment = { vertical: "middle", horizontal: "left", indent: 2 };

  sheet.getRow(1).height = 44;
  sheet.getRow(2).height = 25;
  sheet.getRow(3).height = 8;
}

function configurePrint(
  sheet: ExcelJS.Worksheet,
  printArea: string,
  repeatRows?: string,
) {
  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    horizontalCentered: true,
    margins: {
      left: 0.2,
      right: 0.2,
      top: 0.4,
      bottom: 0.45,
      header: 0.2,
      footer: 0.2,
    },
    printArea,
  };
  if (repeatRows) sheet.pageSetup.printTitlesRow = repeatRows;
  sheet.headerFooter.oddFooter =
    "&L&9Apont Auto · Programação de Corretivas&C&9Página &P de &N&R&9Relatório operacional";
}

function operationalFont(color: string = C.slate900): Partial<ExcelJS.Font> {
  return {
    name: OPERATIONS_FONT,
    size: OPERATIONS_FONT_SIZE,
    bold: true,
    color: { argb: color },
  };
}

function applyTeamCell(cell: ExcelJS.Cell, team: string | null | undefined) {
  const palette = teamStyle(team);
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: argb(palette.bg) },
  };
  cell.font = operationalFont(argb(palette.fg));
  cell.alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };
  cell.border = {
    ...cell.border,
    left: { style: "medium", color: { argb: argb(palette.accent) } },
  };
}

function applySlaCell(cell: ExcelJS.Cell, days: number) {
  if (days >= 30) {
    cell.value = `${days} dias`;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.rose50 } };
    cell.font = operationalFont(C.rose700);
  } else if (days >= 15) {
    cell.value = `${days} dias`;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.amber50 } };
    cell.font = operationalFont(C.amber700);
  } else {
    cell.value = "No prazo";
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: C.emerald50 },
    };
    cell.font = operationalFont(C.emerald700);
  }
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

function applyMaterialCell(cell: ExcelJS.Cell, requested: boolean) {
  cell.value = requested ? "SOLICITADO" : "N/A";
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: requested ? C.amber50 : C.slate100 },
  };
  cell.font = operationalFont(requested ? C.amber700 : C.slate500);
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
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
  cell.font = operationalFont(strong);
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
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
  const sheet = workbook.addWorksheet(name, {
    properties: {
      tabColor: { argb: tabColor },
      defaultRowHeight: OPERATIONS_ROW_HEIGHT,
    },
  });

  const headers = [
    "ID",
    "OS",
    "Equipe",
    "Solicitante",
    "Prédio / Andar",
    "Local",
    "Descrição do Serviço",
    "Abertura",
    "SLA",
    "Material",
    "Status Atual",
  ];
  // Larguras proporcionais ao conteúdo. A altura de cada OS é 170 px.
  const widths = [8, 18, 24, 30, 26, 30, 58, 18, 18, 20, 22];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  const teamCount = new Set(items.map((item) => item.equipe || "Sem equipe")).size;
  const slaRisk = items.filter((item) => ageInDays(item.data_criacao) >= 30).length;
  const materials = items.filter(materialRequested).length;

  styleTitle(
    sheet,
    title.toUpperCase(),
    `${scope}  •  ${items.length} OS  •  ${teamCount} equipe(s)  •  Gerado em ${generatedAt.toLocaleString("pt-BR")}`,
    "K",
  );

  sheet.mergeCells("A4:C4");
  sheet.mergeCells("D4:F4");
  sheet.mergeCells("G4:I4");
  sheet.mergeCells("J4:K4");
  const cards = [
    ["A4", `TOTAL · ${items.length} OS`, C.blue700],
    ["D4", `EQUIPES · ${teamCount}`, C.cyan600],
    ["G4", `SLA CRÍTICO · ${slaRisk}`, C.rose700],
    ["J4", `MATERIAL · ${materials}`, C.amber700],
  ] as const;
  cards.forEach(([address, value, color]) => {
    const cell = sheet.getCell(address);
    cell.value = value;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    cell.font = { name: FONT_DISPLAY, size: 12, bold: true, color: { argb: C.white } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  sheet.getRow(4).height = 30;
  sheet.getRow(5).height = 8;

  sheet.mergeCells("A6:G6");
  sheet.mergeCells("H6:K6");
  const identity = sheet.getCell("A6");
  identity.value = "IDENTIFICAÇÃO DO CHAMADO";
  identity.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy800 } };
  identity.font = { name: OPERATIONS_FONT, size: 13, bold: true, color: { argb: C.white } };
  identity.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  const execution = sheet.getCell("H6");
  execution.value = "EXECUÇÃO DE CAMPO & PRIORIDADE";
  execution.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.cyan600 } };
  execution.font = { name: OPERATIONS_FONT, size: 13, bold: true, color: { argb: C.white } };
  execution.alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(6).height = 27;

  const headerRowNumber = 7;
  const headerRow = sheet.getRow(headerRowNumber);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: index >= 7 ? C.cyan600 : C.navy900 },
    };
    cell.font = {
      name: OPERATIONS_FONT,
      size: OPERATIONS_FONT_SIZE,
      bold: true,
      color: { argb: C.white },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: thinBorder,
      bottom: {
        style: "medium",
        color: { argb: index >= 7 ? C.cyan600 : C.amber500 },
      },
      left: thinBorder,
      right: thinBorder,
    };
  });
  headerRow.height = 48;

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
    row.height = OPERATIONS_ROW_HEIGHT;

    for (let column = 1; column <= headers.length; column += 1) {
      const cell = row.getCell(column);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: index % 2 === 0 ? C.white : C.slate50 },
      };
      cell.font = operationalFont();
      cell.alignment = {
        vertical: "middle",
        horizontal: column === 1 || column === 2 || column >= 8 ? "center" : "left",
        wrapText: true,
        indent: column >= 3 && column <= 7 ? 1 : 0,
      };
      cell.border = {
        bottom: thinBorder,
        left: {
          style: column === 8 ? "medium" : "thin",
          color: { argb: column === 8 ? C.cyan600 : C.slate200 },
        },
        right: thinBorder,
      };
    }

    row.getCell(2).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: C.blue50 },
    };
    row.getCell(2).font = operationalFont(C.blue700);
    applyTeamCell(row.getCell(3), item.equipe);
    applySlaCell(row.getCell(9), days);
    applyMaterialCell(row.getCell(10), materialRequested(item));
    applyStatusCell(row.getCell(11), status);
  });

  const lastDataRow = headerRowNumber + items.length;
  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: {
      row: Math.max(headerRowNumber, lastDataRow),
      column: headers.length,
    },
  };
  sheet.views = [
    {
      state: "frozen",
      xSplit: 2,
      ySplit: headerRowNumber,
      activeCell: `C${headerRowNumber + 1}`,
      showGridLines: false,
    },
  ];

  const summaryRowNumber = Math.max(headerRowNumber, lastDataRow) + 2;
  sheet.mergeCells(summaryRowNumber, 1, summaryRowNumber, 4);
  sheet.mergeCells(summaryRowNumber, 5, summaryRowNumber, 11);
  const summaryLabel = sheet.getCell(summaryRowNumber, 1);
  summaryLabel.value = "RESUMO DA PROGRAMAÇÃO";
  summaryLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy900 } };
  summaryLabel.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
  summaryLabel.alignment = { vertical: "middle", horizontal: "right", indent: 1 };

  const summaryValue = sheet.getCell(summaryRowNumber, 5);
  summaryValue.value = `Total: ${items.length} OS  •  ${teamCount} equipes  •  ${slaRisk} SLA crítico  •  ${materials} com material solicitado`;
  summaryValue.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.blue700 } };
  summaryValue.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
  summaryValue.alignment = {
    vertical: "middle",
    horizontal: "left",
    indent: 1,
    wrapText: true,
  };
  sheet.getRow(summaryRowNumber).height = 32;

  configurePrint(sheet, `A1:K${summaryRowNumber}`, `1:${headerRowNumber}`);
  return sheet;
}

function buildExecutiveSheet(
  workbook: ExcelJS.Workbook,
  items: OsCacheRow[],
  title: string,
  scope: string,
  generatedAt: Date,
) {
  const sheet = workbook.addWorksheet("Visão Executiva", {
    properties: { tabColor: { argb: C.amber500 } },
  });
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

  styleTitle(
    sheet,
    "PROGRAMAÇÃO DE CORRETIVAS · VISÃO EXECUTIVA",
    `${title}  •  ${scope}  •  Gerado em ${generatedAt.toLocaleString("pt-BR")}`,
    "L",
  );

  const cards = [
    ["A4:C5", `TOTAL DE OS\n${items.length}`, C.blue700],
    ["D4:F5", `EQUIPES ATIVAS\n${teams.length}`, C.cyan600],
    ["G4:I5", `SLA CRÍTICO\n${critical}`, C.rose700],
    ["J4:L5", `MATERIAL SOLICITADO\n${materials}`, C.amber700],
  ] as const;
  cards.forEach(([range, value, color]) => {
    sheet.mergeCells(range);
    const cell = sheet.getCell(range.split(":")[0]);
    cell.value = value;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    cell.font = { name: FONT_DISPLAY, size: 14, bold: true, color: { argb: C.white } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  sheet.getRow(4).height = 28;
  sheet.getRow(5).height = 28;

  sheet.mergeCells("A7:F7");
  sheet.mergeCells("H7:L7");
  const teamTitle = sheet.getCell("A7");
  teamTitle.value = "DISTRIBUIÇÃO POR EQUIPE";
  teamTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy900 } };
  teamTitle.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
  teamTitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  const statusTitle = sheet.getCell("H7");
  statusTitle.value = "STATUS OPERACIONAL";
  statusTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.cyan600 } };
  statusTitle.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
  statusTitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  let rowNumber = 8;
  const maxRows = Math.max(teams.length, statuses.length, 1);
  for (let index = 0; index < maxRows; index += 1) {
    const team = teams[index];
    if (team) {
      const palette = teamStyle(team[0]);
      sheet.mergeCells(rowNumber, 1, rowNumber, 4);
      sheet.mergeCells(rowNumber, 5, rowNumber, 6);
      const nameCell = sheet.getCell(rowNumber, 1);
      nameCell.value = team[0];
      nameCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(palette.bg) } };
      nameCell.font = { name: FONT, size: 10, bold: true, color: { argb: argb(palette.fg) } };
      nameCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      const countCell = sheet.getCell(rowNumber, 5);
      countCell.value = `${team[1]} OS`;
      countCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate50 } };
      countCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.slate700 } };
      countCell.alignment = { vertical: "middle", horizontal: "center" };
    }

    const status = statuses[index];
    if (status) {
      sheet.mergeCells(rowNumber, 8, rowNumber, 10);
      sheet.mergeCells(rowNumber, 11, rowNumber, 12);
      const statusCell = sheet.getCell(rowNumber, 8);
      statusCell.value = status[0];
      statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate50 } };
      statusCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.slate700 } };
      statusCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      const countCell = sheet.getCell(rowNumber, 11);
      countCell.value = status[1];
      countCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.cyan50 } };
      countCell.font = { name: FONT_DISPLAY, size: 11, bold: true, color: { argb: C.cyan600 } };
      countCell.alignment = { vertical: "middle", horizontal: "center" };
    }
    sheet.getRow(rowNumber).height = 26;
    rowNumber += 1;
  }

  const noteRow = rowNumber + 2;
  sheet.mergeCells(noteRow, 1, noteRow, 12);
  const note = sheet.getCell(noteRow, 1);
  note.value =
    "As abas Programação Geral e Equipe utilizam Aptos ExtraBold 16 e linhas operacionais com 170 px de altura.";
  note.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate100 } };
  note.font = { name: FONT, size: 9, bold: true, color: { argb: C.slate500 } };
  note.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  sheet.getRow(noteRow).height = 30;

  configurePrint(sheet, `A1:L${noteRow}`);
  return sheet;
}

export function buildProgramacaoWorkbook(
  osList: OsCacheRow[],
  equipeFiltro: string,
  aba: "corretiva" | "preventiva",
  generatedAt = new Date(),
) {
  const workbook = new ExcelJS.Workbook();
  const title =
    aba === "preventiva" ? "Programação de Backorder" : "Programação de Corretivas";
  const scope = `Equipe: ${equipeFiltro}`;
  setWorkbookMetadata(workbook, title, generatedAt);

  buildExecutiveSheet(workbook, osList, title, scope, generatedAt);
  buildOperationsSheet(
    workbook,
    "Programação Geral",
    osList,
    title,
    scope,
    generatedAt,
    C.blue600,
  );

  const usedNames = new Set(["Visão Executiva", "Programação Geral"]);
  const teams = [
    ...new Set(osList.map((item) => item.equipe || "Sem equipe")),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

  teams.forEach((team) => {
    const teamItems = osList.filter(
      (item) => (item.equipe || "Sem equipe") === team,
    );
    const sheetName = safeSheetName(`Equipe · ${team}`, usedNames);
    const palette = teamStyle(team);
    buildOperationsSheet(
      workbook,
      sheetName,
      teamItems,
      `${title} · ${team}`,
      `Equipe: ${team}`,
      generatedAt,
      argb(palette.accent),
    );
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
  const workbook = buildProgramacaoWorkbook(
    osList,
    equipeFiltro,
    aba,
    generatedAt,
  );
  const buffer = await workbook.xlsx.writeBuffer();
  const { saveAs } = await import("file-saver");
  const fileName = `programacao_${aba}_${equipeFiltro
    .toLowerCase()
    .replace(/\s+/g, "_")}_${generatedAt.toISOString().slice(0, 10)}.xlsx`;
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName,
  );
}
