import ExcelJS from "exceljs";
import type { OsCacheRow } from "./db";
import {
  classifyPriority,
  PRIORITY_HEX,
  type PriorityLevel,
} from "./priority-classifier";

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

const C = {
  navy950: argb("#06111F"),
  navy900: argb("#0B1F33"),
  navy800: argb("#12314C"),
  blue700: argb("#1D4ED8"),
  blue600: argb("#2563EB"),
  cyan600: argb("#0891B2"),
  emerald700: argb("#047857"),
  amber700: argb("#B45309"),
  amber500: argb("#F59E0B"),
  rose700: argb("#BE123C"),
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
export const OPERATIONS_ROW_HEIGHT = 127.5;

const thinBorder = {
  top: { style: "thin" as const, color: { argb: C.slate200 } },
  bottom: { style: "thin" as const, color: { argb: C.slate200 } },
  left: { style: "thin" as const, color: { argb: C.slate200 } },
  right: { style: "thin" as const, color: { argb: C.slate200 } },
};

const TEAM_PALETTE = [
  { bg: "#FFF7E6", fg: "#92400E", accent: "#F59E0B" },
  { bg: "#EAF7FF", fg: "#075985", accent: "#0EA5E9" },
  { bg: "#F3EEFF", fg: "#5B21B6", accent: "#8B5CF6" },
  { bg: "#ECFDF3", fg: "#047857", accent: "#10B981" },
  { bg: "#FFF0F6", fg: "#9D174D", accent: "#EC4899" },
  { bg: "#ECFEFF", fg: "#0E7490", accent: "#06B6D4" },
  { bg: "#F2F4F7", fg: "#344054", accent: "#667085" },
] as const;

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

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
  if (["CONCLUIDO", "CONCLUIDA", "FINALIZADO", "FINALIZADA", "FECHADO", "FECHADA"].includes(value))
    return "Concluído";
  if (["EM ANDAMENTO", "EM EXECUCAO", "EXECUCAO", "ANDAMENTO"].includes(value))
    return "Em andamento";
  if (["AGUARDANDO MATERIAL", "MATERIAL", "AGUARDANDO PECA", "AGUARDANDO PECAS"].includes(value))
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
    "Relatório de programação de corretivas com classificação automática de prioridade.";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  workbook.calcProperties.fullCalcOnLoad = true;
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
    blackAndWhite: false,
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

function priorityArgb(level: PriorityLevel) {
  return {
    bg: argb(PRIORITY_HEX[level].bg),
    fg: argb(PRIORITY_HEX[level].fg),
  };
}

function stylePriorityCell(cell: ExcelJS.Cell, level: PriorityLevel, score: number) {
  const colors = priorityArgb(level);
  cell.value = `${level} · ${score}`;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.bg } };
  cell.font = {
    name: OPERATIONS_FONT,
    size: 12,
    bold: true,
    color: { argb: colors.fg },
  };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = thinBorder;
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
    "OS",
    "Prioridade",
    "Motivo da prioridade",
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
  const widths = [18, 18, 42, 24, 28, 26, 30, 58, 18, 18, 20, 22];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];

  sheet.mergeCells("A1:L1");
  sheet.mergeCells("A2:L2");
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
  sheet.getRow(1).height = 44;
  sheet.getRow(2).height = 25;

  const priorityCounts: Record<PriorityLevel, number> = {
    CRÍTICA: 0,
    ALTA: 0,
    MÉDIA: 0,
    NORMAL: 0,
  };
  items.forEach((item) => {
    priorityCounts[classifyPriority(item, generatedAt).level] += 1;
  });

  const cards = [
    ["A3:C3", `TOTAL · ${items.length}`, C.blue700],
    ["D3:F3", `CRÍTICA · ${priorityCounts.CRÍTICA}`, argb(PRIORITY_HEX.CRÍTICA.bg)],
    ["G3:I3", `ALTA · ${priorityCounts.ALTA}`, argb(PRIORITY_HEX.ALTA.bg)],
    ["J3:L3", `MÉDIA · ${priorityCounts.MÉDIA}`, argb(PRIORITY_HEX.MÉDIA.bg)],
  ] as const;
  cards.forEach(([range, value, color]) => {
    sheet.mergeCells(range);
    const cell = sheet.getCell(range.split(":")[0]);
    cell.value = value;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    cell.font = { name: FONT_DISPLAY, size: 11, bold: true, color: { argb: C.white } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  sheet.getRow(3).height = 30;
  sheet.getRow(4).height = 7;

  const headerRow = sheet.getRow(5);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy800 } };
    cell.font = { name: OPERATIONS_FONT, size: 11, bold: true, color: { argb: C.white } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder;
  });
  headerRow.height = 34;

  let rowNumber = 6;
  for (const item of items) {
    const row = sheet.getRow(rowNumber++);
    const priority = classifyPriority(item, generatedAt);
    const age = ageInDays(item.data_criacao);
    const values = [
      item.numero_os,
      "",
      priority.reasons.slice(0, 3).join(" · "),
      item.equipe || "Sem equipe",
      item.solicitante || "—",
      `${item.predio || "—"} / ${item.andar || "—"}`,
      item.local || "—",
      item.nome_os || "Sem descrição",
      formatDate(item.data_criacao),
      age >= 30 ? `${age} dias` : "No prazo",
      materialRequested(item) ? "SOLICITADO" : "N/A",
      statusLabel(item.status),
    ];

    values.forEach((value, index) => {
      const cell = row.getCell(index + 1);
      cell.value = value;
      cell.font = {
        name: index === 7 ? OPERATIONS_FONT : FONT,
        size: index === 7 ? 13 : 10,
        bold: index === 0 || index === 3 || index === 7,
        color: { argb: C.slate900 },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: [0, 1, 8, 9, 10, 11].includes(index) ? "center" : "left",
        wrapText: true,
      };
      cell.border = thinBorder;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: rowNumber % 2 === 0 ? C.slate50 : C.white },
      };
    });

    stylePriorityCell(row.getCell(2), priority.level, priority.score);

    const team = teamStyle(item.equipe);
    const teamCell = row.getCell(4);
    teamCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(team.bg) } };
    teamCell.font = { name: FONT, size: 10, bold: true, color: { argb: argb(team.fg) } };
    teamCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

    if (age >= 30) {
      const slaCell = row.getCell(10);
      slaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#FFF1F2") } };
      slaCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.rose700 } };
    }
    if (materialRequested(item)) {
      const materialCell = row.getCell(11);
      materialCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#FFFBEB") } };
      materialCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.amber700 } };
    }

    row.height = OPERATIONS_ROW_HEIGHT;
  }

  if (items.length === 0) {
    sheet.mergeCells("A6:L7");
    const empty = sheet.getCell("A6");
    empty.value = "Nenhuma OS disponível para este filtro.";
    empty.font = { name: FONT, size: 11, bold: true, color: { argb: C.slate500 } };
    empty.alignment = { vertical: "middle", horizontal: "center" };
  }

  const lastRow = Math.max(7, rowNumber - 1);
  sheet.autoFilter = `A5:L5`;
  configurePrint(sheet, `A1:L${lastRow}`, "1:5");
  return sheet;
}

function buildExecutiveSheet(
  workbook: ExcelJS.Workbook,
  items: OsCacheRow[],
  title: string,
  generatedAt: Date,
) {
  const sheet = workbook.addWorksheet("Visão Executiva", {
    properties: { tabColor: { argb: C.amber500 } },
  });
  for (let i = 1; i <= 12; i += 1) sheet.getColumn(i).width = 12;
  sheet.views = [{ state: "normal", showGridLines: false }];

  const counts: Record<PriorityLevel, number> = {
    CRÍTICA: 0,
    ALTA: 0,
    MÉDIA: 0,
    NORMAL: 0,
  };
  items.forEach((item) => {
    counts[classifyPriority(item, generatedAt).level] += 1;
  });

  sheet.mergeCells("A1:L1");
  const heading = sheet.getCell("A1");
  heading.value = `${title.toUpperCase()} · VISÃO EXECUTIVA`;
  heading.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy950 } };
  heading.font = { name: FONT_DISPLAY, size: 20, bold: true, color: { argb: C.white } };
  heading.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(1).height = 44;

  const cards = [
    ["A3:C5", `TOTAL\n${items.length}`, C.blue700],
    ["D3:F5", `CRÍTICA\n${counts.CRÍTICA}`, argb(PRIORITY_HEX.CRÍTICA.bg)],
    ["G3:I5", `ALTA\n${counts.ALTA}`, argb(PRIORITY_HEX.ALTA.bg)],
    ["J3:L5", `MÉDIA\n${counts.MÉDIA}`, argb(PRIORITY_HEX.MÉDIA.bg)],
  ] as const;
  cards.forEach(([range, value, color]) => {
    sheet.mergeCells(range);
    const cell = sheet.getCell(range.split(":")[0]);
    cell.value = value;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    cell.font = { name: FONT_DISPLAY, size: 15, bold: true, color: { argb: C.white } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  sheet.getRow(3).height = 28;
  sheet.getRow(4).height = 28;
  sheet.getRow(5).height = 28;

  sheet.mergeCells("A7:L7");
  const note = sheet.getCell("A7");
  note.value =
    "Prioridade calculada automaticamente a partir de descrição, local, SLA, antiguidade e contexto de risco. CRÍTICA e ALTA aparecem primeiro no sistema.";
  note.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate100 } };
  note.font = { name: FONT, size: 10, bold: true, color: { argb: C.slate700 } };
  note.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  sheet.getRow(7).height = 38;
  configurePrint(sheet, "A1:L7");
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
  setWorkbookMetadata(workbook, title, generatedAt);

  buildExecutiveSheet(workbook, osList, title, generatedAt);
  buildOperationsSheet(
    workbook,
    "Programação Geral",
    osList,
    title,
    `Equipe: ${equipeFiltro}`,
    generatedAt,
    C.blue600,
  );

  const usedNames = new Set(["Visão Executiva", "Programação Geral"]);
  const teams = [...new Set(osList.map((item) => item.equipe || "Sem equipe"))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );

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

  workbook.worksheets.forEach((sheet) => {
    sheet.pageSetup.blackAndWhite = false;
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
