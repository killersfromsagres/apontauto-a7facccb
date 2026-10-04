import {
  EQUIPE_COLOR,
  EQUIPES_ORDEM,
  type Equipe,
  type TriagedOS,
} from "./triage";
import {
  buildSlaConsolidatedPlan,
  type SlaConsolidatedRow,
} from "./sla-consolidation";

export interface SlaDeadlineReportResult {
  blob: Blob;
  filename: string;
  total: number;
  prioritized: number;
  duplicatesRemoved: number;
  byTeam: Array<{ equipe: Equipe; total: number }>;
}

const HEADER_COLOR = "FF0B1F33";
const TEXT_COLOR = "FF162231";
const MUTED_COLOR = "FF64748B";
const BORDER_COLOR = "FFDCE4EC";
const LIGHT_BG = "FFF7FAFC";
const SLA_BG = "FFFFF3CD";
const SLA_TEXT = "FF8A5A00";
const WHITE = "FFFFFFFF";

const ACTIVE_TEAMS = EQUIPES_ORDEM.filter(
  (team): team is Exclude<Equipe, "CORRETIVA"> => team !== "CORRETIVA",
);

function argb(hex: string): string {
  return `FF${hex.replace("#", "").toUpperCase()}`;
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
      12,
    );
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return value.toLocaleDateString("pt-BR");
}

function safeSheetName(value: string): string {
  return value
    .replace(/[\\/*?:\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
}

function shortTeamName(equipe: Equipe): string {
  if (equipe === "CLIMATIZAÇÃO E REFRIGERAÇÃO 1") return "REFRIGERAÇÃO 1";
  if (equipe === "CLIMATIZAÇÃO E REFRIGERAÇÃO 2") return "REFRIGERAÇÃO 2";
  if (equipe === "CLIMATIZAÇÃO E REFRIGERAÇÃO 3") return "REFRIGERAÇÃO 3";
  return equipe;
}

function isBeforeDay28(item: TriagedOS): boolean {
  const sla = toDate(item.terminoSLA);
  return Boolean(sla && sla.getDate() < 28);
}

/** Mantido para compatibilidade com consumidores antigos do relatório. */
export function slaDeadlineRows(items: TriagedOS[]): TriagedOS[] {
  return items.filter(isBeforeDay28);
}

function styleHeaderRow(row: import("exceljs").Row): void {
  row.height = 28;
  row.eachCell((cell) => {
    cell.font = {
      name: "Aptos",
      size: 9,
      bold: true,
      color: { argb: WHITE },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_COLOR },
    };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    cell.border = {
      bottom: { style: "thin", color: { argb: BORDER_COLOR } },
    };
  });
}

function styleDataRow(
  row: import("exceljs").Row,
  index: number,
  slaMoved: boolean,
): void {
  row.height = 31;
  row.eachCell((cell) => {
    cell.font = { name: "Aptos", size: 9, color: { argb: TEXT_COLOR } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = {
      bottom: { style: "hair", color: { argb: BORDER_COLOR } },
    };
    if ((index + 1) % 2 === 0) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: LIGHT_BG },
      };
    }
  });

  if (slaMoved) {
    row.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: SLA_BG },
    };
    row.getCell(1).font = { bold: true, color: { argb: SLA_TEXT } };
    row.getCell(2).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: SLA_BG },
    };
    row.getCell(2).font = { bold: true, color: { argb: SLA_TEXT } };
  }
}

function teamRows(
  rows: SlaConsolidatedRow[],
  team: Equipe,
): SlaConsolidatedRow[] {
  return rows.filter((row) => row.equipe === team);
}

export async function generateSlaDeadlineReport(
  items: TriagedOS[],
  referenceDate: Date,
  minutesPerTeam: Partial<Record<Equipe, 30 | 60>> = {},
): Promise<SlaDeadlineReportResult> {
  const { default: ExcelJS } = await import("exceljs");
  const plan = buildSlaConsolidatedPlan(items, referenceDate, minutesPerTeam);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Apont Auto";
  workbook.company = "GRUPO GPS";
  workbook.subject = "Apontamento consolidado por semana e equipe";
  workbook.title = "Baixar Término SLA • Consolidado";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("RESUMO", {
    views: [{ state: "frozen", ySplit: 7, showGridLines: false }],
  });
  summary.properties.defaultRowHeight = 20;
  summary.columns = [
    { width: 34 },
    ...plan.weeks.map(() => ({ width: 14 })),
    { width: 16 },
  ];

  const lastSummaryColumn = Math.max(3, plan.weeks.length + 2);
  summary.mergeCells(1, 1, 2, lastSummaryColumn);
  const title = summary.getCell(1, 1);
  title.value = "APONTAMENTO CONSOLIDADO • PROGRAMAÇÃO + TÉRMINO SLA";
  title.font = {
    name: "Aptos Display",
    size: 19,
    bold: true,
    color: { argb: WHITE },
  };
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: HEADER_COLOR },
  };
  title.alignment = { vertical: "middle", horizontal: "left" };

  summary.mergeCells(3, 1, 3, lastSummaryColumn);
  const subtitle = summary.getCell(3, 1);
  subtitle.value =
    "Uma OS aparece uma única vez. SLA antes do dia 28 é direcionado para a semana anterior ao vencimento; as demais OS preservam a distribuição normal da programação.";
  subtitle.font = { name: "Aptos", size: 10, color: { argb: MUTED_COLOR } };
  subtitle.alignment = { vertical: "middle", wrapText: true };
  summary.getRow(3).height = 34;

  summary.getCell(5, 1).value = "Mês de referência";
  summary.getCell(5, 2).value = referenceDate.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  summary.getCell(5, 3).value = "OS únicas";
  summary.getCell(5, 4).value = plan.rows.length;
  summary.getCell(5, 5).value = "Antecipadas por SLA";
  summary.getCell(5, 6).value = plan.prioritizedCount;
  summary.getCell(5, 7).value = "Duplicidades removidas";
  summary.getCell(5, 8).value = plan.duplicatesRemoved;

  for (const col of [1, 3, 5, 7]) {
    const cell = summary.getCell(5, col);
    cell.font = { bold: true, color: { argb: TEXT_COLOR } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: LIGHT_BG },
    };
  }

  const summaryHeaders = [
    "Equipe",
    ...plan.weeks.map((week) => `Semana ${week.isoWeek}`),
    "Total",
  ];
  const summaryHeader = summary.addRow([]);
  summaryHeader.values = summaryHeaders;
  styleHeaderRow(summaryHeader);

  for (const team of ACTIVE_TEAMS) {
    const rows = teamRows(plan.rows, team);
    const values = [
      shortTeamName(team),
      ...plan.weeks.map(
        (_, weekIndex) => rows.filter((row) => row.weekIndex === weekIndex).length,
      ),
      rows.length,
    ];
    const row = summary.addRow(values);
    row.getCell(1).font = {
      bold: true,
      color: { argb: argb(EQUIPE_COLOR[team]) },
    };
    for (let col = 2; col <= values.length; col += 1) {
      row.getCell(col).alignment = { horizontal: "center" };
    }
  }

  const totalValues = [
    "TOTAL",
    ...plan.weeks.map(
      (_, weekIndex) => plan.rows.filter((row) => row.weekIndex === weekIndex).length,
    ),
    plan.rows.length,
  ];
  const totalRow = summary.addRow(totalValues);
  totalRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_COLOR },
    };
    cell.alignment = { horizontal: "center" };
  });

  for (const team of ACTIVE_TEAMS) {
    const rows = teamRows(plan.rows, team);
    const sheet = workbook.addWorksheet(safeSheetName(shortTeamName(team)), {
      views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
    });
    const teamColor = argb(EQUIPE_COLOR[team]);

    sheet.mergeCells("A1:L2");
    const teamTitle = sheet.getCell("A1");
    teamTitle.value = `${shortTeamName(team)} • APONTAMENTO SEM DUPLICIDADE`;
    teamTitle.font = {
      name: "Aptos Display",
      size: 17,
      bold: true,
      color: { argb: WHITE },
    };
    teamTitle.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: teamColor },
    };
    teamTitle.alignment = { vertical: "middle", horizontal: "left" };

    sheet.mergeCells("A3:L3");
    const teamSubtitle = sheet.getCell("A3");
    teamSubtitle.value = `${rows.length} OS única(s) • Semanas ${plan.weeks
      .map((week) => week.isoWeek)
      .join(", ")} • Filtre pela coluna Semana para copiar somente os chamados que serão apontados.`;
    teamSubtitle.font = { size: 9, color: { argb: MUTED_COLOR } };
    teamSubtitle.alignment = { vertical: "middle", wrapText: true };

    const headers = [
      "Semana",
      "Origem da semana",
      "OS",
      "Término SLA",
      "Prédio",
      "Andar",
      "Local",
      "Ativo",
      "Nome da OS",
      "Criticidade",
      "Status",
      "Arquivo origem",
    ];
    sheet.addRow([]);
    const headerRow = sheet.addRow(headers);
    styleHeaderRow(headerRow);

    rows.forEach((entry, index) => {
      const item = entry.item;
      const row = sheet.addRow([
        `Semana ${entry.week.isoWeek}`,
        entry.movedBySla ? "ANTECIPADA POR SLA" : "PROGRAMAÇÃO NORMAL",
        item.os || item.chamado || "—",
        formatDate(toDate(item.terminoSLA)),
        item.predio || "—",
        item.andar || "—",
        item.local || "—",
        item.ativo || item.equipamento || "—",
        item.nomeOS || item.descricao || "—",
        item.criticidade || "—",
        item.status || "—",
        item.arquivo || "—",
      ]);

      styleDataRow(row, index, entry.movedBySla);
      [1, 2, 3, 4, 5, 6, 10, 11].forEach((col) => {
        row.getCell(col).alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
      });
    });

    if (rows.length === 0) {
      sheet.mergeCells("A6:L8");
      const empty = sheet.getCell("A6");
      empty.value = "Nenhuma OS desta equipe nos arquivos anexados.";
      empty.font = { italic: true, color: { argb: MUTED_COLOR } };
      empty.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
    }

    sheet.autoFilter = {
      from: { row: 5, column: 1 },
      to: { row: Math.max(5, 5 + rows.length), column: headers.length },
    };

    const widths = [
      13, 22, 16, 15, 15, 13, 26, 22, 42, 18, 16, 27,
    ];
    widths.forEach((width, index) => {
      sheet.getColumn(index + 1).width = width;
    });

    sheet.pageSetup = {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2,
      },
    };
    sheet.headerFooter.oddFooter =
      "&LApont Auto • Apontamento consolidado&C&P / &N&RUma OS = uma ocorrência";
  }

  summary.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const monthKey = `${referenceDate.getFullYear()}-${String(
    referenceDate.getMonth() + 1,
  ).padStart(2, "0")}`;

  return {
    blob,
    filename: `APONTAMENTO_TERMINO_SLA_CONSOLIDADO_${monthKey}.xlsx`,
    total: plan.rows.length,
    prioritized: plan.prioritizedCount,
    duplicatesRemoved: plan.duplicatesRemoved,
    byTeam: ACTIVE_TEAMS.map((equipe) => ({
      equipe,
      total: teamRows(plan.rows, equipe).length,
    })),
  };
}
