// Gerador de Excel — Programação Semanal premium.

import type { WeekBucket, WeekInfo } from "./capacity";
import { EQUIPE_COLOR, EQUIPES_ORDEM, type Equipe, type TriagedOS } from "./triage";
import { lookupAtivoEntry, type AtivoIndexEntry } from "./reader";

export const APTOS_EXTRABOLD = "Aptos ExtraBold";
export const APTOS_SEMIBOLD = "Aptos SemiBold";
const APTOS_BODY = "Aptos";

const argbFromHex = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();

const PALETTE = {
  navy: argbFromHex("#0B1F33"),
  navySoft: argbFromHex("#17324D"),
  teal: argbFromHex("#0F6B78"),
  cyan: argbFromHex("#16A6C9"),
  gold: argbFromHex("#C99A3D"),
  white: "FFFFFFFF",
  text: argbFromHex("#162231"),
  border: argbFromHex("#DDE5EC"),
  borderStrong: argbFromHex("#B9C7D3"),
  stripe: argbFromHex("#F7FAFC"),
  dayEmpty: argbFromHex("#F1F5F8"),
  successBg: argbFromHex("#DFF4EB"),
  successText: argbFromHex("#087A5B"),
  dangerBg: argbFromHex("#FFE8E8"),
  dangerText: argbFromHex("#C62828"),
};

const COLUMNS = [
  { key: "os", label: "OS", width: 16 },
  { key: "nome", label: "Nome", width: 38 },
  { key: "predio", label: "Prédio", width: 16 },
  { key: "andar", label: "Andar", width: 14 },
  { key: "espaco", label: "Espaço", width: 34 },
  { key: "atividade", label: "Atividade", width: 18 },
  { key: "sla", label: "Término SLA", width: 18 },
  { key: "equipe", label: "Equipe", width: 32 },
  { key: "ativo", label: "Ativo", width: 36 },
  { key: "outros", label: "Outros", width: 18 },
  { key: "seg", label: "SEGUNDA", width: 11, day: 0 },
  { key: "ter", label: "TERÇA", width: 11, day: 1 },
  { key: "qua", label: "QUARTA", width: 11, day: 2 },
  { key: "qui", label: "QUINTA", width: 11, day: 3 },
  { key: "sex", label: "SEXTA", width: 11, day: 4 },
];

const DAY_LABELS = ["SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA"];

function formatSLA(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

function formatDate(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR");
}

function mixWithWhite(hex: string, whiteWeight = 0.88): string {
  const clean = hex.replace("#", "");
  const red = Number.parseInt(clean.slice(0, 2), 16);
  const green = Number.parseInt(clean.slice(2, 4), 16);
  const blue = Number.parseInt(clean.slice(4, 6), 16);
  const mix = (value: number) => Math.round(value * (1 - whiteWeight) + 255 * whiteWeight);
  const toHex = (value: number) => value.toString(16).padStart(2, "0").toUpperCase();
  return `FF${toHex(mix(red))}${toHex(mix(green))}${toHex(mix(blue))}`;
}

function readableTextColor(hex: string): string {
  const clean = hex.replace("#", "");
  const red = Number.parseInt(clean.slice(0, 2), 16) / 255;
  const green = Number.parseInt(clean.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(clean.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance < 0.56 ? PALETTE.white : PALETTE.text;
}

export interface WeeklyExportInput {
  titulo: string;
  week: WeekInfo;
  bucketsPorEquipe: Map<Equipe, WeekBucket>;
  ativoIndex: Map<string, AtivoIndexEntry>;
  atividadePadrao?: "Preventiva" | "Corretiva";
}

export async function generateWeeklyProgramacao(input: WeeklyExportInput): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const generatedAt = new Date();

  wb.creator = "Apont Auto";
  wb.created = generatedAt;
  wb.modified = generatedAt;

  const activeTeams = EQUIPES_ORDEM.filter((equipe) => {
    const bucket = input.bucketsPorEquipe.get(equipe);
    return Boolean(bucket?.os.length);
  });
  const totalOS = activeTeams.reduce(
    (total, equipe) => total + (input.bucketsPorEquipe.get(equipe)?.os.length ?? 0),
    0,
  );
  const dayTotals = Array.from({ length: 5 }, () => 0);
  activeTeams.forEach((equipe) => {
    const bucket = input.bucketsPorEquipe.get(equipe);
    bucket?.porDia.forEach((items, day) => {
      dayTotals[day] += items.length;
    });
  });

  const ws = wb.addWorksheet("PROGRAMAÇÃO", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 4, showGridLines: false }],
  });

  ws.columns = COLUMNS.map((column) => ({ key: column.key, width: column.width }));
  ws.properties.defaultRowHeight = 30;

  const totalCols = COLUMNS.length;

  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = "PROGRAMAÇÃO SEMANAL DE MANUTENÇÃO";
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.navy } };
  titleCell.font = {
    name: APTOS_EXTRABOLD,
    bold: true,
    size: 22,
    color: { argb: PALETTE.white },
  };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  titleCell.border = {
    bottom: { style: "medium", color: { argb: PALETTE.gold } },
  };
  ws.getRow(1).height = 42;

  ws.mergeCells(2, 1, 2, totalCols);
  const metaCell = ws.getCell(2, 1);
  metaCell.value =
    `${input.titulo}  •  ${input.week.label}  •  ` +
    `${formatDate(input.week.monday)} a ${formatDate(input.week.friday)}  •  ${totalOS} OS`;
  metaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.navySoft } };
  metaCell.font = {
    name: APTOS_SEMIBOLD,
    bold: true,
    size: 10,
    color: { argb: argbFromHex("#DCE8F2") },
  };
  metaCell.alignment = { vertical: "middle", horizontal: "left", indent: 2 };
  ws.getRow(2).height = 24;

  ws.mergeCells(3, 1, 3, 10);
  const identityCell = ws.getCell(3, 1);
  identityCell.value = "IDENTIFICAÇÃO & PLANEJAMENTO";
  identityCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.teal } };
  identityCell.font = {
    name: APTOS_EXTRABOLD,
    bold: true,
    size: 10,
    color: { argb: PALETTE.white },
  };
  identityCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  ws.mergeCells(3, 11, 3, 15);
  const weeklyCell = ws.getCell(3, 11);
  weeklyCell.value = "DISTRIBUIÇÃO SEMANAL";
  weeklyCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.cyan } };
  weeklyCell.font = {
    name: APTOS_EXTRABOLD,
    bold: true,
    size: 10,
    color: { argb: PALETTE.white },
  };
  weeklyCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(3).height = 24;

  const headerRow = ws.getRow(4);
  COLUMNS.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    const isDay = "day" in column;
    cell.value = column.label;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: isDay ? PALETTE.teal : PALETTE.navySoft },
    };
    cell.font = {
      name: APTOS_EXTRABOLD,
      bold: true,
      size: isDay ? 10 : 9.5,
      color: { argb: PALETTE.white },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin", color: { argb: PALETTE.borderStrong } },
      bottom: { style: "medium", color: { argb: PALETTE.gold } },
      left: {
        style: column.key === "seg" ? "medium" : "thin",
        color: { argb: column.key === "seg" ? PALETTE.cyan : PALETTE.borderStrong },
      },
      right: { style: "thin", color: { argb: PALETTE.borderStrong } },
    };
  });
  headerRow.height = 38;
  ws.autoFilter = "A4:O4";

  const atividade = input.atividadePadrao ?? "Preventiva";
  let rowIdx = 5;

  for (const equipe of EQUIPES_ORDEM) {
    const bucket = input.bucketsPorEquipe.get(equipe);
    if (!bucket || bucket.os.length === 0) continue;

    const teamHex = EQUIPE_COLOR[equipe];
    const teamArgb = argbFromHex(teamHex);
    const teamTint = mixWithWhite(teamHex);
    const teamText = readableTextColor(teamHex);
    const isClima = equipe.startsWith("CLIMAT");

    const diaDeOS = new Map<string, number>();
    bucket.porDia.forEach((list, day) => {
      for (const item of list) diaDeOS.set(item.os, day);
    });

    for (const os of bucket.os) {
      const row = ws.getRow(rowIdx);
      const dia = diaDeOS.get(os.os) ?? 0;
      const isStripe = rowIdx % 2 === 0;

      let ativoValue = os.ativo;
      let outrosValue: string = os.criticidade || "";
      let ativoNaoLocalizado = false;

      if (isClima) {
        const entry = lookupAtivoEntry(input.ativoIndex, os.predio, os.andar, os.local);
        const ativoFound = entry?.ativo || "";
        const equipFound = entry?.equipamento || "";
        const baseAtivo = ativoFound || ativoValue || "";

        if (baseAtivo) {
          ativoValue = baseAtivo;
        } else if (equipFound) {
          ativoValue = equipFound;
        } else {
          ativoValue = "Ativo não localizado";
          ativoNaoLocalizado = true;
        }

        const equipFromSheet = os.equipamento;
        if (equipFromSheet) {
          outrosValue = equipFromSheet;
        } else if (equipFound) {
          outrosValue = equipFound;
        }
      }

      const values: Record<string, string | number> = {
        os: os.os,
        nome: os.nomeOS,
        predio: os.predio,
        andar: os.andar,
        espaco: os.local,
        atividade,
        sla: formatSLA(os.terminoSLA),
        equipe,
        ativo: ativoValue,
        outros: outrosValue,
        seg: dia === 0 ? 1 : "",
        ter: dia === 1 ? 1 : "",
        qua: dia === 2 ? 1 : "",
        qui: dia === 3 ? 1 : "",
        sex: dia === 4 ? 1 : "",
      };

      COLUMNS.forEach((column, index) => {
        const cell = row.getCell(index + 1);
        const isDay = "day" in column;
        const isScheduledDay = isDay && values[column.key] === 1;
        const isLongText = ["nome", "espaco", "equipe", "ativo", "outros"].includes(column.key);

        cell.value = values[column.key];
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: isStripe ? PALETTE.stripe : PALETTE.white },
        };
        cell.font = {
          name: APTOS_BODY,
          size: 10,
          color: { argb: PALETTE.text },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: isLongText ? "left" : "center",
          wrapText: true,
          indent: isLongText ? 1 : 0,
        };
        cell.border = {
          top: { style: "thin", color: { argb: PALETTE.border } },
          bottom: { style: "thin", color: { argb: PALETTE.border } },
          left: {
            style: column.key === "seg" ? "medium" : "thin",
            color: { argb: column.key === "seg" ? PALETTE.cyan : PALETTE.border },
          },
          right: { style: "thin", color: { argb: PALETTE.border } },
        };

        if (column.key === "os") {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: teamArgb } };
          cell.font = {
            name: APTOS_EXTRABOLD,
            bold: true,
            size: 10.5,
            color: { argb: teamText },
          };
          cell.alignment = { vertical: "middle", horizontal: "center" };
        } else if (column.key === "equipe") {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: teamTint } };
          cell.font = {
            name: APTOS_SEMIBOLD,
            bold: true,
            size: 9.5,
            color: { argb: teamArgb },
          };
        } else if (isScheduledDay) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.successBg } };
          cell.font = {
            name: APTOS_EXTRABOLD,
            bold: true,
            size: 11,
            color: { argb: PALETTE.successText },
          };
          cell.alignment = { vertical: "middle", horizontal: "center" };
        } else if (isDay) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.dayEmpty } };
        }

        if (column.key === "ativo" && ativoNaoLocalizado) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.dangerBg } };
          cell.font = {
            name: APTOS_SEMIBOLD,
            bold: true,
            size: 9.5,
            color: { argb: PALETTE.dangerText },
          };
          cell.border = {
            ...cell.border,
            left: { style: "medium", color: { argb: PALETTE.dangerText } },
          };
        }
      });

      row.height = 32;
      rowIdx++;
    }
  }

  const lastDataRow = Math.max(4, rowIdx - 1);

  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
    printTitlesRow: "1:4",
    printArea: `A1:O${lastDataRow}`,
  };
  ws.headerFooter.oddFooter = "&LApont Auto&CProgramação de Preventivas&R&P / &N";

  const summary = wb.addWorksheet("RESUMO", {
    views: [{ state: "normal", showGridLines: false }],
  });
  summary.columns = Array.from({ length: 10 }, () => ({ width: 14 }));

  summary.mergeCells("A1:J1");
  const summaryTitle = summary.getCell("A1");
  summaryTitle.value = "RESUMO EXECUTIVO · PROGRAMAÇÃO SEMANAL";
  summaryTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.navy } };
  summaryTitle.font = {
    name: APTOS_EXTRABOLD,
    bold: true,
    size: 20,
    color: { argb: PALETTE.white },
  };
  summaryTitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  summaryTitle.border = { bottom: { style: "medium", color: { argb: PALETTE.gold } } };
  summary.getRow(1).height = 40;

  summary.mergeCells("A2:J2");
  const summaryMeta = summary.getCell("A2");
  summaryMeta.value =
    `${input.titulo}  •  ${input.week.label}  •  Gerado em ${generatedAt.toLocaleString("pt-BR")}`;
  summaryMeta.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.navySoft } };
  summaryMeta.font = {
    name: APTOS_SEMIBOLD,
    bold: true,
    size: 9.5,
    color: { argb: argbFromHex("#DCE8F2") },
  };
  summaryMeta.alignment = { vertical: "middle", horizontal: "left", indent: 2 };
  summary.getRow(2).height = 23;

  const cards = [
    { range: "A4:B4", valueRange: "A5:B5", label: "TOTAL DE OS", value: totalOS },
    { range: "C4:D4", valueRange: "C5:D5", label: "EQUIPES ATIVAS", value: activeTeams.length },
    { range: "E4:F4", valueRange: "E5:F5", label: "SEMANA", value: input.week.label },
    {
      range: "G4:J4",
      valueRange: "G5:J5",
      label: "PERÍODO",
      value: `${formatDate(input.week.monday)} a ${formatDate(input.week.friday)}`,
    },
  ];

  cards.forEach((card) => {
    summary.mergeCells(card.range);
    summary.mergeCells(card.valueRange);
    const labelCell = summary.getCell(card.range.split(":")[0]);
    const valueCell = summary.getCell(card.valueRange.split(":")[0]);

    labelCell.value = card.label;
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.teal } };
    labelCell.font = {
      name: APTOS_EXTRABOLD,
      bold: true,
      size: 8.5,
      color: { argb: PALETTE.white },
    };
    labelCell.alignment = { vertical: "middle", horizontal: "center" };

    valueCell.value = card.value;
    valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.stripe } };
    valueCell.font = {
      name: APTOS_EXTRABOLD,
      bold: true,
      size: 14,
      color: { argb: PALETTE.navy },
    };
    valueCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    valueCell.border = {
      bottom: { style: "thin", color: { argb: PALETTE.borderStrong } },
      left: { style: "thin", color: { argb: PALETTE.borderStrong } },
      right: { style: "thin", color: { argb: PALETTE.borderStrong } },
    };
  });
  summary.getRow(4).height = 22;
  summary.getRow(5).height = 34;

  summary.mergeCells("A7:J7");
  const daySection = summary.getCell("A7");
  daySection.value = "CARGA DISTRIBUÍDA POR DIA";
  daySection.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.navySoft } };
  daySection.font = {
    name: APTOS_EXTRABOLD,
    bold: true,
    size: 10,
    color: { argb: PALETTE.white },
  };
  daySection.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  DAY_LABELS.forEach((label, index) => {
    const startColumn = index * 2 + 1;
    summary.mergeCells(8, startColumn, 8, startColumn + 1);
    summary.mergeCells(9, startColumn, 9, startColumn + 1);

    const labelCell = summary.getCell(8, startColumn);
    const valueCell = summary.getCell(9, startColumn);
    labelCell.value = label;
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.teal } };
    labelCell.font = {
      name: APTOS_EXTRABOLD,
      bold: true,
      size: 8.5,
      color: { argb: PALETTE.white },
    };
    labelCell.alignment = { vertical: "middle", horizontal: "center" };

    valueCell.value = dayTotals[index];
    valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.successBg } };
    valueCell.font = {
      name: APTOS_EXTRABOLD,
      bold: true,
      size: 13,
      color: { argb: PALETTE.successText },
    };
    valueCell.alignment = { vertical: "middle", horizontal: "center" };
  });
  summary.getRow(8).height = 22;
  summary.getRow(9).height = 32;

  summary.mergeCells("A11:J11");
  const teamsSection = summary.getCell("A11");
  teamsSection.value = "DISTRIBUIÇÃO POR EQUIPE";
  teamsSection.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.navySoft } };
  teamsSection.font = {
    name: APTOS_EXTRABOLD,
    bold: true,
    size: 10,
    color: { argb: PALETTE.white },
  };
  teamsSection.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  summary.mergeCells("A12:B12");
  summary.mergeCells("C12:D12");
  summary.mergeCells("E12:J12");
  const teamHeaders = [
    { cell: "A12", value: "EQUIPE" },
    { cell: "C12", value: "OS" },
    { cell: "E12", value: "PARTICIPAÇÃO" },
  ];
  teamHeaders.forEach(({ cell, value }) => {
    const target = summary.getCell(cell);
    target.value = value;
    target.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.teal } };
    target.font = {
      name: APTOS_EXTRABOLD,
      bold: true,
      size: 8.5,
      color: { argb: PALETTE.white },
    };
    target.alignment = { vertical: "middle", horizontal: "center" };
  });

  let summaryRow = 13;
  activeTeams.forEach((equipe) => {
    const count = input.bucketsPorEquipe.get(equipe)?.os.length ?? 0;
    const participation = totalOS > 0 ? (count / totalOS) * 100 : 0;
    const teamHex = EQUIPE_COLOR[equipe];
    const teamArgb = argbFromHex(teamHex);

    summary.mergeCells(summaryRow, 1, summaryRow, 2);
    summary.mergeCells(summaryRow, 3, summaryRow, 4);
    summary.mergeCells(summaryRow, 5, summaryRow, 10);

    const teamCell = summary.getCell(summaryRow, 1);
    const countCell = summary.getCell(summaryRow, 3);
    const participationCell = summary.getCell(summaryRow, 5);

    teamCell.value = equipe;
    teamCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: teamArgb } };
    teamCell.font = {
      name: APTOS_EXTRABOLD,
      bold: true,
      size: 9,
      color: { argb: readableTextColor(teamHex) },
    };
    teamCell.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };

    countCell.value = count;
    countCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PALETTE.stripe } };
    countCell.font = {
      name: APTOS_EXTRABOLD,
      bold: true,
      size: 10,
      color: { argb: PALETTE.navy },
    };
    countCell.alignment = { vertical: "middle", horizontal: "center" };

    participationCell.value = `${participation.toFixed(1).replace(".", ",")}%`;
    participationCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: mixWithWhite(teamHex, 0.9) } };
    participationCell.font = {
      name: APTOS_SEMIBOLD,
      bold: true,
      size: 9,
      color: { argb: teamArgb },
    };
    participationCell.alignment = { vertical: "middle", horizontal: "center" };

    summary.getRow(summaryRow).height = 28;
    summaryRow++;
  });

  summary.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    paperSize: 9,
    margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
    printArea: `A1:J${Math.max(13, summaryRow - 1)}`,
  };
  summary.headerFooter.oddFooter = "&LApont Auto&CResumo Executivo&R&P / &N";

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function extractByEquipe(all: TriagedOS[], equipe: Equipe): TriagedOS[] {
  return all.filter((o) => o.equipe === equipe);
}
