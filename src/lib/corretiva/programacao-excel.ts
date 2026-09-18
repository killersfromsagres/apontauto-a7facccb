import ExcelJS from "exceljs";
import type { OsCacheRow } from "./db";

export type ProgramacaoExportRow = OsCacheRow & {
  tipo_importacao?: string | null;
  programacao_status?: string | null;
  programacao_dia?: string | null;
  programacao_periodo?: string | null;
  programacao_equipe?: string | null;
};

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

const C = {
  navy950: argb("#07111F"),
  navy900: argb("#0C1C2E"),
  navy800: argb("#15324F"),
  blue700: argb("#1D4ED8"),
  blue600: argb("#2563EB"),
  blue50: argb("#EFF6FF"),
  sky700: argb("#0369A1"),
  sky100: argb("#E0F2FE"),
  amber700: argb("#B45309"),
  amber100: argb("#FEF3C7"),
  rose700: argb("#BE123C"),
  rose100: argb("#FFE4E6"),
  emerald700: argb("#047857"),
  emerald100: argb("#D1FAE5"),
  white: argb("#FFFFFF"),
  slate950: argb("#020617"),
  slate900: argb("#0F172A"),
  slate700: argb("#334155"),
  slate600: argb("#475569"),
  slate500: argb("#64748B"),
  slate400: argb("#94A3B8"),
  slate300: argb("#CBD5E1"),
  slate200: argb("#E2E8F0"),
  slate100: argb("#F1F5F9"),
  slate50: argb("#F8FAFC"),
};

const FONT = "Aptos";
const FONT_DISPLAY = "Aptos Display";
export const OPERATIONS_FONT = "Aptos ExtraBold";
export const OPERATIONS_FONT_SIZE = 12;
export const OPERATIONS_ROW_HEIGHT = 58;

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

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

function teamStyle(team: string | null | undefined) {
  const value = normalize(team);
  if (value.includes("ELETR")) return TEAM_STYLE.ELETRICA;
  if (value.includes("HIDRAUL")) return TEAM_STYLE.HIDRAULICA;
  if (value.includes("CIVIL")) return TEAM_STYLE.CIVIL;
  if (value.includes("CHAVE")) return TEAM_STYLE.CHAVEIRO;
  if (value.includes("PINT")) return TEAM_STYLE.PINTURA;
  if (value.includes("REFRIG") || value.includes("CLIMAT") || value.includes("AR COND")) {
    return TEAM_STYLE.REFRIGERACAO;
  }
  if (value.includes("LIMPE") || value.includes("HIGIEN")) return TEAM_STYLE.LIMPEZA;
  return TEAM_STYLE.OUTROS;
}

function isExplicitBackorder(item: ProgramacaoExportRow) {
  return [item.tipo, item.tipo_importacao]
    .map(normalize)
    .some((value) => value === "BACKORDER" || value.startsWith("BACKORDER "));
}

function typeLabel(item: ProgramacaoExportRow) {
  if (isExplicitBackorder(item)) return "BACKORDER";
  const raw = String(item.tipo || item.tipo_importacao || "CORRETIVA").trim();
  return raw ? raw.replace(/_/g, " ").toUpperCase() : "CORRETIVA";
}

function materialRequested(item: OsCacheRow) {
  return normalize(item.material_status) === "SOLICITADO" || Boolean(item.pecas_solicitadas);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}/.test(raw)
    ? new Date(`${raw.slice(0, 10)}T12:00:00`)
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

type SlaInfo = {
  label: string;
  overdue: boolean;
  days: number | null;
};

function slaInfo(value: string | null | undefined, generatedAt: Date): SlaInfo {
  if (!value) return { label: "—", overdue: false, days: null };

  const raw = String(value);
  const due = /^\d{4}-\d{2}-\d{2}/.test(raw)
    ? new Date(`${raw.slice(0, 10)}T12:00:00`)
    : new Date(raw);
  if (Number.isNaN(due.getTime())) return { label: "—", overdue: false, days: null };

  const reference = new Date(generatedAt);
  reference.setHours(12, 0, 0, 0);
  due.setHours(12, 0, 0, 0);

  const days = Math.round((due.getTime() - reference.getTime()) / 86400000);
  if (days < 0) {
    const overdueDays = Math.abs(days);
    return {
      label: `Vencido há ${overdueDays} dia${overdueDays === 1 ? "" : "s"}`,
      overdue: true,
      days,
    };
  }
  if (days === 0) return { label: "Vence hoje", overdue: false, days };
  if (days === 1) return { label: "Vence amanhã", overdue: false, days };
  return { label: `Vence em ${days} dias`, overdue: false, days };
}

function safeSheetName(value: string, used: Set<string>) {
  const base = value
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

function excelColumnName(index: number) {
  let value = Math.max(1, index);
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function setWorkbookMetadata(workbook: ExcelJS.Workbook, title: string, generatedAt: Date) {
  workbook.creator = "Apont Auto";
  workbook.lastModifiedBy = "Apont Auto";
  workbook.company = "Apont Auto";
  workbook.title = title;
  workbook.subject = "Programação e controle operacional de chamados corretivos";
  workbook.description = "Relatório operacional de corretivas, equipes, SLA, materiais e programação de campo.";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  workbook.calcProperties.fullCalcOnLoad = true;
}

function configurePrint(
  sheet: ExcelJS.Worksheet,
  printArea: string,
  generatedAt: Date,
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
      left: 0.18,
      right: 0.18,
      top: 0.3,
      bottom: 0.42,
      header: 0.12,
      footer: 0.16,
    },
    printArea,
  };
  if (repeatRows) sheet.pageSetup.printTitlesRow = repeatRows;
  const emitted = generatedAt.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  sheet.headerFooter.oddFooter = `&L&9Apont Auto · Programação de Corretivas&C&9Página &P de &N&R&9Emitido em ${emitted}`;
}

function visualLineCount(value: unknown, charsPerLine: number) {
  const text = String(value ?? "").trim();
  if (!text) return 1;
  return text
    .split(/\r?\n/)
    .reduce(
      (total, part) =>
        total + Math.max(1, Math.ceil(part.trim().length / charsPerLine)),
      0,
    );
}

function intelligentRowHeight(item: ProgramacaoExportRow, includeProgramControl: boolean) {
  const lines = Math.max(
    visualLineCount(item.equipe || "Sem equipe", 22),
    visualLineCount(item.solicitante || "", 24),
    visualLineCount(`${item.predio || ""} / ${item.andar || ""}`, 24),
    visualLineCount(item.local || "", 30),
    visualLineCount(item.nome_os || "", 66),
    includeProgramControl ? visualLineCount(item.programacao_periodo || "", 28) : 1,
    2,
  );
  return Math.min(250, Math.max(OPERATIONS_ROW_HEIGHT, 26 + lines * 17));
}

function hasProgramControl(items: ProgramacaoExportRow[]) {
  return items.some(
    (item) =>
      item.programacao_status ||
      item.programacao_dia ||
      item.programacao_periodo ||
      item.programacao_equipe,
  );
}

function programCount(items: ProgramacaoExportRow[]) {
  return items.filter((item) =>
    Boolean(
      item.programacao_status ||
        item.programacao_dia ||
        item.programacao_periodo ||
        item.programacao_equipe,
    ),
  ).length;
}

function operationalMetrics(items: ProgramacaoExportRow[], generatedAt: Date) {
  return {
    total: items.length,
    programmed: programCount(items),
    material: items.filter(materialRequested).length,
    overdue: items.filter((item) => slaInfo(item.data_sla, generatedAt).overdue).length,
  };
}

function buildOperationsSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  items: ProgramacaoExportRow[],
  title: string,
  scope: string,
  generatedAt: Date,
  tabColor: string,
) {
  const includeProgramControl = hasProgramControl(items);
  const baseHeaders = [
    "OS",
    "Tipo",
    "Equipe",
    "Solicitante",
    "Prédio / Andar",
    "Local",
    "Descrição do Serviço",
    "Abertura",
    "SLA",
    "Material",
  ];
  const programHeaders = [
    "Programação",
    "Dia programado",
    "Período da programação",
    "Equipe programada",
  ];
  const headers = includeProgramControl
    ? [...baseHeaders, ...programHeaders]
    : baseHeaders;
  const widths = includeProgramControl
    ? [15, 16, 22, 25, 29, 36, 76, 16, 22, 18, 22, 22, 32, 28]
    : [15, 16, 22, 25, 29, 36, 82, 16, 22, 18];
  const lastColumn = excelColumnName(headers.length);
  const metrics = operationalMetrics(items, generatedAt);

  const sheet = workbook.addWorksheet(name, {
    properties: {
      tabColor: { argb: tabColor },
      defaultRowHeight: OPERATIONS_ROW_HEIGHT,
    },
  });
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 5, showGridLines: false }];

  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.mergeCells(`A2:${lastColumn}2`);

  const titleCell = sheet.getCell("A1");
  titleCell.value = title.toUpperCase();
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy950 } };
  titleCell.font = {
    name: FONT_DISPLAY,
    size: 22,
    bold: true,
    color: { argb: C.white },
  };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  const subtitle = sheet.getCell("A2");
  subtitle.value = `${scope}  •  ${items.length} OS  •  Emitido em ${generatedAt.toLocaleString("pt-BR")}`;
  subtitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy900 } };
  subtitle.font = {
    name: FONT,
    size: 10,
    bold: true,
    color: { argb: C.slate300 },
  };
  subtitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(1).height = 46;
  sheet.getRow(2).height = 26;

  const cardRanges = includeProgramControl
    ? ["A3:C3", "D3:G3", "H3:J3", "K3:N3"]
    : ["A3:B3", "C3:E3", "F3:H3", "I3:J3"];
  const cards = [
    [cardRanges[0], `TOTAL DE OS  ·  ${metrics.total}`, C.blue700, C.white],
    [cardRanges[1], `EM PROGRAMAÇÃO  ·  ${metrics.programmed}`, C.sky100, C.sky700],
    [cardRanges[2], `MATERIAL SOLICITADO  ·  ${metrics.material}`, C.amber100, C.amber700],
    [cardRanges[3], `SLA VENCIDO  ·  ${metrics.overdue}`, C.rose100, C.rose700],
  ] as const;

  cards.forEach(([range, value, bg, fg]) => {
    sheet.mergeCells(range);
    const cell = sheet.getCell(range.split(":")[0]);
    cell.value = value;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    cell.font = {
      name: FONT_DISPLAY,
      size: 11.5,
      bold: true,
      color: { argb: fg },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder;
  });
  sheet.getRow(3).height = 32;
  sheet.getRow(4).height = 8;

  const headerRow = sheet.getRow(5);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy800 } };
    cell.font = {
      name: OPERATIONS_FONT,
      size: 10,
      bold: true,
      color: { argb: C.white },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = thinBorder;
  });
  headerRow.height = 38;

  let rowNumber = 6;
  for (const item of items) {
    const row = sheet.getRow(rowNumber++);
    const sla = slaInfo(item.data_sla, generatedAt);
    const values = [
      item.numero_os || "—",
      typeLabel(item),
      item.equipe || "Sem equipe",
      item.solicitante || "—",
      `${item.predio || "—"} / ${item.andar || "—"}`,
      item.local || "—",
      item.nome_os || "Sem descrição",
      formatDate(item.data_criacao),
      sla.label,
      materialRequested(item) ? "SOLICITADO" : "—",
    ];

    if (includeProgramControl) {
      values.push(
        item.programacao_status || "EM PROGRAMAÇÃO",
        item.programacao_dia || "—",
        item.programacao_periodo || "—",
        item.programacao_equipe || item.equipe || "—",
      );
    }

    values.forEach((value, index) => {
      const cell = row.getCell(index + 1);
      cell.value = value;
      const emphasized = [0, 2, 4, 5, 6].includes(index);
      cell.font = {
        name: emphasized ? OPERATIONS_FONT : FONT,
        size: index === 6 ? 12.5 : [4, 5].includes(index) ? 11.5 : index === 0 ? 11.5 : 9.5,
        bold: emphasized,
        color: { argb: C.slate900 },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: [0, 1, 7, 8, 9, 10, 11].includes(index) ? "center" : "left",
        wrapText: true,
      };
      cell.border = thinBorder;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: row.number % 2 === 0 ? C.slate50 : C.white },
      };
    });

    const typeCell = row.getCell(2);
    if (isExplicitBackorder(item)) {
      typeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.rose100 } };
      typeCell.font = {
        name: OPERATIONS_FONT,
        size: 9.5,
        bold: true,
        color: { argb: C.rose700 },
      };
    } else {
      typeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate100 } };
      typeCell.font = {
        name: FONT,
        size: 9.5,
        bold: true,
        color: { argb: C.slate700 },
      };
    }
    typeCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

    const team = teamStyle(item.equipe);
    const teamCell = row.getCell(3);
    teamCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: argb(team.bg) },
    };
    teamCell.font = {
      name: OPERATIONS_FONT,
      size: 10,
      bold: true,
      color: { argb: argb(team.fg) },
    };
    teamCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

    if (sla.overdue) {
      const cell = row.getCell(9);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.rose100 } };
      cell.font = {
        name: FONT,
        size: 9.5,
        bold: true,
        color: { argb: C.rose700 },
      };
    }

    if (materialRequested(item)) {
      const cell = row.getCell(10);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.amber100 } };
      cell.font = {
        name: FONT,
        size: 9.5,
        bold: true,
        color: { argb: C.amber700 },
      };
    }

    if (includeProgramControl) {
      const cell = row.getCell(11);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.blue50 } };
      cell.font = {
        name: OPERATIONS_FONT,
        size: 9.5,
        bold: true,
        color: { argb: C.blue700 },
      };
    }

    row.height = intelligentRowHeight(item, includeProgramControl);
  }

  if (items.length === 0) {
    sheet.mergeCells(`A6:${lastColumn}7`);
    const empty = sheet.getCell("A6");
    empty.value = "Nenhuma OS disponível para esta exportação.";
    empty.font = {
      name: FONT,
      size: 11,
      bold: true,
      color: { argb: C.slate500 },
    };
    empty.alignment = { vertical: "middle", horizontal: "center" };
  }

  const lastRow = Math.max(7, rowNumber - 1);
  sheet.autoFilter = `A5:${lastColumn}5`;
  configurePrint(sheet, `A1:${lastColumn}${lastRow}`, generatedAt, "5:5");
  return sheet;
}

function buildExecutiveSheet(
  workbook: ExcelJS.Workbook,
  items: ProgramacaoExportRow[],
  title: string,
  generatedAt: Date,
) {
  const sheet = workbook.addWorksheet("Visão Executiva", {
    properties: { tabColor: { argb: C.blue600 } },
  });
  for (let index = 1; index <= 12; index += 1) sheet.getColumn(index).width = 12;
  sheet.views = [{ state: "normal", showGridLines: false }];

  const metrics = operationalMetrics(items, generatedAt);

  sheet.mergeCells("A1:L1");
  const heading = sheet.getCell("A1");
  heading.value = `${title.toUpperCase()} · VISÃO EXECUTIVA`;
  heading.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy950 } };
  heading.font = {
    name: FONT_DISPLAY,
    size: 20,
    bold: true,
    color: { argb: C.white },
  };
  heading.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(1).height = 46;

  sheet.mergeCells("A2:L2");
  const subtitle = sheet.getCell("A2");
  subtitle.value = `Resumo operacional · Emitido em ${generatedAt.toLocaleString("pt-BR")}`;
  subtitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy900 } };
  subtitle.font = { name: FONT, size: 10, color: { argb: C.slate300 } };
  subtitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(2).height = 24;

  const cards = [
    ["A4:C6", `TOTAL DE OS\n${metrics.total}`, C.blue700, C.white],
    ["D4:F6", `EM PROGRAMAÇÃO\n${metrics.programmed}`, C.sky100, C.sky700],
    ["G4:I6", `MATERIAL SOLICITADO\n${metrics.material}`, C.amber100, C.amber700],
    ["J4:L6", `SLA VENCIDO\n${metrics.overdue}`, C.rose100, C.rose700],
  ] as const;

  cards.forEach(([range, value, bg, fg]) => {
    sheet.mergeCells(range);
    const cell = sheet.getCell(range.split(":")[0]);
    cell.value = value;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    cell.font = {
      name: FONT_DISPLAY,
      size: 15,
      bold: true,
      color: { argb: fg },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder;
  });
  sheet.getRow(4).height = 28;
  sheet.getRow(5).height = 28;
  sheet.getRow(6).height = 28;

  sheet.mergeCells("A8:L9");
  const note = sheet.getCell("A8");
  note.value =
    "Visão consolidada dos chamados corretivos para planejamento de campo, com acompanhamento de equipe, localização, SLA, materiais e programação.";
  note.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate100 } };
  note.font = {
    name: FONT,
    size: 10.5,
    bold: true,
    color: { argb: C.slate700 },
  };
  note.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  note.border = thinBorder;

  configurePrint(sheet, "A1:L9", generatedAt);
  return sheet;
}

export function buildProgramacaoWorkbook(
  osList: ProgramacaoExportRow[],
  equipeFiltro: string,
  aba: "corretiva" | "preventiva",
  generatedAt = new Date(),
) {
  const workbook = new ExcelJS.Workbook();
  const title =
    aba === "preventiva"
      ? "Programação de Backorder"
      : hasProgramControl(osList)
        ? "Corretivas em Programação"
        : "Programação de Corretivas";

  setWorkbookMetadata(workbook, title, generatedAt);
  buildExecutiveSheet(workbook, osList, title, generatedAt);
  buildOperationsSheet(
    workbook,
    "Programação Geral",
    osList,
    title,
    equipeFiltro,
    generatedAt,
    C.blue600,
  );

  const usedNames = new Set(["Visão Executiva", "Programação Geral"]);
  const teams = [...new Set(osList.map((item) => item.equipe || "Sem equipe"))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  teams.forEach((team) => {
    const teamItems = osList.filter((item) => (item.equipe || "Sem equipe") === team);
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
  osList: ProgramacaoExportRow[],
  equipeFiltro: string,
  aba: "corretiva" | "preventiva",
) {
  const generatedAt = new Date();
  const workbook = buildProgramacaoWorkbook(osList, equipeFiltro, aba, generatedAt);
  const buffer = await workbook.xlsx.writeBuffer();
  const { saveAs } = await import("file-saver");
  const slug = equipeFiltro
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `apont-auto_programacao-${aba}_${slug || "todas-equipes"}_${generatedAt.toISOString().slice(0, 10)}.xlsx`,
  );
}
