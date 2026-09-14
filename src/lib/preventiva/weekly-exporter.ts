// Gerador e impressão da Programação Semanal com o layout do TEMPLATE_GRUPO_GPS.

import type { WeekBucket, WeekInfo } from "./capacity";
import type { DailyTeamLoad } from "./monthly-scheduler";
import { isCorrective, formatMinutes } from "./monthly-scheduler";
import {
  EQUIPE_COLOR,
  EQUIPES_ORDEM,
  type Equipe,
  type TriagedOS,
} from "./triage";
import { lookupAtivoEntry, type AtivoIndexEntry } from "./reader";

export const APTOS_EXTRABOLD = "Aptos ExtraBold";
export const APTOS_SEMIBOLD = "Aptos SemiBold";
const APTOS_BODY = "Aptos";
const argbFromHex = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

const PALETTE = {
  navy: argbFromHex("#0B1F33"),
  navySoft: argbFromHex("#17324D"),
  teal: argbFromHex("#0F6B78"),
  gold: argbFromHex("#C99A3D"),
  white: "FFFFFFFF",
  text: argbFromHex("#162231"),
  border: argbFromHex("#DDE5EC"),
  borderStrong: argbFromHex("#B9C7D3"),
  stripe: argbFromHex("#F7FAFC"),
  successBg: argbFromHex("#DFF4EB"),
  successText: argbFromHex("#087A5B"),
  warningBg: argbFromHex("#FFF4D6"),
  warningText: argbFromHex("#8B5D00"),
  dangerBg: argbFromHex("#FFE8E8"),
  dangerText: argbFromHex("#C62828"),
};

// Mesmas dez colunas, larguras e ordem do arquivo fornecido pelo usuário.
const COLUMNS = [
  { key: "os", label: "OS", width: 16 },
  { key: "nome", label: "Nome", width: 56.7109375 },
  { key: "predio", label: "Prédio", width: 16 },
  { key: "andar", label: "Andar", width: 14 },
  { key: "espaco", label: "Espaço", width: 34 },
  { key: "atividade", label: "Atividade", width: 18 },
  { key: "sla", label: "Término SLA", width: 18 },
  { key: "equipe", label: "Equipe", width: 32 },
  { key: "ativo", label: "Ativo", width: 36 },
  { key: "equipamento", label: "Equipamento", width: 68.140625 },
] as const;

const DAY_NAMES = [
  "SEGUNDA-FEIRA",
  "TERÇA-FEIRA",
  "QUARTA-FEIRA",
  "QUINTA-FEIRA",
  "SEXTA-FEIRA",
];
const DAY_SHORT = ["SEG", "TER", "QUA", "QUI", "SEX"];
const formatDate = (date: Date) => date.toLocaleDateString("pt-BR");

function formatSLA(value: string): string {
  if (!value) return "";
  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatDate(date);
}

function mixWithWhite(hex: string, whiteWeight = 0.88): string {
  const clean = hex.replace("#", "");
  const rgb = [0, 2, 4].map((index) =>
    Number.parseInt(clean.slice(index, index + 2), 16),
  );
  const mixed = rgb.map((value) =>
    Math.round(value * (1 - whiteWeight) + 255 * whiteWeight),
  );
  return `FF${mixed
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function readableTextColor(hex: string): string {
  const clean = hex.replace("#", "");
  const red = Number.parseInt(clean.slice(0, 2), 16) / 255;
  const green = Number.parseInt(clean.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(clean.slice(4, 6), 16) / 255;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue < 0.56
    ? PALETTE.white
    : PALETTE.text;
}

function dayDate(week: WeekInfo, dayIndex: number): Date {
  const date = new Date(week.monday);
  date.setDate(date.getDate() + dayIndex);
  return date;
}

function taskValues(os: TriagedOS, ativoIndex: Map<string, AtivoIndexEntry>) {
  const isRefrigeracao = os.equipe.startsWith("CLIMAT");
  const entry = isRefrigeracao
    ? lookupAtivoEntry(ativoIndex, os.predio, os.andar, os.local)
    : undefined;
  return {
    os: os.os,
    nome: os.nomeOS,
    predio: os.predio,
    andar: os.andar,
    espaco: os.local,
    atividade: isCorrective(os) ? "Corretiva" : "Preventiva",
    sla: formatSLA(os.terminoSLA),
    equipe: os.equipe,
    ativo: isRefrigeracao
      ? entry?.ativo || os.ativo || "Ativo não localizado"
      : os.ativo || "",
    // Regra solicitada: J só recebe equipamento para Refrigeração.
    equipamento: isRefrigeracao
      ? os.equipamento || entry?.equipamento || ""
      : "",
  };
}

function naturalText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function compareNatural(a: unknown, b: unknown): number {
  return naturalText(a).localeCompare(naturalText(b), "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

/**
 * Normaliza textos de localização sem depender da grafia usada na planilha.
 * Ex.: "1º Sub-Solo", "1º Sub Solo" e "1º Subsolo" passam a ser reconhecidos
 * como o mesmo tipo de andar para fins de ordenação.
 */
function canonicalLocationText(value: unknown): string {
  return naturalText(value)
    .toUpperCase()
    .replace(/[º°ª]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildingSortKey(value: unknown): [number, number, string] {
  const normalized = canonicalLocationText(value).replace(
    /^(?:PREDIO|BLOCO|EDIFICIO)\s+/,
    "",
  );
  // Prédios sem identificação nunca devem aparecer antes dos prédios válidos.
  if (!normalized) return [2, 0, ""];
  // Identificações iniciadas por letra (A, B, C...) têm precedência sobre
  // códigos puramente numéricos/outros, preservando comparação natural.
  return [/^[A-Z]/.test(normalized) ? 0 : 1, 0, normalized];
}

function compareBuildings(a: unknown, b: unknown): number {
  const left = buildingSortKey(a);
  const right = buildingSortKey(b);
  return (
    left[0] - right[0] ||
    left[1] - right[1] ||
    compareNatural(left[2], right[2])
  );
}

function floorSortKey(value: unknown): [number, number, string] {
  const normalized = canonicalLocationText(value);
  if (!normalized) return [9, 0, ""];

  const basement =
    normalized.match(/(?:^| )(\d+) SUB ?SOLO(?: |$)/) ??
    normalized.match(/(?:^| )SUB ?SOLO (\d+)(?: |$)/) ??
    normalized.match(/^S(?:S)? ?(\d+)$/);
  if (basement) return [0, Number(basement[1]), normalized];
  if (/^(?:SUB ?SOLO|SS|S)$/.test(normalized)) return [0, 1, normalized];
  if (/\bTERREO\b/.test(normalized)) return [1, 0, normalized];
  if (/\bMEZANINO\b/.test(normalized)) return [2, 0, normalized];

  const floor =
    normalized.match(/(?:^| )(\d+) (?:ANDAR|PAVIMENTO|PAV|PISO)(?: |$)/) ??
    normalized.match(/^(\d+)$/);
  if (floor) return [3, Number(floor[1]), normalized];
  if (/\bCOBERTURA\b/.test(normalized)) return [7, 0, normalized];
  return [8, 0, normalized];
}

function compareFloors(a: unknown, b: unknown): number {
  const left = floorSortKey(a);
  const right = floorSortKey(b);
  return (
    left[0] - right[0] ||
    left[1] - right[1] ||
    compareNatural(left[2], right[2])
  );
}

function sortDayItems(items: TriagedOS[]): TriagedOS[] {
  return [...items].sort((a, b) => {
    const buildingOrder = compareBuildings(a.predio, b.predio);
    if (buildingOrder !== 0) return buildingOrder;
    const floorOrder = compareFloors(a.andar, b.andar);
    if (floorOrder !== 0) return floorOrder;
    const localOrder = compareNatural(a.local, b.local);
    if (localOrder !== 0) return localOrder;
    const osOrder = compareNatural(a.os, b.os);
    if (osOrder !== 0) return osOrder;
    const teamOrder =
      EQUIPES_ORDEM.indexOf(a.equipe) - EQUIPES_ORDEM.indexOf(b.equipe);
    if (teamOrder !== 0) return teamOrder;
    return Number(isCorrective(b)) - Number(isCorrective(a));
  });
}

export interface WeeklyExportInput {
  titulo: string;
  week: WeekInfo;
  bucketsPorEquipe: Map<Equipe, WeekBucket>;
  ativoIndex: Map<string, AtivoIndexEntry>;
  cargasPorEquipe?: Map<Equipe, DailyTeamLoad[]>;
  minutosPorEquipe?: Partial<Record<Equipe, 30 | 60>>;
}

function styleProgramSheet(
  ws: import("exceljs").Worksheet,
  input: WeeklyExportInput,
) {
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 3, showGridLines: false }];
  ws.columns = COLUMNS.map((column) => ({
    key: column.key,
    width: column.width,
  }));
  ws.properties.defaultRowHeight = 30;
  ws.mergeCells("A1:J1");
  const title = ws.getCell("A1");
  title.value = `PROGRAMAÇÃO SEMANAL • ${input.week.label.toUpperCase()} • ${formatDate(input.week.monday)} A ${formatDate(input.week.friday)}`;
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: PALETTE.navy },
  };
  title.font = {
    name: APTOS_EXTRABOLD,
    bold: true,
    size: 22,
    color: { argb: PALETTE.white },
  };
  title.alignment = { vertical: "middle", horizontal: "center" };
  title.border = { bottom: { style: "medium", color: { argb: PALETTE.gold } } };
  ws.getRow(1).height = 42;

  const activeTeams = EQUIPES_ORDEM.filter(
    (equipe) =>
      Boolean(input.bucketsPorEquipe.get(equipe)) ||
      Boolean(input.cargasPorEquipe?.get(equipe)?.length),
  );
  const hasLoads = activeTeams.some((equipe) =>
    Boolean(input.cargasPorEquipe?.get(equipe)?.length),
  );
  let rowIndex = 2;
  let firstHeaderRow = 0;

  for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
    const dayLoads = activeTeams
      .flatMap((equipe) => input.cargasPorEquipe?.get(equipe) ?? [])
      .filter((load) => load.dayIndex === dayIndex);
    if (hasLoads && dayLoads.length === 0) continue;

    const date = dayLoads[0]?.date ?? dayDate(input.week, dayIndex);
    const items = sortDayItems(
      activeTeams.flatMap(
        (equipe) => input.bucketsPorEquipe.get(equipe)?.porDia[dayIndex] ?? [],
      ),
    );
    const correctiveCount = items.filter(isCorrective).length;

    ws.mergeCells(rowIndex, 1, rowIndex, 10);
    const dayCell = ws.getCell(rowIndex, 1);
    dayCell.value = `${DAY_NAMES[dayIndex]} • ${formatDate(date)} • ${items.length} OS (${correctiveCount} CORRETIVAS)`;
    dayCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: PALETTE.teal },
    };
    dayCell.font = {
      name: APTOS_EXTRABOLD,
      bold: true,
      size: 11,
      color: { argb: PALETTE.white },
    };
    dayCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    dayCell.border = {
      top: { style: "medium", color: { argb: PALETTE.gold } },
      bottom: { style: "thin", color: { argb: PALETTE.borderStrong } },
    };
    ws.getRow(rowIndex).height = 24;
    rowIndex += 1;

    const header = ws.getRow(rowIndex);
    if (!firstHeaderRow) firstHeaderRow = rowIndex;
    COLUMNS.forEach((column, index) => {
      const cell = header.getCell(index + 1);
      cell.value = column.label;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: PALETTE.navySoft },
      };
      cell.font = {
        name: APTOS_EXTRABOLD,
        bold: true,
        size: 9,
        color: { argb: PALETTE.white },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      };
      cell.border = {
        top: { style: "thin", color: { argb: PALETTE.borderStrong } },
        bottom: { style: "thin", color: { argb: PALETTE.borderStrong } },
        left: { style: "thin", color: { argb: PALETTE.borderStrong } },
        right: { style: "thin", color: { argb: PALETTE.borderStrong } },
      };
    });
    header.height = 30;
    rowIndex += 1;

    if (items.length === 0) {
      ws.mergeCells(rowIndex, 1, rowIndex, 10);
      const empty = ws.getCell(rowIndex, 1);
      empty.value = "Nenhuma OS programada para este dia.";
      empty.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: PALETTE.stripe },
      };
      empty.font = {
        name: APTOS_SEMIBOLD,
        size: 10,
        color: { argb: PALETTE.text },
      };
      empty.alignment = { vertical: "middle", horizontal: "center" };
      ws.getRow(rowIndex).height = 34;
      rowIndex += 1;
      continue;
    }

    items.forEach((os, index) => {
      const row = ws.getRow(rowIndex++);
      const values = taskValues(os, input.ativoIndex);
      const teamHex = EQUIPE_COLOR[os.equipe];
      const teamArgb = argbFromHex(teamHex);
      COLUMNS.forEach((column, columnIndex) => {
        const cell = row.getCell(columnIndex + 1);
        const value = values[column.key];
        cell.value = value === "" ? null : value;
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: index % 2 ? PALETTE.stripe : PALETTE.white },
        };
        const size = [
          "nome",
          "predio",
          "andar",
          "espaco",
          "equipamento",
        ].includes(column.key)
          ? 16
          : column.key === "atividade"
            ? 11
            : column.key === "sla"
              ? 10
              : column.key === "equipe"
                ? 9
                : 12;
        cell.font = {
          name: ["atividade", "sla"].includes(column.key)
            ? APTOS_BODY
            : APTOS_EXTRABOLD,
          bold: !["atividade", "sla"].includes(column.key),
          size,
          color: { argb: PALETTE.text },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: [
            "nome",
            "espaco",
            "equipe",
            "ativo",
            "equipamento",
          ].includes(column.key)
            ? "left"
            : "center",
          wrapText: true,
        };
        cell.border = {
          top: { style: "thin", color: { argb: PALETTE.border } },
          bottom: { style: "thin", color: { argb: PALETTE.border } },
          left: { style: "thin", color: { argb: PALETTE.border } },
          right: { style: "thin", color: { argb: PALETTE.border } },
        };
        if (column.key === "os") {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: teamArgb },
          };
          cell.font = {
            name: APTOS_EXTRABOLD,
            bold: true,
            size: 11,
            color: { argb: readableTextColor(teamHex) },
          };
        } else if (column.key === "equipe") {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: mixWithWhite(teamHex) },
          };
          cell.font = {
            name: APTOS_EXTRABOLD,
            bold: true,
            size: 9,
            color: { argb: teamArgb },
          };
        } else if (column.key === "atividade" && isCorrective(os)) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: PALETTE.warningBg },
          };
          cell.font = {
            name: APTOS_SEMIBOLD,
            bold: true,
            size: 11,
            color: { argb: PALETTE.warningText },
          };
        } else if (
          column.key === "ativo" &&
          values.ativo === "Ativo não localizado"
        ) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: PALETTE.dangerBg },
          };
          cell.font = {
            name: APTOS_SEMIBOLD,
            bold: true,
            size: 10,
            color: { argb: PALETTE.dangerText },
          };
        }
      });
      row.height = 45;
    });
  }

  if (firstHeaderRow) ws.autoFilter = `A${firstHeaderRow}:J${firstHeaderRow}`;
  const lastRow = Math.max(1, rowIndex - 1);
  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.45,
      bottom: 0.45,
      header: 0.2,
      footer: 0.2,
    },
    printTitlesRow: "1:1",
    printArea: `A1:J${lastRow}`,
  };
  ws.headerFooter.oddFooter = `&L${input.titulo}&C${input.week.label}&R&P / &N`;
}

function addSummarySheet(
  workbook: import("exceljs").Workbook,
  input: WeeklyExportInput,
  totalOS: number,
  activeTeams: Equipe[],
) {
  const summary = workbook.addWorksheet("RESUMO", {
    views: [{ showGridLines: false }],
  });
  summary.columns = [24, 14, 14, 14, 14, 14, 14, 14, 16, 30].map((width) => ({
    width,
  }));
  summary.mergeCells("A1:J1");
  const title = summary.getCell("A1");
  title.value = "RESUMO EXECUTIVO · CONTROLE DE 09:00";
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: PALETTE.navy },
  };
  title.font = {
    name: APTOS_EXTRABOLD,
    bold: true,
    size: 20,
    color: { argb: PALETTE.white },
  };
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  title.border = { bottom: { style: "medium", color: { argb: PALETTE.gold } } };
  summary.getRow(1).height = 40;
  summary.mergeCells("A2:J2");
  const meta = summary.getCell("A2");
  meta.value = `${input.titulo} • ${input.week.label} • ${formatDate(input.week.monday)} a ${formatDate(input.week.friday)} • ${totalOS} OS`;
  meta.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: PALETTE.navySoft },
  };
  meta.font = {
    name: APTOS_SEMIBOLD,
    bold: true,
    size: 9.5,
    color: { argb: PALETTE.white },
  };
  meta.alignment = { vertical: "middle", horizontal: "left", indent: 2 };
  summary.getRow(2).height = 24;

  const headers = [
    "Equipe",
    "Dia",
    "Preventivas",
    "Corretivas",
    "Tempo/OS",
    "Programado",
    "Falta apontar",
    "Meta",
    "Status",
    "Observação",
  ];
  const headerRow = summary.getRow(4);
  headers.forEach((label, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = label;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: PALETTE.teal },
    };
    cell.font = {
      name: APTOS_EXTRABOLD,
      bold: true,
      size: 9,
      color: { argb: PALETTE.white },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin", color: { argb: PALETTE.borderStrong } },
      bottom: { style: "thin", color: { argb: PALETTE.borderStrong } },
      left: { style: "thin", color: { argb: PALETTE.borderStrong } },
      right: { style: "thin", color: { argb: PALETTE.borderStrong } },
    };
  });
  headerRow.height = 32;

  let rowIndex = 5;
  for (const equipe of activeTeams) {
    const teamHex = EQUIPE_COLOR[equipe];
    const loads = [...(input.cargasPorEquipe?.get(equipe) ?? [])].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
    for (const load of loads) {
      const row = summary.getRow(rowIndex++);
      const minutes = input.minutosPorEquipe?.[equipe] ?? 60;
      const notes: string[] = [];
      if (load.correctiveDeficit > 0)
        notes.push(
          `Faltam ${load.correctiveDeficit} corretiva(s) para a meta mínima`,
        );
      if (load.remainingMinutes > 0)
        notes.push(`Apontar mais ${formatMinutes(load.remainingMinutes)}`);
      const values = [
        equipe,
        DAY_SHORT[load.dayIndex],
        load.preventiveCount,
        load.correctiveCount,
        formatMinutes(minutes),
        formatMinutes(load.scheduledMinutes),
        formatMinutes(load.remainingMinutes),
        formatMinutes(load.targetMinutes),
        load.remainingMinutes === 0 ? "09:00 FECHADAS" : "COMPLEMENTAR",
        notes.join(" • ") || "Carga diária completa",
      ];
      values.forEach((value, index) => {
        const cell = row.getCell(index + 1);
        cell.value = value;
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {
            argb:
              index === 0
                ? mixWithWhite(teamHex)
                : load.remainingMinutes === 0
                  ? PALETTE.successBg
                  : PALETTE.warningBg,
          },
        };
        cell.font = {
          name: index === 0 ? APTOS_EXTRABOLD : APTOS_SEMIBOLD,
          bold: true,
          size: index === 9 ? 8.5 : 9,
          color: {
            argb:
              index === 0
                ? argbFromHex(teamHex)
                : load.remainingMinutes === 0
                  ? PALETTE.successText
                  : PALETTE.warningText,
          },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: index === 0 || index === 9 ? "left" : "center",
          wrapText: true,
        };
        cell.border = {
          top: { style: "thin", color: { argb: PALETTE.border } },
          bottom: { style: "thin", color: { argb: PALETTE.border } },
          left: { style: "thin", color: { argb: PALETTE.border } },
          right: { style: "thin", color: { argb: PALETTE.border } },
        };
      });
      row.height = 30;
    }
  }
  if (rowIndex === 5) {
    summary.mergeCells("A5:J5");
    summary.getCell("A5").value = "Nenhuma equipe programada nesta semana.";
    summary.getCell("A5").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
  }
  summary.autoFilter = `A4:J${Math.max(5, rowIndex - 1)}`;
  summary.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.45,
      bottom: 0.45,
      header: 0.2,
      footer: 0.2,
    },
    printTitlesRow: "1:4",
    printArea: `A1:J${Math.max(5, rowIndex - 1)}`,
  };
}

/**
 * Aba compacta para apontamento antecipado. O SLA é usado somente aqui como
 * referência de consulta e não participa da ordem da programação principal.
 */
function addSlaReferenceSheet(
  workbook: import("exceljs").Workbook,
  input: WeeklyExportInput,
  activeTeams: Equipe[],
) {
  const sheet = workbook.addWorksheet("SLA APONTAMENTO", {
    views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
  });
  sheet.columns = [{ width: 20 }, { width: 20 }, { width: 38 }];
  sheet.mergeCells("A1:C1");
  const title = sheet.getCell("A1");
  title.value = "APONTAMENTO ANTECIPADO · REFERÊNCIA DE SLA";
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: PALETTE.navy },
  };
  title.font = {
    name: APTOS_EXTRABOLD,
    bold: true,
    size: 15,
    color: { argb: PALETTE.white },
  };
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(1).height = 32;

  sheet.mergeCells("A2:C2");
  const note = sheet.getCell("A2");
  note.value =
    "Consulta rápida de OS, Término SLA e Equipe. Esta lista não altera a ordem alfabética da Programação.";
  note.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: PALETTE.warningBg },
  };
  note.font = {
    name: APTOS_SEMIBOLD,
    bold: true,
    size: 9,
    color: { argb: PALETTE.warningText },
  };
  note.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  sheet.getRow(2).height = 28;

  const headers = ["OS", "Término SLA", "Equipe"];
  const header = sheet.getRow(4);
  headers.forEach((label, index) => {
    const cell = header.getCell(index + 1);
    cell.value = label;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: PALETTE.teal },
    };
    cell.font = {
      name: APTOS_EXTRABOLD,
      bold: true,
      size: 9,
      color: { argb: PALETTE.white },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: PALETTE.borderStrong } },
      bottom: { style: "thin", color: { argb: PALETTE.borderStrong } },
      left: { style: "thin", color: { argb: PALETTE.borderStrong } },
      right: { style: "thin", color: { argb: PALETTE.borderStrong } },
    };
  });
  header.height = 25;

  const unique = new Map<string, TriagedOS>();
  activeTeams.forEach((equipe) => {
    (input.bucketsPorEquipe.get(equipe)?.os ?? []).forEach((item) => {
      const key = `${item.equipe}|${item.os}`;
      if (!unique.has(key)) unique.set(key, item);
    });
  });

  const items = [...unique.values()]
    .filter((item) => Boolean(item.os) && Boolean(item.terminoSLA))
    .sort((a, b) => {
      const slaA = Number.isFinite(a.terminoSLATs)
        ? a.terminoSLATs
        : Number.MAX_SAFE_INTEGER;
      const slaB = Number.isFinite(b.terminoSLATs)
        ? b.terminoSLATs
        : Number.MAX_SAFE_INTEGER;
      return (
        slaA - slaB ||
        compareNatural(a.equipe, b.equipe) ||
        compareNatural(a.os, b.os)
      );
    });

  if (items.length === 0) {
    sheet.mergeCells("A5:C5");
    const empty = sheet.getCell("A5");
    empty.value = "Nenhuma OS da semana possui Término SLA informado.";
    empty.alignment = { vertical: "middle", horizontal: "center" };
    empty.font = { name: APTOS_SEMIBOLD, size: 9, color: { argb: PALETTE.text } };
    sheet.getRow(5).height = 24;
  } else {
    items.forEach((item, index) => {
      const row = sheet.getRow(index + 5);
      const teamHex = EQUIPE_COLOR[item.equipe];
      const values = [item.os, formatSLA(item.terminoSLA), item.equipe];
      values.forEach((value, columnIndex) => {
        const cell = row.getCell(columnIndex + 1);
        cell.value = value;
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {
            argb:
              columnIndex === 2
                ? mixWithWhite(teamHex)
                : index % 2
                  ? PALETTE.stripe
                  : PALETTE.white,
          },
        };
        cell.font = {
          name: APTOS_SEMIBOLD,
          bold: columnIndex !== 1,
          size: 9,
          color: {
            argb: columnIndex === 2 ? argbFromHex(teamHex) : PALETTE.text,
          },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: columnIndex === 2 ? "left" : "center",
          wrapText: true,
        };
        cell.border = {
          top: { style: "thin", color: { argb: PALETTE.border } },
          bottom: { style: "thin", color: { argb: PALETTE.border } },
          left: { style: "thin", color: { argb: PALETTE.border } },
          right: { style: "thin", color: { argb: PALETTE.border } },
        };
      });
      row.height = 23;
    });
  }

  sheet.autoFilter = `A4:C${Math.max(5, items.length + 4)}`;
  sheet.pageSetup = {
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: {
      left: 0.3,
      right: 0.3,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2,
    },
    printTitlesRow: "1:4",
    printArea: `A1:C${Math.max(5, items.length + 4)}`,
  };
}

export async function generateWeeklyProgramacao(
  input: WeeklyExportInput,
): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const generatedAt = new Date();
  workbook.creator = "Apont Auto";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  const activeTeams = EQUIPES_ORDEM.filter(
    (equipe) =>
      Boolean(input.bucketsPorEquipe.get(equipe)?.os.length) ||
      Boolean(input.cargasPorEquipe?.get(equipe)?.length),
  );
  const totalOS = activeTeams.reduce(
    (total, equipe) =>
      total + (input.bucketsPorEquipe.get(equipe)?.os.length ?? 0),
    0,
  );
  styleProgramSheet(
    workbook.addWorksheet("PROGRAMAÇÃO", {
      views: [{ state: "frozen", xSplit: 2, ySplit: 3, showGridLines: false }],
    }),
    input,
  );
  addSummarySheet(workbook, input, totalOS, activeTeams);
  addSlaReferenceSheet(workbook, input, activeTeams);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function excelColor(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object" || !("argb" in value))
    return fallback;
  const argb = String((value as { argb?: string }).argb ?? "");
  return argb.length >= 6 ? `#${argb.slice(-6)}` : fallback;
}

function renderPrintRow(
  row: import("exceljs").Row,
  className: string,
  mergedBand = false,
  firstCellOverride?: string,
): string {
  const cells: string[] = [];
  for (let column = 1; column <= 10; column += 1) {
    const cell = row.getCell(column);
    if (mergedBand && column > 1) continue;
    const fill =
      cell.fill && "fgColor" in cell.fill ? cell.fill.fgColor : undefined;
    const background = excelColor(fill, "#FFFFFF");
    const color = excelColor(cell.font?.color, "#162231");
    const align =
      cell.alignment?.horizontal ??
      (column === 2 || column >= 8 ? "left" : "center");
    const value =
      column === 1 && firstCellOverride !== undefined
        ? firstCellOverride
        : typeof cell.value === "object" && cell.value && "text" in cell.value
          ? cell.value.text
          : cell.text;
    cells.push(
      `<td${mergedBand && column === 1 ? " colspan='10'" : ""} style="background-color:${background};color:${color};text-align:${align};font-weight:${cell.font?.bold ? 800 : 500}">${escapeHtml(value)}</td>`,
    );
  }
  return `<tr class="${className}">${cells.join("")}</tr>`;
}

/** Gera a impressão semanal agrupada por equipe e, dentro dela, por dia. */
export async function buildWeeklyPrintHtml(blob: Blob): Promise<string> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  const sections: string[] = [];

  workbook.worksheets
    .filter((worksheet) => worksheet.name === "PROGRAMAÇÃO")
    .forEach((worksheet) => {
      const titleRow = worksheet.getRow(1);
      const days: Array<{
        band: import("exceljs").Row;
        header: import("exceljs").Row;
        rows: import("exceljs").Row[];
      }> = [];
      let dayBand: import("exceljs").Row | undefined;
      let columnHeader: import("exceljs").Row | undefined;
      let dataRows: import("exceljs").Row[] = [];

      const flushDay = () => {
        if (!dayBand || !columnHeader) return;
        days.push({ band: dayBand, header: columnHeader, rows: dataRows });
      };

      worksheet.eachRow({ includeEmpty: false }, (row) => {
        if (row.number === 1) return;
        const firstCellText = row.getCell(1).text;
        const isDayBand = DAY_NAMES.some((name) =>
          firstCellText.startsWith(name),
        );
        if (isDayBand) {
          flushDay();
          dayBand = row;
          columnHeader = undefined;
          dataRows = [];
          return;
        }
        if (!dayBand) return;
        if (!columnHeader) columnHeader = row;
        else dataRows.push(row);
      });
      flushDay();

      const discoveredTeams = new Set(
        days.flatMap((day) =>
          day.rows.map((row) => row.getCell(8).text.trim()).filter(Boolean),
        ),
      );
      const teams = [
        ...EQUIPES_ORDEM.filter((team) => discoveredTeams.has(team)),
        ...[...discoveredTeams]
          .filter((team) => !EQUIPES_ORDEM.includes(team as Equipe))
          .sort(compareNatural),
      ];

      teams.forEach((team) => {
        let teamPage = 0;
        days.forEach((day) => {
          const teamRows = day.rows.filter(
            (row) => row.getCell(8).text.trim() === team,
          );
          if (teamRows.length === 0) return;
          const correctiveCount = teamRows.filter(
            (row) =>
              naturalText(row.getCell(6).text).toUpperCase() === "CORRETIVA",
          ).length;
          const dayParts = day.band.getCell(1).text.split(" • ");
          const dayLabel = dayParts.slice(0, 2).join(" • ");
          const titleLabel = `${titleRow.getCell(1).text} • EQUIPE ${team}`;
          const bandLabel = `${dayLabel} • ${teamRows.length} OS (${correctiveCount} CORRETIVAS) • ${team}`;
          sections.push(`<section class="day-sheet team-sheet${teamPage === 0 ? " team-start" : ""}" data-team="${escapeHtml(team)}"><table>
            <thead>${renderPrintRow(titleRow, "title-row", true, titleLabel)}${renderPrintRow(day.band, "day-band", true, bandLabel)}${renderPrintRow(day.header, "column-header")}</thead>
            <tbody>${teamRows
              .map((row) => renderPrintRow(row, "data-row"))
              .join("")}</tbody>
          </table></section>`);
          teamPage += 1;
        });
      });
    });

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Programação semanal</title><style>
    @page { size: A4 landscape; margin: 5.5mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    html, body { margin: 0; background: #FFFFFF; font-family: Aptos, Arial, sans-serif; color: #162231; }
    .day-sheet { break-before: auto; break-after: auto; page-break-before: auto; page-break-after: auto; break-inside: auto; page-break-inside: auto; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; break-inside: auto; page-break-inside: auto; }
    thead { display: table-header-group; }
    tbody { display: table-row-group; break-inside: auto; page-break-inside: auto; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    td { border: 1px solid #DDE5EC; padding: 3.5px 4.5px; font-size: 7.3pt; line-height: 1.2; overflow-wrap: anywhere; vertical-align: middle; }
    .title-row td { height: auto; padding: 5px; font-size: 12.5pt; }
    .day-band td { height: auto; padding: 4px; font-size: 8.5pt; }
    .column-header td { height: auto; padding: 4px; font-size: 7.2pt; }
    .data-row td { height: auto; }
    .title-row, .day-band, .column-header { break-after: avoid; page-break-after: avoid; }
    td:nth-child(1){width:6%} td:nth-child(2){width:18%} td:nth-child(3){width:7%} td:nth-child(4){width:6%}
    td:nth-child(5){width:12%} td:nth-child(6){width:7%} td:nth-child(7){width:7%} td:nth-child(8){width:11%}
    td:nth-child(9){width:11%} td:nth-child(10){width:15%}
    @media print {
      html, body, .day-sheet, table, thead, tbody, tr, td { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      .day-sheet, .day-sheet + .day-sheet, .team-start { break-before: auto; page-break-before: auto; break-after: auto; page-break-after: auto; }
    }
  </style></head><body>${sections.join("")}</body></html>`;
}

/** Imprime a semana em um clique, com todas as páginas de cada equipe juntas. */
export async function printWeeklyProgramacao(blob: Blob): Promise<void> {
  const printWindow = window.open("", "_blank");
  if (!printWindow)
    throw new Error("O navegador bloqueou a janela de impressão.");
  printWindow.opener = null;
  printWindow.document.write(
    "<p style='font-family:Arial;padding:24px'>Preparando impressão...</p>",
  );
  try {
    const html = await buildWeeklyPrintHtml(blob);
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    await printWindow.document.fonts?.ready;
    printWindow.focus();
    printWindow.setTimeout(() => printWindow.print(), 250);
  } catch (error) {
    printWindow.close();
    throw error;
  }
}

export function extractByEquipe(all: TriagedOS[], equipe: Equipe): TriagedOS[] {
  return all.filter((item) => item.equipe === equipe);
}
