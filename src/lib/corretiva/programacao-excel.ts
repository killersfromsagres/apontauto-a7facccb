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
  navySoft: argb("#173B5C"),
  white: argb("#FFFFFF"),
  slate900: argb("#0F172A"),
  slate700: argb("#334155"),
  slate500: argb("#64748B"),
  slate200: argb("#E2E8F0"),
  slate50: argb("#F8FAFC"),
  amber: argb("#D97706"),
  amberSoft: argb("#FEF3C7"),
};

const FONT = "Aptos";
const FONT_DISPLAY = "Aptos Display";
const FONT_DESCRIPTION = "Aptos SemiBold";

/**
 * Larguras copiadas do arquivo de referência corrigido pelo usuário.
 * O modo de impressão abaixo força A:I em uma única página A4 horizontal,
 * preservando estas proporções e evitando cortes nas colunas finais.
 */
const PRINT_COLUMN_WIDTHS = [
  16,
  18,
  25.85546875,
  13.140625,
  16,
  22.7109375,
  57.42578125,
  18,
  22,
] as const;

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
  workbook.creator = "Apont Auto";
  workbook.lastModifiedBy = "Apont Auto";
  workbook.company = "Apont Auto";
  workbook.title = title;
  workbook.subject = "Programação de chamados corretivos";
  workbook.description =
    "Planilha operacional de corretivas abertas por equipe, localização, descrição, abertura e material solicitado.";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  workbook.calcProperties.fullCalcOnLoad = true;
}

function estimateWrappedLines(value: unknown, charsPerLine = 42) {
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

/**
 * A coluna G do modelo corrigido ficou com largura ~57,43. Como a descrição usa
 * Aptos SemiBold 20, calculamos a altura por quantidade estimada de linhas nessa
 * largura. Mantemos um piso visual próximo ao modelo e aumentamos a linha sempre
 * que necessário, evitando que descrições longas sejam cortadas na tela ou na
 * impressão. Excel limita a altura a aproximadamente 409 pt.
 */
function descriptionDrivenRowHeight(description: unknown) {
  const lines = estimateWrappedLines(description, 42);
  const points = 42 + lines * 25;
  return Math.min(405, Math.max(150, points));
}

function configurePrint(
  sheet: ExcelJS.Worksheet,
  lastRow: number,
  generatedAt: Date,
) {
  sheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    verticalCentered: false,
    blackAndWhite: false,
    margins: {
      left: 0.1,
      right: 0.1,
      top: 0.18,
      bottom: 0.28,
      header: 0,
      footer: 0.1,
    },
    printArea: `A1:I${lastRow}`,
  };

  // A4 horizontal: todas as colunas A:I são reduzidas proporcionalmente para
  // caber em uma única página de largura. A altura pode continuar em várias páginas.
  // Repete somente o cabeçalho da tabela; o título fica apenas na primeira página.
  sheet.pageSetup.printTitlesRow = "2:2";

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
    `&L&9Apont Auto · PCM · Corretivas&C&9Página &P de &N&R&9Emitido em ${emitted}`;
}

function buildOperationsSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  sourceItems: ProgramacaoExportRow[],
  teamLabel: string,
  generatedAt: Date,
  tabColor: string,
) {
  const items = onlyOpenItems(sourceItems);
  const sheet = workbook.addWorksheet(name, {
    properties: { tabColor: { argb: tabColor }, defaultRowHeight: 20 },
  });

  // Replica as larguras do arquivo corrigido para todas as equipes e Programação Geral.
  PRINT_COLUMN_WIDTHS.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  sheet.views = [
    {
      state: "frozen",
      ySplit: 2,
      showGridLines: false,
      zoomScale: 85,
      zoomScaleNormal: 85,
    },
  ];

  sheet.mergeCells("A1:I1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `PROGRAMAÇÃO DE CORRETIVAS · ${teamLabel.toUpperCase()}`;
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.ink } };
  titleCell.font = {
    name: FONT_DISPLAY,
    size: 26,
    bold: true,
    color: { argb: C.white },
  };
  titleCell.alignment = {
    vertical: "middle",
    horizontal: "left",
    indent: 1,
  };
  sheet.getRow(1).height = 51.95;

  const headers = [
    "OS",
    "Equipe",
    "Solicitante",
    "Prédio",
    "Andar",
    "Local",
    "Descrição do Serviço",
    "Abertura",
    "Material Solicitado",
  ];

  const headerRow = sheet.getRow(2);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navySoft } };
    cell.font = {
      name: FONT_DISPLAY,
      size: 12,
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
  headerRow.height = 38.1;

  let rowNumber = 3;

  items.forEach((item, itemIndex) => {
    const row = sheet.getRow(rowNumber++);
    const team = teamStyle(item.equipe);
    const zebra = itemIndex % 2 === 0 ? C.white : C.slate50;
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
      material ? "SIM · SOLICITADO" : "NÃO",
    ];

    values.forEach((value, index) => {
      const cell = row.getCell(index + 1);
      cell.value = value;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
      cell.border = thinBorder;
      cell.alignment = {
        vertical: "middle",
        horizontal: index === 6 ? "left" : "center",
        wrapText: true,
      };
      cell.font = {
        name: FONT,
        size: 12,
        color: { argb: C.slate900 },
      };
    });

    // Coluna A — mesma identidade visual da equipe da coluna B, fonte 16.
    const osCell = row.getCell(1);
    osCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(team.bg) } };
    osCell.font = {
      name: FONT_DISPLAY,
      size: 16,
      bold: true,
      color: { argb: argb(team.fg) },
    };

    // Coluna B — referência visual principal da equipe, fonte 18.
    const teamCell = row.getCell(2);
    teamCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(team.bg) } };
    teamCell.font = {
      name: FONT_DISPLAY,
      size: 18,
      bold: true,
      color: { argb: argb(team.fg) },
    };

    // Colunas C, D, E e F — centralizadas, negrito, tamanho 16.
    [3, 4, 5, 6].forEach((column) => {
      const cell = row.getCell(column);
      cell.font = {
        name: FONT_DISPLAY,
        size: 16,
        bold: true,
        color: { argb: C.slate900 },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      };
    });

    // Coluna G — Aptos SemiBold 20, em negrito, com altura dinâmica pelo conteúdo.
    const descriptionCell = row.getCell(7);
    descriptionCell.font = {
      name: FONT_DESCRIPTION,
      size: 20,
      bold: true,
      color: { argb: C.slate900 },
    };
    descriptionCell.alignment = {
      vertical: "top",
      horizontal: "left",
      wrapText: true,
    };

    // Coluna H — abertura em negrito.
    const openingCell = row.getCell(8);
    openingCell.font = {
      name: FONT,
      size: 12,
      bold: true,
      color: { argb: C.slate900 },
    };

    const materialCell = row.getCell(9);
    if (material) {
      materialCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: C.amberSoft },
      };
      materialCell.font = {
        name: FONT_DISPLAY,
        size: 12,
        bold: true,
        color: { argb: C.amber },
      };
    } else {
      materialCell.font = {
        name: FONT,
        size: 11,
        color: { argb: C.slate500 },
      };
    }

    row.height = descriptionDrivenRowHeight(item.nome_os);
  });

  if (!items.length) {
    sheet.mergeCells("A3:I5");
    const empty = sheet.getCell("A3");
    empty.value = "Nenhum chamado aberto disponível para esta planilha.";
    empty.font = {
      name: FONT_DISPLAY,
      size: 16,
      bold: true,
      color: { argb: C.slate500 },
    };
    empty.alignment = { vertical: "middle", horizontal: "center" };
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
  aba: "corretiva" | "preventiva",
  generatedAt = new Date(),
) {
  const openItems = onlyOpenItems(osList);
  const workbook = new ExcelJS.Workbook();
  const title = aba === "preventiva" ? "Programação de Backorder" : "Programação de Corretivas";

  setWorkbookMetadata(workbook, title, generatedAt);

  // A primeira aba já segue o mesmo padrão visual das abas de equipe.
  buildOperationsSheet(
    workbook,
    "Programação Geral",
    openItems,
    equipeFiltro || "Todas as equipes",
    generatedAt,
    C.navySoft,
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
    );
  });

  workbook.worksheets.forEach((sheet) => {
    sheet.pageSetup.blackAndWhite = false;
  });

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

  return {
    exported: openItems.length,
    excludedCompleted: osList.length - openItems.length,
  };
}
