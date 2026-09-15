import ExcelJS from "exceljs";
import type { OsCacheRow } from "./db";
import {
  classifyPriority,
  PRIORITY_HEX,
  type PriorityLevel,
} from "./priority-classifier";

export type ProgramacaoExportRow = OsCacheRow & {
  programacao_status?: string | null;
  programacao_dia?: string | null;
  programacao_periodo?: string | null;
  programacao_equipe?: string | null;
};

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

const C = {
  navy950: argb("#06111F"),
  navy900: argb("#0B1F33"),
  navy800: argb("#12314C"),
  blue700: argb("#1D4ED8"),
  blue600: argb("#2563EB"),
  sky50: argb("#F0F9FF"),
  sky700: argb("#0369A1"),
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
export const OPERATIONS_FONT_SIZE = 11;
export const OPERATIONS_ROW_HEIGHT = 54;

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
  if (
    [
      "CONCLUIDO",
      "CONCLUIDA",
      "FINALIZADO",
      "FINALIZADA",
      "FECHADO",
      "FECHADA",
    ].includes(value)
  )
    return "Concluído";
  if (
    ["EM ANDAMENTO", "EM EXECUCAO", "EXECUCAO", "ANDAMENTO"].includes(
      value,
    )
  )
    return "Em andamento";
  if (
    [
      "AGUARDANDO MATERIAL",
      "MATERIAL",
      "AGUARDANDO PECA",
      "AGUARDANDO PECAS",
    ].includes(value)
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

function setWorkbookMetadata(
  workbook: ExcelJS.Workbook,
  title: string,
  generatedAt: Date,
) {
  workbook.creator = "Apont Auto";
  workbook.lastModifiedBy = "Apont Auto";
  workbook.company = "Apont Auto";
  workbook.title = title;
  workbook.subject = "Controle de chamados corretivos";
  workbook.description =
    "Relatório de corretivas com classificação automática de prioridade e controle de programação.";
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
    "&L&9Apont Auto · Corretivas&C&9Página &P de &N&R&9Controle operacional";
}

function priorityArgb(level: PriorityLevel) {
  return {
    bg: argb(PRIORITY_HEX[level].bg),
    fg: argb(PRIORITY_HEX[level].fg),
  };
}

function stylePriorityCell(
  cell: ExcelJS.Cell,
  level: PriorityLevel,
  score: number,
) {
  const colors = priorityArgb(level);
  cell.value = `${level} · ${score}`;
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: colors.bg },
  };
  cell.font = {
    name: OPERATIONS_FONT,
    size: 10.5,
    bold: true,
    color: { argb: colors.fg },
  };
  cell.alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };
  cell.border = thinBorder;
}

function visualLineCount(value: unknown, charsPerLine: number) {
  const text = String(value ?? "").trim();
  if (!text) return 1;
  return text.split(/\r?\n/).reduce((total, part) => {
    return total + Math.max(1, Math.ceil(part.trim().length / charsPerLine));
  }, 0);
}

function intelligentRowHeight(
  item: ProgramacaoExportRow,
  priorityReasons: string,
  includeProgramControl: boolean,
) {
  const lines = Math.max(
    visualLineCount(priorityReasons, 44),
    visualLineCount(item.equipe || "Sem equipe", 22),
    visualLineCount(`${item.predio || ""} / ${item.andar || ""}`, 25),
    visualLineCount(item.local || "", 34),
    visualLineCount(item.nome_os || "", 66),
    includeProgramControl
      ? visualLineCount(item.programacao_periodo || "", 28)
      : 1,
    2,
  );

  return Math.min(300, Math.max(54, 24 + lines * 18));
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
    ? [16, 17, 48, 26, 26, 27, 36, 72, 16, 16, 18, 22, 22, 22, 32, 28]
    : [16, 17, 48, 26, 26, 27, 36, 72, 16, 16, 18, 22];
  const lastColumn = excelColumnName(headers.length);

  const sheet = workbook.addWorksheet(name, {
    properties: {
      tabColor: { argb: tabColor },
      defaultRowHeight: OPERATIONS_ROW_HEIGHT,
    },
  });

  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];

  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.mergeCells(`A2:${lastColumn}2`);
  const titleCell = sheet.getCell("A1");
  titleCell.value = title.toUpperCase();
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
  titleCell.alignment = {
    vertical: "middle",
    horizontal: "left",
    indent: 1,
  };

  const subtitle = sheet.getCell("A2");
  subtitle.value = `${scope} • ${items.length} OS • Gerado em ${generatedAt.toLocaleString("pt-BR")}`;
  subtitle.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: C.navy900 },
  };
  subtitle.font = {
    name: FONT,
    size: 10,
    bold: true,
    color: { argb: C.slate300 },
  };
  subtitle.alignment = {
    vertical: "middle",
    horizontal: "left",
    indent: 1,
  };
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

  const cardRanges = includeProgramControl
    ? ["A3:D3", "E3:H3", "I3:L3", "M3:P3"]
    : ["A3:C3", "D3:F3", "G3:I3", "J3:L3"];
  const cards = [
    [cardRanges[0], `TOTAL · ${items.length}`, C.blue700],
    [
      cardRanges[1],
      `CRÍTICA · ${priorityCounts.CRÍTICA}`,
      argb(PRIORITY_HEX.CRÍTICA.bg),
    ],
    [
      cardRanges[2],
      `ALTA · ${priorityCounts.ALTA}`,
      argb(PRIORITY_HEX.ALTA.bg),
    ],
    [
      cardRanges[3],
      `MÉDIA · ${priorityCounts.MÉDIA}`,
      argb(PRIORITY_HEX.MÉDIA.bg),
    ],
  ] as const;
  cards.forEach(([range, value, color]) => {
    sheet.mergeCells(range);
    const cell = sheet.getCell(range.split(":")[0]);
    cell.value = value;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: color },
    };
    cell.font = {
      name: FONT_DISPLAY,
      size: 11,
      bold: true,
      color: { argb: C.white },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
  });
  sheet.getRow(3).height = 30;
  sheet.getRow(4).height = 7;

  const headerRow = sheet.getRow(5);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: C.navy800 },
    };
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
  headerRow.height = 36;

  let rowNumber = 6;
  for (const item of items) {
    const row = sheet.getRow(rowNumber++);
    const priority = classifyPriority(item, generatedAt);
    const reasons = priority.reasons.slice(0, 4).join(" · ");
    const age = ageInDays(item.data_criacao);
    const baseValues = [
      item.numero_os,
      "",
      reasons,
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
    const values = includeProgramControl
      ? [
          ...baseValues,
          item.programacao_status || "EM PROGRAMAÇÃO",
          item.programacao_dia || "—",
          item.programacao_periodo || "—",
          item.programacao_equipe || item.equipe || "—",
        ]
      : baseValues;

    values.forEach((value, index) => {
      const cell = row.getCell(index + 1);
      cell.value = value;
      cell.font = {
        name: FONT,
        size: index === 7 ? 10.5 : 9.5,
        bold: index === 0 || index === 3 || index === 7,
        color: { argb: C.slate900 },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: [0, 1, 8, 9, 10, 11, 12, 13].includes(index)
          ? "center"
          : "left",
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
    teamCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: argb(team.bg) },
    };
    teamCell.font = {
      name: FONT,
      size: 9.5,
      bold: true,
      color: { argb: argb(team.fg) },
    };
    teamCell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };

    if (age >= 30) {
      const slaCell = row.getCell(10);
      slaCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: argb("#FFF1F2") },
      };
      slaCell.font = {
        name: FONT,
        size: 9.5,
        bold: true,
        color: { argb: C.rose700 },
      };
    }

    if (materialRequested(item)) {
      const materialCell = row.getCell(11);
      materialCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: argb("#FFFBEB") },
      };
      materialCell.font = {
        name: FONT,
        size: 9.5,
        bold: true,
        color: { argb: C.amber700 },
      };
    }

    if (includeProgramControl) {
      const statusCell = row.getCell(13);
      statusCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: C.sky50 },
      };
      statusCell.font = {
        name: OPERATIONS_FONT,
        size: 9.5,
        bold: true,
        color: { argb: C.sky700 },
      };
    }

    row.height = intelligentRowHeight(item, reasons, includeProgramControl);
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
  configurePrint(sheet, `A1:${lastColumn}${lastRow}`, "1:5");
  return sheet;
}

function buildExecutiveSheet(
  workbook: ExcelJS.Workbook,
  items: ProgramacaoExportRow[],
  title: string,
  generatedAt: Date,
) {
  const sheet = workbook.addWorksheet("Visão Executiva", {
    properties: { tabColor: { argb: C.amber500 } },
  });
  for (let index = 1; index <= 12; index += 1) {
    sheet.getColumn(index).width = 12;
  }
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
  heading.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: C.navy950 },
  };
  heading.font = {
    name: FONT_DISPLAY,
    size: 20,
    bold: true,
    color: { argb: C.white },
  };
  heading.alignment = {
    vertical: "middle",
    horizontal: "left",
    indent: 1,
  };
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
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: color },
    };
    cell.font = {
      name: FONT_DISPLAY,
      size: 15,
      bold: true,
      color: { argb: C.white },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
  });
  sheet.getRow(3).height = 28;
  sheet.getRow(4).height = 28;
  sheet.getRow(5).height = 28;

  sheet.mergeCells("A7:L7");
  const note = sheet.getCell("A7");
  note.value =
    "Prioridade calculada automaticamente por descrição, local, SLA, antiguidade e contexto de risco. A exportação geral reúne todas as equipes presentes na base, independentemente dos filtros da tela.";
  note.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: C.slate100 },
  };
  note.font = {
    name: FONT,
    size: 10,
    bold: true,
    color: { argb: C.slate700 },
  };
  note.alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };
  sheet.getRow(7).height = 42;
  configurePrint(sheet, "A1:L7");
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
  const workbook = buildProgramacaoWorkbook(
    osList,
    equipeFiltro,
    aba,
    generatedAt,
  );
  const buffer = await workbook.xlsx.writeBuffer();
  const { saveAs } = await import("file-saver");
  const slug = equipeFiltro
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const fileName = `programacao_${aba}_${slug || "todas_equipes"}_${generatedAt
    .toISOString()
    .slice(0, 10)}.xlsx`;
  saveAs(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName,
  );
}
