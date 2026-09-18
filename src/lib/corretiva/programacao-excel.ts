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
  ink: argb("#07111F"),
  navy: argb("#0D2238"),
  navySoft: argb("#173B5C"),
  blue: argb("#2563EB"),
  blueSoft: argb("#EAF2FF"),
  cyan: argb("#38BDF8"),
  cyanSoft: argb("#E0F2FE"),
  emerald: argb("#059669"),
  emeraldSoft: argb("#D1FAE5"),
  amber: argb("#D97706"),
  amberSoft: argb("#FEF3C7"),
  red: argb("#DC2626"),
  redSoft: argb("#FEE2E2"),
  violet: argb("#7C3AED"),
  violetSoft: argb("#EDE9FE"),
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
export const OPERATIONS_FONT = "Aptos Display";
export const OPERATIONS_FONT_SIZE = 13;
export const OPERATIONS_ROW_HEIGHT = 74;

const TEAM_STYLE: Record<string, { bg: string; fg: string; accent: string }> = {
  ELETRICA: { bg: "#FFF7E6", fg: "#92400E", accent: "#F59E0B" },
  HIDRAULICA: { bg: "#EFF6FF", fg: "#1D4ED8", accent: "#3B82F6" },
  CIVIL: { bg: "#ECFDF5", fg: "#047857", accent: "#10B981" },
  CHAVEIRO: { bg: "#F5F3FF", fg: "#6D28D9", accent: "#8B5CF6" },
  PINTURA: { bg: "#FDF2F8", fg: "#BE185D", accent: "#EC4899" },
  REFRIGERACAO: { bg: "#ECFEFF", fg: "#0E7490", accent: "#06B6D4" },
  LIMPEZA: { bg: "#F0FDF4", fg: "#15803D", accent: "#22C55E" },
  OUTROS: { bg: "#F8FAFC", fg: "#475569", accent: "#94A3B8" },
};

const thinBorder = {
  top: { style: "thin" as const, color: { argb: C.slate200 } },
  bottom: { style: "thin" as const, color: { argb: C.slate200 } },
  left: { style: "thin" as const, color: { argb: C.slate200 } },
  right: { style: "thin" as const, color: { argb: C.slate200 } },
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

function isCompletedStatus(status: unknown) {
  return [
    "CONCLUIDA",
    "CONCLUIDO",
    "FINALIZADA",
    "FINALIZADO",
    "FECHADA",
    "FECHADO",
  ].includes(normalize(status));
}

function onlyOpenItems(items: ProgramacaoExportRow[]) {
  return items.filter((item) => !isCompletedStatus(item.status));
}

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
  return normalize(item.material_status) === "SOLICITADO" || Boolean(String(item.pecas_solicitadas ?? "").trim());
}

function materialDetails(item: OsCacheRow) {
  const raw = String(item.pecas_solicitadas ?? "").trim();
  if (!raw) return materialRequested(item) ? "Solicitação registrada" : "—";
  return raw.length > 900 ? `${raw.slice(0, 897)}...` : raw;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}/.test(raw)
    ? new Date(`${raw.slice(0, 10)}T12:00:00`)
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

function slaInfo(value: string | null | undefined, generatedAt: Date) {
  if (!value) return { label: "—", overdue: false, dueSoon: false };
  const raw = String(value);
  const due = /^\d{4}-\d{2}-\d{2}/.test(raw)
    ? new Date(`${raw.slice(0, 10)}T12:00:00`)
    : new Date(raw);
  if (Number.isNaN(due.getTime())) return { label: "—", overdue: false, dueSoon: false };

  const reference = new Date(generatedAt);
  reference.setHours(12, 0, 0, 0);
  due.setHours(12, 0, 0, 0);
  const days = Math.round((due.getTime() - reference.getTime()) / 86400000);

  if (days < 0) {
    const n = Math.abs(days);
    return { label: `VENCIDO HÁ ${n} DIA${n === 1 ? "" : "S"}`, overdue: true, dueSoon: false };
  }
  if (days === 0) return { label: "VENCE HOJE", overdue: false, dueSoon: true };
  if (days <= 3) return { label: `VENCE EM ${days} DIA${days === 1 ? "" : "S"}`, overdue: false, dueSoon: true };
  return { label: `Vence em ${days} dias`, overdue: false, dueSoon: false };
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

function visualLineCount(value: unknown, charsPerLine: number) {
  const text = String(value ?? "").trim();
  if (!text) return 1;
  return text
    .split(/\r?\n/)
    .reduce((total, part) => total + Math.max(1, Math.ceil(part.length / charsPerLine)), 0);
}

function intelligentRowHeight(item: ProgramacaoExportRow, includeProgramControl: boolean) {
  const lines = Math.max(
    visualLineCount(item.nome_os, 58),
    visualLineCount(item.local, 28),
    visualLineCount(item.solicitante, 22),
    visualLineCount(materialDetails(item), 42),
    includeProgramControl ? visualLineCount(item.programacao_periodo, 24) : 1,
    2,
  );
  return Math.min(220, Math.max(OPERATIONS_ROW_HEIGHT, 34 + lines * 20));
}

function setWorkbookMetadata(workbook: ExcelJS.Workbook, title: string, generatedAt: Date) {
  workbook.creator = "Apont Auto";
  workbook.lastModifiedBy = "Apont Auto";
  workbook.company = "Apont Auto";
  workbook.title = title;
  workbook.subject = "Programação e controle operacional de chamados corretivos";
  workbook.description = "Relatório operacional de corretivas abertas, equipes, SLA, materiais solicitados e programação de campo.";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  workbook.calcProperties.fullCalcOnLoad = true;
}

function configurePrint(sheet: ExcelJS.Worksheet, printArea: string, generatedAt: Date, repeatRows?: string) {
  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 8,
    horizontalCentered: true,
    blackAndWhite: false,
    margins: {
      left: 0.18,
      right: 0.18,
      top: 0.28,
      bottom: 0.42,
      header: 0.1,
      footer: 0.15,
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
  sheet.headerFooter.oddFooter = `&L&10Apont Auto · PCM · Corretivas&C&10Página &P de &N&R&10Emitido em ${emitted}`;
}

function operationalMetrics(items: ProgramacaoExportRow[], generatedAt: Date) {
  return {
    total: items.length,
    teams: new Set(items.map((item) => String(item.equipe || "Sem equipe").trim()).filter(Boolean)).size,
    programmed: programCount(items),
    material: items.filter(materialRequested).length,
    overdue: items.filter((item) => slaInfo(item.data_sla, generatedAt).overdue).length,
  };
}

function styleKpi(
  sheet: ExcelJS.Worksheet,
  range: string,
  label: string,
  value: number,
  fill: string,
  foreground: string,
) {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(":")[0]);
  cell.value = `${String(value).padStart(2, "0")}  ${label}`;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  cell.font = { name: FONT_DISPLAY, size: 13, bold: true, color: { argb: foreground } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = {
    top: { style: "thin", color: { argb: C.slate200 } },
    bottom: { style: "thin", color: { argb: C.slate200 } },
    left: { style: "thin", color: { argb: C.slate200 } },
    right: { style: "thin", color: { argb: C.slate200 } },
  };
}

function buildOperationsSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  sourceItems: ProgramacaoExportRow[],
  title: string,
  scope: string,
  generatedAt: Date,
  tabColor: string,
) {
  const items = onlyOpenItems(sourceItems);
  const includeProgramControl = hasProgramControl(items);
  const baseHeaders = [
    "OS",
    "Tipo",
    "Equipe",
    "Solicitante",
    "Prédio",
    "Andar",
    "Local",
    "Descrição do Serviço",
    "Abertura",
    "SLA",
    "Material Solicitado",
    "Detalhes do Material",
  ];
  const programHeaders = [
    "Programação",
    "Dia programado",
    "Período da programação",
    "Equipe programada",
  ];
  const headers = includeProgramControl ? [...baseHeaders, ...programHeaders] : baseHeaders;
  const widths = includeProgramControl
    ? [16, 17, 23, 26, 22, 17, 34, 72, 17, 24, 22, 48, 23, 23, 34, 28]
    : [16, 17, 23, 26, 22, 17, 34, 78, 17, 24, 22, 52];
  const lastColumn = excelColumnName(headers.length);
  const metrics = operationalMetrics(items, generatedAt);

  const sheet = workbook.addWorksheet(name, {
    properties: { tabColor: { argb: tabColor }, defaultRowHeight: OPERATIONS_ROW_HEIGHT },
  });
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.views = [
    {
      state: "frozen",
      xSplit: 1,
      ySplit: 7,
      showGridLines: false,
      zoomScale: 90,
      zoomScaleNormal: 90,
    },
  ];

  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.mergeCells(`A2:${lastColumn}2`);

  const titleCell = sheet.getCell("A1");
  titleCell.value = title.toUpperCase();
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.ink } };
  titleCell.font = { name: FONT_DISPLAY, size: 26, bold: true, color: { argb: C.white } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  const subtitle = sheet.getCell("A2");
  subtitle.value = `APONT AUTO  /  PCM  /  ${scope.toUpperCase()}  •  ${items.length} OS ABERTAS  •  ${generatedAt.toLocaleString("pt-BR")}`;
  subtitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy } };
  subtitle.font = { name: FONT, size: 12, bold: true, color: { argb: C.slate300 } };
  subtitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(1).height = 54;
  sheet.getRow(2).height = 31;

  const ranges = includeProgramControl
    ? ["A3:D4", "E3:H4", "I3:L4", "M3:P4"]
    : ["A3:C4", "D3:F4", "G3:I4", "J3:L4"];
  styleKpi(sheet, ranges[0], "OS ABERTAS", metrics.total, C.blue, C.white);
  styleKpi(sheet, ranges[1], "MATERIAL SOLICITADO", metrics.material, C.amberSoft, C.amber);
  styleKpi(sheet, ranges[2], "SLA VENCIDO", metrics.overdue, metrics.overdue ? C.redSoft : C.emeraldSoft, metrics.overdue ? C.red : C.emerald);
  styleKpi(sheet, ranges[3], includeProgramControl ? "EM PROGRAMAÇÃO" : "EQUIPES", includeProgramControl ? metrics.programmed : metrics.teams, includeProgramControl ? C.cyanSoft : C.slate100, includeProgramControl ? C.sky700 ?? C.blue : C.slate700);
  sheet.getRow(3).height = 28;
  sheet.getRow(4).height = 28;
  sheet.getRow(5).height = 9;

  sheet.mergeCells(`A6:${lastColumn}6`);
  const note = sheet.getCell("A6");
  note.value = "Somente chamados abertos entram nesta planilha. Solicitações de material são identificadas pelo status do material e pelo histórico de peças solicitadas.";
  note.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.blueSoft } };
  note.font = { name: FONT, size: 11, bold: true, color: { argb: C.navySoft } };
  note.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  sheet.getRow(6).height = 27;

  const headerRow = sheet.getRow(7);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navySoft } };
    cell.font = { name: FONT_DISPLAY, size: 12, bold: true, color: { argb: C.white } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder;
  });
  headerRow.height = 46;

  let rowNumber = 8;
  items.forEach((item, itemIndex) => {
    const row = sheet.getRow(rowNumber++);
    const sla = slaInfo(item.data_sla, generatedAt);
    const material = materialRequested(item);
    const values: Array<string | number | null | undefined> = [
      item.numero_os || "—",
      typeLabel(item),
      item.equipe || "Sem equipe",
      item.solicitante || "—",
      item.predio || "—",
      item.andar || "—",
      item.local || "—",
      item.nome_os || "Sem descrição",
      formatDate(item.data_criacao),
      sla.label,
      material ? "SIM · SOLICITADO" : "NÃO",
      materialDetails(item),
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
      cell.value = value ?? "—";
      const isDescription = index === 7;
      const isLocation = [4, 5, 6].includes(index);
      const isKey = index === 0 || index === 2 || isDescription || isLocation;
      cell.font = {
        name: isKey ? FONT_DISPLAY : FONT,
        size: isDescription ? 13.5 : isKey ? 12.5 : 11.5,
        bold: isKey,
        color: { argb: C.slate900 },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: [0, 1, 2, 5, 8, 9, 10, 12, 13].includes(index) ? "center" : "left",
        wrapText: true,
      };
      cell.border = thinBorder;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: itemIndex % 2 === 0 ? C.white : C.slate50 },
      };
    });

    const team = teamStyle(item.equipe);
    const teamCell = row.getCell(3);
    teamCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(team.bg) } };
    teamCell.font = { name: FONT_DISPLAY, size: 12.5, bold: true, color: { argb: argb(team.fg) } };

    const typeCell = row.getCell(2);
    if (isExplicitBackorder(item)) {
      typeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.redSoft } };
      typeCell.font = { name: FONT_DISPLAY, size: 11.5, bold: true, color: { argb: C.red } };
    }

    const slaCell = row.getCell(10);
    if (sla.overdue) {
      slaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.redSoft } };
      slaCell.font = { name: FONT_DISPLAY, size: 11.5, bold: true, color: { argb: C.red } };
    } else if (sla.dueSoon) {
      slaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.amberSoft } };
      slaCell.font = { name: FONT_DISPLAY, size: 11.5, bold: true, color: { argb: C.amber } };
    }

    const materialCell = row.getCell(11);
    const materialDetailsCell = row.getCell(12);
    if (material) {
      materialCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.amberSoft } };
      materialCell.font = { name: FONT_DISPLAY, size: 11.5, bold: true, color: { argb: C.amber } };
      materialDetailsCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#FFFBEB") } };
      materialDetailsCell.font = { name: FONT, size: 11.5, bold: true, color: { argb: C.slate700 } };
    } else {
      materialCell.font = { name: FONT, size: 11, color: { argb: C.slate500 } };
      materialDetailsCell.font = { name: FONT, size: 11, color: { argb: C.slate500 } };
    }

    if (includeProgramControl) {
      const programCell = row.getCell(13);
      programCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.cyanSoft } };
      programCell.font = { name: FONT_DISPLAY, size: 11.5, bold: true, color: { argb: C.sky700 ?? C.blue } };
    }

    row.height = intelligentRowHeight(item, includeProgramControl);
  });

  if (!items.length) {
    sheet.mergeCells(`A8:${lastColumn}10`);
    const empty = sheet.getCell("A8");
    empty.value = "Nenhum chamado aberto disponível para esta exportação.";
    empty.font = { name: FONT_DISPLAY, size: 15, bold: true, color: { argb: C.slate500 } };
    empty.alignment = { vertical: "middle", horizontal: "center" };
  }

  const lastRow = Math.max(10, rowNumber - 1);
  sheet.autoFilter = `A7:${lastColumn}7`;
  configurePrint(sheet, `A1:${lastColumn}${lastRow}`, generatedAt, "1:7");
  return sheet;
}

function buildExecutiveSheet(
  workbook: ExcelJS.Workbook,
  sourceItems: ProgramacaoExportRow[],
  title: string,
  generatedAt: Date,
) {
  const items = onlyOpenItems(sourceItems);
  const metrics = operationalMetrics(items, generatedAt);
  const sheet = workbook.addWorksheet("Resumo Executivo", {
    properties: { tabColor: { argb: C.blue } },
  });
  for (let index = 1; index <= 12; index += 1) sheet.getColumn(index).width = 14;
  sheet.views = [{ state: "normal", showGridLines: false, zoomScale: 100 }];

  sheet.mergeCells("A1:L2");
  const heading = sheet.getCell("A1");
  heading.value = `${title.toUpperCase()}\nAPONT AUTO · PCM`;
  heading.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.ink } };
  heading.font = { name: FONT_DISPLAY, size: 25, bold: true, color: { argb: C.white } };
  heading.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  sheet.getRow(1).height = 40;
  sheet.getRow(2).height = 32;

  styleKpi(sheet, "A4:C6", "OS ABERTAS", metrics.total, C.blue, C.white);
  styleKpi(sheet, "D4:F6", "MATERIAL SOLICITADO", metrics.material, C.amberSoft, C.amber);
  styleKpi(sheet, "G4:I6", "SLA VENCIDO", metrics.overdue, metrics.overdue ? C.redSoft : C.emeraldSoft, metrics.overdue ? C.red : C.emerald);
  styleKpi(sheet, "J4:L6", "EM PROGRAMAÇÃO", metrics.programmed, C.cyanSoft, C.sky700 ?? C.blue);

  sheet.mergeCells("A8:L9");
  const note = sheet.getCell("A8");
  note.value = `Relatório gerado em ${generatedAt.toLocaleString("pt-BR")} · Somente OS abertas são exportadas. Chamados concluídos, finalizados ou fechados são descartados automaticamente.`;
  note.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate100 } };
  note.font = { name: FONT, size: 12, bold: true, color: { argb: C.slate700 } };
  note.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  const teamCounts = new Map<string, number>();
  items.forEach((item) => {
    const team = String(item.equipe || "Sem equipe").trim() || "Sem equipe";
    teamCounts.set(team, (teamCounts.get(team) ?? 0) + 1);
  });
  const teams = [...teamCounts.entries()].sort((a, b) => b[1] - a[1]);

  sheet.mergeCells("A11:L11");
  const section = sheet.getCell("A11");
  section.value = "DISTRIBUIÇÃO POR EQUIPE";
  section.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navySoft } };
  section.font = { name: FONT_DISPLAY, size: 13, bold: true, color: { argb: C.white } };
  section.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(11).height = 28;

  teams.slice(0, 8).forEach(([team, count], index) => {
    const row = 12 + index;
    sheet.mergeCells(`A${row}:H${row}`);
    sheet.mergeCells(`I${row}:L${row}`);
    const nameCell = sheet.getCell(`A${row}`);
    nameCell.value = team;
    nameCell.font = { name: FONT_DISPLAY, size: 12.5, bold: true, color: { argb: C.slate900 } };
    nameCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? C.white : C.slate50 } };
    nameCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    const countCell = sheet.getCell(`I${row}`);
    countCell.value = `${count} OS`;
    countCell.font = { name: FONT_DISPLAY, size: 12.5, bold: true, color: { argb: C.blue } };
    countCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? C.white : C.slate50 } };
    countCell.alignment = { vertical: "middle", horizontal: "center" };
    sheet.getRow(row).height = 26;
  });

  const lastRow = Math.max(20, 11 + Math.min(teams.length, 8));
  configurePrint(sheet, `A1:L${lastRow}`, generatedAt);
  return sheet;
}

export function buildProgramacaoWorkbook(
  osList: ProgramacaoExportRow[],
  equipeFiltro: string,
  aba: "corretiva" | "preventiva",
  generatedAt = new Date(),
) {
  const openItems = onlyOpenItems(osList);
  const workbook = new ExcelJS.Workbook();
  const title =
    aba === "preventiva"
      ? "Programação de Backorder"
      : hasProgramControl(openItems)
        ? "Corretivas em Programação"
        : "Programação de Corretivas";

  setWorkbookMetadata(workbook, title, generatedAt);
  buildExecutiveSheet(workbook, openItems, title, generatedAt);
  buildOperationsSheet(
    workbook,
    "Programação Geral",
    openItems,
    title,
    equipeFiltro,
    generatedAt,
    C.blue,
  );

  const usedNames = new Set(["Resumo Executivo", "Programação Geral"]);
  const teams = [...new Set(openItems.map((item) => item.equipe || "Sem equipe"))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  teams.forEach((team) => {
    const teamItems = openItems.filter((item) => (item.equipe || "Sem equipe") === team);
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
  const openItems = onlyOpenItems(osList);
  const workbook = buildProgramacaoWorkbook(openItems, equipeFiltro, aba, generatedAt);
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
    `programacao_${aba}_${slug || "todas_equipes"}_${generatedAt.toISOString().slice(0, 10)}.xlsx`,
  );
  return { exported: openItems.length, excludedCompleted: osList.length - openItems.length };
}
