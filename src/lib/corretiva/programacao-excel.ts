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
  graphite: argb("#0B1724"),
  navy: argb("#17324A"),
  navySoft: argb("#EAF0F5"),
  white: argb("#FFFFFF"),
  ink: argb("#152536"),
  slate: argb("#425466"),
  muted: argb("#6B7B8C"),
  border: argb("#D9E2E8"),
  surface: argb("#F7F9FB"),
  surfaceAlt: argb("#F1F5F8"),
  teal: argb("#147C73"),
  tealSoft: argb("#E8F5F3"),
  amber: argb("#B07014"),
  amberSoft: argb("#FCF5E5"),
  backorder: argb("#245B9E"),
  backorderSoft: argb("#EAF2FB"),
};

const FONT = "Aptos";
const FONT_DISPLAY = "Aptos Display";

const BACKORDER_BRAND_ASSETS = {
  gps: "/__l5e/assets-v1/d386a336-b420-4782-9d48-85d30cbb6fee/grupo-gps.png",
  sherwin:
    "/__l5e/assets-v1/76b6660e-a690-4ff2-8943-c6f831b5ded6/sherwin-williams.png",
} as const;

const COLUMN_WIDTHS = [15, 20, 24, 14, 14, 24, 58, 17, 21] as const;

const TEAM_STYLE: Record<string, { bg: string; fg: string; accent: string }> = {
  ELETRICA: { bg: "#FEF3C7", fg: "#92400E", accent: "#D97706" },
  HIDRAULICA: { bg: "#E6F0FC", fg: "#1D4ED8", accent: "#3B82F6" },
  CIVIL: { bg: "#E7F7F0", fg: "#047857", accent: "#10B981" },
  CHAVEIRO: { bg: "#F0ECFC", fg: "#6D28D9", accent: "#8B5CF6" },
  PINTURA: { bg: "#FBEAF2", fg: "#BE185D", accent: "#DB4B86" },
  REFRIGERACAO: { bg: "#E4F6F9", fg: "#0E7490", accent: "#0891B2" },
  LIMPEZA: { bg: "#EAF7ED", fg: "#15803D", accent: "#22C55E" },
  OUTROS: { bg: "#EEF2F5", fg: "#475569", accent: "#94A3B8" },
};

const thinBorder = {
  top: { style: "thin" as const, color: { argb: C.border } },
  bottom: { style: "thin" as const, color: { argb: C.border } },
  left: { style: "thin" as const, color: { argb: C.border } },
  right: { style: "thin" as const, color: { argb: C.border } },
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
    "ENCERRADA",
    "ENCERRADO",
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

function materialRequested(item: OsCacheRow) {
  return (
    normalize(item.material_status) === "SOLICITADO" ||
    Boolean(String(item.pecas_solicitadas ?? "").trim())
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}/.test(raw)
    ? new Date(`${raw.slice(0, 10)}T12:00:00`)
    : new Date(raw);
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

function setWorkbookMetadata(workbook: ExcelJS.Workbook, title: string, generatedAt: Date) {
  workbook.creator = "Apont Auto · Grupo GPS";
  workbook.lastModifiedBy = "Apont Auto";
  workbook.company = "Grupo GPS";
  workbook.title = title;
  workbook.subject = "Programação de chamados corretivos";
  workbook.description =
    "Planilha operacional de manutenção corretiva organizada por equipe, localização e status de materiais.";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  workbook.calcProperties.fullCalcOnLoad = true;
}

function estimateWrappedLines(value: unknown, charsPerLine = 54) {
  const text = String(value ?? "").replace(/\r/g, "").trim();
  if (!text) return 1;

  return text.split("\n").reduce((total, paragraph) => {
    const normalizedParagraph = paragraph.replace(/\s+/g, " ").trim();
    if (!normalizedParagraph) return total + 1;

    const words = normalizedParagraph.split(" ");
    let lines = 1;
    let currentLength = 0;
    for (const word of words) {
      const required = currentLength === 0 ? word.length : word.length + 1;
      if (currentLength > 0 && currentLength + required > charsPerLine) {
        lines += 1;
        currentLength = word.length;
      } else {
        currentLength += required;
      }
    }
    return total + lines;
  }, 0);
}

function compactRowHeight(description: unknown) {
  const lines = estimateWrappedLines(description);
  return Math.min(118, Math.max(42, 25 + lines * 14));
}

function configurePrint(sheet: ExcelJS.Worksheet, lastRow: number, generatedAt: Date) {
  sheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    verticalCentered: false,
    blackAndWhite: false,
    draft: false,
    margins: {
      left: 0.18,
      right: 0.18,
      top: 0.28,
      bottom: 0.42,
      header: 0.08,
      footer: 0.18,
    },
    printArea: `A1:I${lastRow}`,
    printTitlesRow: "2:2",
  };

  const emitted = generatedAt.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  sheet.headerFooter.oddHeader = "";
  sheet.headerFooter.evenHeader = "";
  sheet.headerFooter.oddFooter =
    `&L&8Grupo GPS · Facilities&C&8Apont Auto · Corretivas&R&8Página &P de &N · ${emitted}`;
}

function applyTitleBand(
  sheet: ExcelJS.Worksheet,
  reportTitle: string,
  teamLabel: string,
  itemCount: number,
  backorderTheme: boolean,
) {
  sheet.mergeCells("A1:I1");
  const cell = sheet.getCell("A1");
  cell.value = `${reportTitle.toUpperCase()}  ·  ${teamLabel.toUpperCase()}  ·  ${itemCount} OS`;
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: backorderTheme ? C.backorder : C.graphite },
  };
  cell.font = {
    name: FONT_DISPLAY,
    size: 18,
    bold: true,
    color: { argb: C.white },
  };
  cell.alignment = {
    vertical: "middle",
    horizontal: backorderTheme ? "center" : "left",
    indent: backorderTheme ? 0 : 1,
  };
  cell.border = {
    bottom: { style: "medium", color: { argb: backorderTheme ? C.white : C.teal } },
  };
  sheet.getRow(1).height = 36;
}

function buildOperationsSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  sourceItems: ProgramacaoExportRow[],
  teamLabel: string,
  generatedAt: Date,
  tabColor: string,
  reportTitle = "Programação de Corretivas",
  backorderTheme = false,
) {
  const items = onlyOpenItems(sourceItems);
  const sheet = workbook.addWorksheet(name, {
    properties: { tabColor: { argb: tabColor }, defaultRowHeight: 20 },
  });

  COLUMN_WIDTHS.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  sheet.views = [
    {
      state: "frozen",
      ySplit: 2,
      showGridLines: false,
      zoomScale: 90,
      zoomScaleNormal: 90,
    },
  ];

  applyTitleBand(sheet, reportTitle, teamLabel, items.length, backorderTheme);

  const headers = [
    "OS",
    "Equipe",
    "Solicitante",
    "Prédio",
    "Andar",
    "Local",
    "Descrição do Serviço",
    "Abertura",
    "Material",
  ];

  const headerRow = sheet.getRow(2);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: backorderTheme ? C.backorder : C.navy },
    };
    cell.font = {
      name: FONT_DISPLAY,
      size: 9.5,
      bold: true,
      color: { argb: C.white },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: index === 6 ? "left" : "center",
      wrapText: true,
    };
    cell.border = {
      top: thinBorder.top,
      right: thinBorder.right,
      bottom: { style: "medium", color: { argb: backorderTheme ? C.backorder : C.teal } },
      left: thinBorder.left,
    };
  });
  headerRow.height = 30;

  let rowNumber = 3;

  items.forEach((item, itemIndex) => {
    const row = sheet.getRow(rowNumber++);
    const palette = teamStyle(item.equipe);
    const zebra = itemIndex % 2 === 0 ? C.white : C.surface;
    const material = materialRequested(item);
    const values = [
      item.numero_os || "—",
      item.equipe || "Sem equipe",
      item.solicitante || "—",
      item.predio || "—",
      item.andar || "—",
      item.local || "—",
      item.nome_os || "Sem descrição informada",
      formatDate(item.data_criacao),
      material ? "SOLICITADO" : "NÃO",
    ];

    values.forEach((value, index) => {
      const cell = row.getCell(index + 1);
      cell.value = value;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
      cell.border = thinBorder;
      cell.alignment = {
        vertical: index === 6 ? "top" : "middle",
        horizontal: index === 6 ? "left" : "center",
        wrapText: true,
      };
      cell.font = {
        name: FONT,
        size: index === 6 ? 10.5 : 9.5,
        color: { argb: C.ink },
      };
    });

    const osCell = row.getCell(1);
    osCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(palette.bg) } };
    osCell.font = {
      name: FONT_DISPLAY,
      size: 11,
      bold: true,
      color: { argb: argb(palette.fg) },
    };

    const teamCell = row.getCell(2);
    teamCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(palette.bg) } };
    teamCell.font = {
      name: FONT_DISPLAY,
      size: 10,
      bold: true,
      color: { argb: argb(palette.fg) },
    };

    [3, 4, 5, 6].forEach((column) => {
      row.getCell(column).font = {
        name: FONT,
        size: 9.5,
        bold: column === 3,
        color: { argb: C.ink },
      };
    });

    const descriptionCell = row.getCell(7);
    descriptionCell.font = {
      name: FONT,
      size: 10.5,
      bold: true,
      color: { argb: C.ink },
    };
    descriptionCell.alignment = {
      vertical: "top",
      horizontal: "left",
      wrapText: true,
      indent: 1,
    };

    const openingCell = row.getCell(8);
    openingCell.font = {
      name: FONT,
      size: 9,
      bold: true,
      color: { argb: C.slate },
    };

    const materialCell = row.getCell(9);
    materialCell.font = {
      name: FONT_DISPLAY,
      size: 9,
      bold: true,
      color: { argb: material ? C.amber : C.muted },
    };
    materialCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: material ? C.amberSoft : zebra },
    };

    row.height = compactRowHeight(item.nome_os);
  });

  if (!items.length) {
    sheet.mergeCells("A3:I5");
    const empty = sheet.getCell("A3");
    empty.value = "Nenhum chamado aberto disponível para esta planilha.";
    empty.font = {
      name: FONT_DISPLAY,
      size: 13,
      bold: true,
      color: { argb: C.muted },
    };
    empty.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.surface } };
    empty.alignment = { vertical: "middle", horizontal: "center" };
    empty.border = thinBorder;
    rowNumber = 6;
  }

  const lastRow = Math.max(2, rowNumber - 1);
  sheet.autoFilter = "A2:I2";
  configurePrint(sheet, lastRow, generatedAt);
  return sheet;
}

export function buildProgramacaoWorkbook(
  osList: ProgramacaoExportRow[],
  equipeFiltro: string,
  aba: "corretiva" | "preventiva" | "backorder",
  generatedAt = new Date(),
) {
  const openItems = onlyOpenItems(osList);
  const workbook = new ExcelJS.Workbook();
  const title =
    aba === "backorder"
      ? "Backorders"
      : aba === "preventiva"
        ? "Programação de Backorder"
        : "Programação de Corretivas";

  setWorkbookMetadata(workbook, title, generatedAt);

  buildOperationsSheet(
    workbook,
    "Programação Geral",
    openItems,
    equipeFiltro || "Todas as equipes",
    generatedAt,
    aba === "backorder" ? C.backorder : C.teal,
    title,
    aba === "backorder",
  );

  const usedNames = new Set(["Programação Geral"]);
  const teams = [
    ...new Set(
      openItems.map((item) => String(item.equipe || "Sem equipe").trim() || "Sem equipe"),
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

  teams.forEach((team) => {
    const teamItems = openItems.filter(
      (item) => (String(item.equipe || "Sem equipe").trim() || "Sem equipe") === team,
    );
    const palette = teamStyle(team);
    buildOperationsSheet(
      workbook,
      safeSheetName(`Equipe · ${team}`, usedNames),
      teamItems,
      team,
      generatedAt,
      argb(palette.accent),
      title,
      aba === "backorder",
    );
  });

  workbook.worksheets.forEach((sheet) => {
    sheet.pageSetup.blackAndWhite = false;
    sheet.pageSetup.draft = false;
  });

  return workbook;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Não foi possível carregar a logo corporativa."));
    reader.readAsDataURL(blob);
  });
}

async function imageUrlToDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Não foi possível carregar a logo corporativa (${response.status}).`);
  }
  return blobToDataUrl(await response.blob());
}

async function applyBackorderBranding(workbook: ExcelJS.Workbook) {
  const [gpsBase64, sherwinBase64] = await Promise.all([
    imageUrlToDataUrl(BACKORDER_BRAND_ASSETS.gps),
    imageUrlToDataUrl(BACKORDER_BRAND_ASSETS.sherwin),
  ]);

  const gpsImageId = workbook.addImage({ base64: gpsBase64, extension: "png" });
  const sherwinImageId = workbook.addImage({ base64: sherwinBase64, extension: "png" });

  workbook.worksheets.forEach((sheet) => {
    sheet.addImage(gpsImageId, {
      tl: { col: 0.08, row: 0.04 },
      ext: { width: 86, height: 54 },
    });
    sheet.addImage(sherwinImageId, {
      tl: { col: 8.22, row: 0.12 },
      ext: { width: 58, height: 28 },
    });
  });
}

export async function generateProgramacaoExcel(
  osList: ProgramacaoExportRow[],
  equipeFiltro: string,
  aba: "corretiva" | "preventiva" | "backorder",
) {
  const generatedAt = new Date();
  const openItems = onlyOpenItems(osList);
  const workbook = buildProgramacaoWorkbook(openItems, equipeFiltro, aba, generatedAt);

  if (aba === "backorder") await applyBackorderBranding(workbook);

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
    `${aba === "backorder" ? "backorders" : `programacao_${aba}`}_${slug || "todas_equipes"}_${generatedAt.toISOString().slice(0, 10)}.xlsx`,
  );

  return {
    exported: openItems.length,
    excludedCompleted: osList.length - openItems.length,
  };
}
