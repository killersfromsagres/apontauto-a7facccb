import {
  EQUIPE_COLOR,
  EQUIPES_ORDEM,
  type Equipe,
  type TriagedOS,
} from "./triage";
import { preventiveExecutionDeadline } from "./monthly-scheduler";

export interface SlaDeadlineReportResult {
  blob: Blob;
  filename: string;
  total: number;
  byTeam: Array<{ equipe: Equipe; total: number }>;
}

const HEADER_COLOR = "FF0B1F33";
const TEXT_COLOR = "FF162231";
const MUTED_COLOR = "FF64748B";
const BORDER_COLOR = "FFDCE4EC";
const LIGHT_BG = "FFF7FAFC";
const WARNING_BG = "FFFFF3CD";
const WARNING_TEXT = "FF8A5A00";
const WHITE = "FFFFFFFF";

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

function naturalCompare(a: unknown, b: unknown): number {
  return String(a ?? "").localeCompare(String(b ?? ""), "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
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

function sortTeamRows(rows: TriagedOS[]): TriagedOS[] {
  return [...rows].sort((a, b) => {
    const slaA = toDate(a.terminoSLA)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const slaB = toDate(b.terminoSLA)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (slaA !== slaB) return slaA - slaB;

    return (
      naturalCompare(a.predio, b.predio) ||
      naturalCompare(a.andar, b.andar) ||
      naturalCompare(a.local, b.local) ||
      naturalCompare(a.os, b.os)
    );
  });
}

export function slaDeadlineRows(items: TriagedOS[]): TriagedOS[] {
  return items.filter(isBeforeDay28);
}

export async function generateSlaDeadlineReport(
  items: TriagedOS[],
  referenceDate: Date,
): Promise<SlaDeadlineReportResult> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Apont Auto";
  workbook.company = "GRUPO GPS";
  workbook.subject = "Preventivas com Término SLA antes do dia 28";
  workbook.title = "Término SLA";
  workbook.created = new Date();

  const filtered = slaDeadlineRows(items);
  const byTeamMap = new Map<Equipe, TriagedOS[]>();

  filtered.forEach((item) => {
    const team = item.equipe;
    if (!team || team === "CORRETIVA") return;
    const current = byTeamMap.get(team) ?? [];
    current.push(item);
    byTeamMap.set(team, current);
  });

  const teams = EQUIPES_ORDEM.filter(
    (team) => team !== "CORRETIVA" && (byTeamMap.get(team)?.length ?? 0) > 0,
  );

  const summary = workbook.addWorksheet("RESUMO", {
    views: [{ showGridLines: false }],
  });
  summary.properties.defaultRowHeight = 20;
  summary.columns = [
    { width: 34 },
    { width: 16 },
    { width: 20 },
    { width: 20 },
  ];

  summary.mergeCells("A1:D2");
  const title = summary.getCell("A1");
  title.value = "CONTROLE PREMIUM • TÉRMINO SLA";
  title.font = { name: "Aptos Display", size: 20, bold: true, color: WHITE };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_COLOR } };
  title.alignment = { vertical: "middle", horizontal: "left" };

  summary.mergeCells("A3:D3");
  const subtitle = summary.getCell("A3");
  subtitle.value =
    "Preventivas com Término SLA antes do dia 28 • Separadas por equipe";
  subtitle.font = { name: "Aptos", size: 10, color: MUTED_COLOR };
  subtitle.alignment = { vertical: "middle" };

  summary.getCell("A5").value = "Mês de referência";
  summary.getCell("B5").value = referenceDate.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  summary.getCell("C5").value = "Atualizado em";
  summary.getCell("D5").value = new Date().toLocaleString("pt-BR");

  ["A5", "C5"].forEach((cellRef) => {
    const cell = summary.getCell(cellRef);
    cell.font = { bold: true, color: TEXT_COLOR };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BG } };
  });

  summary.getCell("A7").value = "Equipe";
  summary.getCell("B7").value = "Preventivas";
  summary.getCell("C7").value = "SLA mais próximo";
  summary.getCell("D7").value = "Executar até";
  summary.getRow(7).eachCell((cell) => {
    cell.font = { bold: true, color: WHITE };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_COLOR },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  let summaryRow = 8;
  for (const team of teams) {
    const rows = sortTeamRows(byTeamMap.get(team) ?? []);
    const earliest = toDate(rows[0]?.terminoSLA);
    const deadline = rows[0] ? preventiveExecutionDeadline(rows[0]) : null;
    const teamColor = argb(EQUIPE_COLOR[team]);

    summary.getCell(summaryRow, 1).value = shortTeamName(team);
    summary.getCell(summaryRow, 2).value = rows.length;
    summary.getCell(summaryRow, 3).value = formatDate(earliest);
    summary.getCell(summaryRow, 4).value = formatDate(deadline);
    summary.getCell(summaryRow, 1).font = { bold: true, color: teamColor };
    summary.getCell(summaryRow, 2).alignment = { horizontal: "center" };
    summary.getCell(summaryRow, 3).alignment = { horizontal: "center" };
    summary.getCell(summaryRow, 4).alignment = { horizontal: "center" };
    summaryRow += 1;
  }

  summary.getCell(summaryRow + 1, 1).value = "TOTAL";
  summary.getCell(summaryRow + 1, 2).value = filtered.length;
  summary.getCell(summaryRow + 1, 1).font = { bold: true, color: WHITE };
  summary.getCell(summaryRow + 1, 2).font = { bold: true, color: WHITE };
  summary.getCell(summaryRow + 1, 1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: HEADER_COLOR },
  };
  summary.getCell(summaryRow + 1, 2).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: HEADER_COLOR },
  };

  for (const team of teams) {
    const rows = sortTeamRows(byTeamMap.get(team) ?? []);
    const sheet = workbook.addWorksheet(safeSheetName(shortTeamName(team)), {
      views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
    });
    const teamColor = argb(EQUIPE_COLOR[team]);

    sheet.mergeCells("A1:L2");
    const teamTitle = sheet.getCell("A1");
    teamTitle.value = `${shortTeamName(team)} • TÉRMINO SLA`;
    teamTitle.font = {
      name: "Aptos Display",
      size: 17,
      bold: true,
      color: WHITE,
    };
    teamTitle.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: teamColor },
    };
    teamTitle.alignment = { vertical: "middle", horizontal: "left" };

    sheet.mergeCells("A3:L3");
    const teamSubtitle = sheet.getCell("A3");
    teamSubtitle.value =
      `${rows.length} preventiva(s) com vencimento antes do dia 28 • Atualizado ${new Date().toLocaleString("pt-BR")}`;
    teamSubtitle.font = { size: 9, color: MUTED_COLOR };

    const headers = [
      "Prioridade",
      "OS",
      "Término SLA",
      "Executar até (D-1 útil)",
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
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { name: "Aptos", size: 9, bold: true, color: WHITE };
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

    rows.forEach((item, index) => {
      const sla = toDate(item.terminoSLA);
      const deadline = preventiveExecutionDeadline(item);
      const isUrgent =
        deadline !== null &&
        deadline.getTime() <=
          new Date(
            referenceDate.getFullYear(),
            referenceDate.getMonth(),
            referenceDate.getDate() + 3,
            23,
            59,
            59,
            999,
          ).getTime();

      const row = sheet.addRow([
        isUrgent ? "ATENÇÃO" : "PROGRAMAR",
        item.os,
        formatDate(sla),
        formatDate(deadline),
        item.predio || "—",
        item.andar || "—",
        item.local || "—",
        item.ativo || item.equipamento || "—",
        item.nomeOS || item.descricao || "—",
        item.criticidade || "—",
        item.status || "—",
        item.arquivo || "—",
      ]);

      row.height = 34;
      row.eachCell((cell) => {
        cell.font = { name: "Aptos", size: 9, color: TEXT_COLOR };
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

      row.getCell(1).font = {
        bold: true,
        color: isUrgent ? WARNING_TEXT : teamColor,
      };
      if (isUrgent) {
        row.getCell(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: WARNING_BG },
        };
        row.getCell(4).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: WARNING_BG },
        };
        row.getCell(4).font = { bold: true, color: WARNING_TEXT };
      }
      [2, 3, 4, 5, 6, 10, 11].forEach((col) => {
        row.getCell(col).alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
        };
      });
    });

    sheet.autoFilter = {
      from: { row: 5, column: 1 },
      to: { row: Math.max(5, 5 + rows.length), column: headers.length },
    };

    const widths = [13, 15, 14, 19, 14, 12, 24, 18, 38, 16, 15, 25];
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
      "&LApont Auto • Controle de Término SLA&C&P / &N&RAtualizado automaticamente";
  }

  if (teams.length === 0) {
    summary.mergeCells("A8:D10");
    const empty = summary.getCell("A8");
    empty.value =
      "Nenhuma preventiva com Término SLA antes do dia 28 foi encontrada nos arquivos anexados.";
    empty.font = { italic: true, color: MUTED_COLOR };
    empty.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
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

  const monthLabel = referenceDate
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    .toUpperCase();

  return {
    blob,
    filename: `TERMINO SLA - ${monthLabel}.xlsx`,
    total: filtered.length,
    byTeam: teams.map((equipe) => ({
      equipe,
      total: byTeamMap.get(equipe)?.length ?? 0,
    })),
  };
}
