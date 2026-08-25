import type { OsCacheRow } from "./db";

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();

const C = {
  ink: argb("#0F172A"),
  brand: argb("#08111F"),
  brandSoft: argb("#14263A"),
  brandMuted: argb("#1E3852"),
  accent: argb("#1D6FD6"),
  accentStrong: argb("#0E4F9F"),
  accentSoft: argb("#EAF3FF"),
  teal: argb("#0F766E"),
  tealSoft: argb("#E8F7F4"),
  gold: argb("#D6A84B"),
  white: argb("#FFFFFF"),
  slate800: argb("#1E293B"),
  slate700: argb("#334155"),
  slate500: argb("#64748B"),
  slate300: argb("#CBD5E1"),
  slate200: argb("#E2E8F0"),
  slate100: argb("#F1F5F9"),
  slate50: argb("#F8FAFC"),
  warnBg: argb("#FFF7E6"),
  warnFg: argb("#9A6700"),
  okBg: argb("#ECFDF3"),
  okFg: argb("#067647"),
  infoBg: argb("#EFF8FF"),
  infoFg: argb("#175CD3"),
  dangerBg: argb("#FEF3F2"),
  dangerFg: argb("#B42318"),
};

const FONT = "Aptos";
const FONT_SEMIBOLD = "Aptos Display";

const thinBorder = {
  style: "thin",
  color: { argb: C.slate200 },
} as const;

const TEAM_PALETTE = [
  { bg: "#FFF4D8", fg: "#8B5A00", accent: "#F59E0B" },
  { bg: "#E8F7FF", fg: "#075985", accent: "#0EA5E9" },
  { bg: "#F1ECFF", fg: "#5B21B6", accent: "#8B5CF6" },
  { bg: "#ECFDF3", fg: "#067647", accent: "#10B981" },
  { bg: "#FFF0F6", fg: "#9D174D", accent: "#EC4899" },
  { bg: "#ECFEFF", fg: "#0E7490", accent: "#06B6D4" },
  { bg: "#F2F4F7", fg: "#344054", accent: "#667085" },
] as const;

function normalize(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function hashText(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function teamStyle(team: string | null | undefined) {
  const normalized = normalize(team);
  const explicit: Record<string, number> = {
    ELETRICA: 0,
    HIDRAULICA: 1,
    CIVIL: 2,
    LIMPEZA: 3,
    PINTURA: 4,
    REFRIGERACAO: 5,
    CHAVEIRO: 6,
  };
  const index = explicit[normalized] ?? hashText(normalized || "OUTROS") % TEAM_PALETTE.length;
  return TEAM_PALETTE[index];
}

function statusLabel(status: string | null | undefined): string {
  const normalized = normalize(status || "aberto");
  if (["CONCLUIDO", "CONCLUIDA", "FINALIZADO", "FINALIZADA", "FECHADO", "FECHADA"].includes(normalized)) {
    return "Concluído";
  }
  if (["EM ANDAMENTO", "EM EXECUCAO", "EXECUCAO", "ANDAMENTO"].includes(normalized)) {
    return "Em andamento";
  }
  if (["AGUARDANDO MATERIAL", "MATERIAL", "AGUARDANDO PECA", "AGUARDANDO PECAS"].includes(normalized)) {
    return "Aguardando material";
  }
  if (["CANCELADO", "CANCELADA"].includes(normalized)) return "Cancelado";
  return status ? String(status) : "Aberto";
}

function ageInDays(iso: string | null | undefined): number {
  if (!iso) return 0;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
}

function titleBlock(ws: any, title: string, subtitle: string, cols: number) {
  ws.mergeCells(1, 1, 1, cols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = {
    name: FONT_SEMIBOLD,
    size: 22,
    bold: true,
    color: { argb: C.white },
  };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.brand } };
  titleCell.border = { bottom: { style: "medium", color: { argb: C.gold } } };
  ws.getRow(1).height = 42;

  ws.mergeCells(2, 1, 2, cols);
  const subtitleCell = ws.getCell(2, 1);
  subtitleCell.value = subtitle;
  subtitleCell.font = {
    name: FONT,
    size: 10,
    bold: true,
    color: { argb: argb("#D7E5F3") },
  };
  subtitleCell.alignment = { vertical: "middle", horizontal: "left", indent: 2 };
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.brandSoft } };
  ws.getRow(2).height = 24;
}

function sectionBand(ws: any, rowIdx: number) {
  ws.mergeCells(rowIdx, 1, rowIdx, 7);
  const identity = ws.getCell(rowIdx, 1);
  identity.value = "IDENTIFICAÇÃO DO CHAMADO";
  identity.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.brandMuted } };
  identity.font = { name: FONT, size: 9, bold: true, color: { argb: C.white } };
  identity.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  ws.mergeCells(rowIdx, 8, rowIdx, 11);
  const execution = ws.getCell(rowIdx, 8);
  execution.value = "EXECUÇÃO DE CAMPO & STATUS";
  execution.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.teal } };
  execution.font = { name: FONT, size: 9, bold: true, color: { argb: C.white } };
  execution.alignment = { vertical: "middle", horizontal: "center" };

  ws.getRow(rowIdx).height = 21;
}

function headerRow(ws: any, rowIdx: number, headers: string[]) {
  const row = ws.getRow(rowIdx);

  headers.forEach((header, index) => {
    const cell = row.getCell(index + 1);
    cell.value = header;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: index >= 7 ? C.teal : C.brandSoft },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: thinBorder,
      bottom: { style: "medium", color: { argb: index >= 7 ? C.teal : C.gold } },
      left: {
        style: index === 7 ? "medium" : "thin",
        color: { argb: index === 7 ? C.teal : C.slate300 },
      },
      right: thinBorder,
    };
  });

  row.height = 34;
  ws.views = [
    {
      state: "frozen",
      xSplit: 2,
      ySplit: rowIdx,
      activeCell: `C${rowIdx + 1}`,
      showGridLines: false,
    },
  ];
}

function styleBody(ws: any, firstRow: number, lastRow: number, cols: number) {
  for (let r = firstRow; r <= lastRow; r += 1) {
    const row = ws.getRow(r);
    row.height = 36;

    for (let c = 1; c <= cols; c += 1) {
      const cell = row.getCell(c);
      cell.font = { name: FONT, size: 10, color: { argb: C.ink } };
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
        horizontal: "left",
        indent: c === 1 ? 0 : 1,
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: (r - firstRow) % 2 === 0 ? C.white : C.slate50 },
      };
      cell.border = {
        bottom: thinBorder,
        left: {
          style: c === 8 ? "medium" : "thin",
          color: { argb: c === 8 ? C.teal : C.slate200 },
        },
        right: thinBorder,
      };
    }

    row.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(1).font = { name: FONT, size: 9, bold: true, color: { argb: C.slate500 } };

    row.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(2).font = { name: FONT, size: 10.5, bold: true, color: { argb: C.infoFg } };
    row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.infoBg } };

    row.getCell(8).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(9).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(10).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(11).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }
}

function styleTeamCell(row: any, team: string | null | undefined) {
  const style = teamStyle(team);
  const cell = row.getCell(3);
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(style.bg) } };
  cell.font = { name: FONT, size: 10, bold: true, color: { argb: argb(style.fg) } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = {
    ...cell.border,
    left: { style: "medium", color: { argb: argb(style.accent) } },
  };
}

function highlightOperationalStatus(
  row: any,
  slaText: string,
  materialSolicitado: boolean,
  status: string,
) {
  const slaCell = row.getCell(9);
  if (slaText === "No prazo") {
    slaCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.okFg } };
    slaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.okBg } };
  } else {
    slaCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.dangerFg } };
    slaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.dangerBg } };
  }

  const materialCell = row.getCell(10);
  if (materialSolicitado) {
    materialCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.warnFg } };
    materialCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.warnBg } };
  } else {
    materialCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.slate500 } };
    materialCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate100 } };
  }

  const normalizedStatus = normalize(status);
  const statusCell = row.getCell(11);

  if (["CONCLUIDO", "CONCLUIDA", "FINALIZADO", "FINALIZADA", "FECHADO", "FECHADA"].includes(normalizedStatus)) {
    statusCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.okFg } };
    statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.okBg } };
  } else if (["EM ANDAMENTO", "EM EXECUCAO", "EXECUCAO", "ANDAMENTO"].includes(normalizedStatus)) {
    statusCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.infoFg } };
    statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.infoBg } };
  } else if (["CANCELADO", "CANCELADA"].includes(normalizedStatus)) {
    statusCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.dangerFg } };
    statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.dangerBg } };
  } else {
    statusCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.slate700 } };
    statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate100 } };
  }
}

function styleSummaryRow(
  ws: any,
  rowIdx: number,
  cols: number,
  stats: { total: number; teams: number; slaRisk: number; materials: number },
) {
  ws.mergeCells(rowIdx, 1, rowIdx, 4);
  const labelCell = ws.getCell(rowIdx, 1);
  labelCell.value = "RESUMO DA PROGRAMAÇÃO";
  labelCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
  labelCell.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.brandSoft } };

  ws.mergeCells(rowIdx, 5, rowIdx, cols);
  const totalCell = ws.getCell(rowIdx, 5);
  totalCell.value =
    `Total: ${stats.total} OS  •  ${stats.teams} equipes  •  ` +
    `${stats.slaRisk} SLA crítico  •  ${stats.materials} com material solicitado`;
  totalCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
  totalCell.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.accentStrong } };

  for (let c = 1; c <= cols; c += 1) {
    ws.getCell(rowIdx, c).border = {
      top: { style: "medium", color: { argb: C.gold } },
      bottom: thinBorder,
    };
  }

  ws.getRow(rowIdx).height = 32;
}

function styleKpiCard(
  ws: any,
  labelRange: string,
  valueRange: string,
  label: string,
  value: string | number,
  tone: "blue" | "teal" | "gold" | "red",
) {
  const tones = {
    blue: { label: C.accentStrong, valueBg: C.infoBg, valueFg: C.infoFg },
    teal: { label: C.teal, valueBg: C.tealSoft, valueFg: C.teal },
    gold: { label: C.gold, valueBg: C.warnBg, valueFg: C.warnFg },
    red: { label: C.dangerFg, valueBg: C.dangerBg, valueFg: C.dangerFg },
  };
  const style = tones[tone];

  ws.mergeCells(labelRange);
  ws.mergeCells(valueRange);
  const labelCell = ws.getCell(labelRange.split(":")[0]);
  const valueCell = ws.getCell(valueRange.split(":")[0]);

  labelCell.value = label;
  labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.label } };
  labelCell.font = { name: FONT, size: 8.5, bold: true, color: { argb: C.white } };
  labelCell.alignment = { vertical: "middle", horizontal: "center" };

  valueCell.value = value;
  valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.valueBg } };
  valueCell.font = { name: FONT_SEMIBOLD, size: 15, bold: true, color: { argb: style.valueFg } };
  valueCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  valueCell.border = {
    bottom: { style: "thin", color: { argb: C.slate300 } },
    left: { style: "thin", color: { argb: C.slate300 } },
    right: { style: "thin", color: { argb: C.slate300 } },
  };
}

function createExecutiveSummary(
  wb: any,
  osList: OsCacheRow[],
  title: string,
  equipeFiltro: string,
  generatedAt: Date,
) {
  const summary = wb.addWorksheet("Resumo Executivo", {
    properties: { tabColor: { argb: C.gold } },
    views: [{ state: "normal", showGridLines: false }],
  });
  summary.columns = Array.from({ length: 12 }, () => ({ width: 12 }));

  const teamCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  let materialCount = 0;
  let slaRisk = 0;
  let inProgress = 0;

  osList.forEach((item) => {
    const team = item.equipe || "Sem equipe";
    const currentStatus = statusLabel(item.status);
    teamCounts.set(team, (teamCounts.get(team) || 0) + 1);
    statusCounts.set(currentStatus, (statusCounts.get(currentStatus) || 0) + 1);
    if (item.material_status === "solicitado") materialCount += 1;
    if (ageInDays(item.data_criacao) >= 30) slaRisk += 1;
    if (normalize(currentStatus) === "EM ANDAMENTO") inProgress += 1;
  });

  const teams = [...teamCounts.entries()].sort((a, b) => b[1] - a[1]);
  const statuses = [...statusCounts.entries()].sort((a, b) => b[1] - a[1]);

  summary.mergeCells("A1:L1");
  const titleCell = summary.getCell("A1");
  titleCell.value = "RESUMO EXECUTIVO · EXECUÇÃO DE CAMPO";
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.brand } };
  titleCell.font = { name: FONT_SEMIBOLD, size: 20, bold: true, color: { argb: C.white } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  titleCell.border = { bottom: { style: "medium", color: { argb: C.gold } } };
  summary.getRow(1).height = 40;

  summary.mergeCells("A2:L2");
  const meta = summary.getCell("A2");
  meta.value = `${title}  •  Equipe: ${equipeFiltro}  •  Gerado em ${generatedAt.toLocaleString("pt-BR")}`;
  meta.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.brandSoft } };
  meta.font = { name: FONT, size: 9.5, bold: true, color: { argb: argb("#D7E5F3") } };
  meta.alignment = { vertical: "middle", horizontal: "left", indent: 2 };
  summary.getRow(2).height = 23;

  styleKpiCard(summary, "A4:C4", "A5:C6", "TOTAL DE OS", osList.length, "blue");
  styleKpiCard(summary, "D4:F4", "D5:F6", "EQUIPES ATIVAS", teams.length, "teal");
  styleKpiCard(summary, "G4:I4", "G5:I6", "EM ANDAMENTO", inProgress, "gold");
  styleKpiCard(summary, "J4:L4", "J5:L6", "SLA CRÍTICO ≥ 30 DIAS", slaRisk, "red");
  summary.getRow(4).height = 21;
  summary.getRow(5).height = 20;
  summary.getRow(6).height = 20;

  summary.mergeCells("A8:F8");
  const teamsTitle = summary.getCell("A8");
  teamsTitle.value = "DISTRIBUIÇÃO POR EQUIPE";
  teamsTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.brandSoft } };
  teamsTitle.font = { name: FONT, size: 9.5, bold: true, color: { argb: C.white } };
  teamsTitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  summary.mergeCells("H8:L8");
  const statusTitle = summary.getCell("H8");
  statusTitle.value = "STATUS OPERACIONAL";
  statusTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.teal } };
  statusTitle.font = { name: FONT, size: 9.5, bold: true, color: { argb: C.white } };
  statusTitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  summary.mergeCells("A9:D9");
  summary.mergeCells("E9:F9");
  summary.getCell("A9").value = "Equipe";
  summary.getCell("E9").value = "OS / Participação";
  [summary.getCell("A9"), summary.getCell("E9")].forEach((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate700 } };
    cell.font = { name: FONT, size: 8.5, bold: true, color: { argb: C.white } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  summary.mergeCells("H9:J9");
  summary.mergeCells("K9:L9");
  summary.getCell("H9").value = "Status";
  summary.getCell("K9").value = "Quantidade";
  [summary.getCell("H9"), summary.getCell("K9")].forEach((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate700 } };
    cell.font = { name: FONT, size: 8.5, bold: true, color: { argb: C.white } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  let teamRow = 10;
  teams.forEach(([team, count]) => {
    const palette = teamStyle(team);
    const share = osList.length ? (count / osList.length) * 100 : 0;
    summary.mergeCells(teamRow, 1, teamRow, 4);
    summary.mergeCells(teamRow, 5, teamRow, 6);

    const teamCell = summary.getCell(teamRow, 1);
    teamCell.value = team;
    teamCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(palette.bg) } };
    teamCell.font = { name: FONT, size: 9, bold: true, color: { argb: argb(palette.fg) } };
    teamCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    teamCell.border = { left: { style: "medium", color: { argb: argb(palette.accent) } }, bottom: thinBorder };

    const shareCell = summary.getCell(teamRow, 5);
    shareCell.value = `${count}  •  ${share.toFixed(1).replace(".", ",")}%`;
    shareCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate50 } };
    shareCell.font = { name: FONT, size: 9, bold: true, color: { argb: C.slate700 } };
    shareCell.alignment = { vertical: "middle", horizontal: "center" };
    shareCell.border = { bottom: thinBorder, right: thinBorder };
    summary.getRow(teamRow).height = 25;
    teamRow += 1;
  });

  let statusRow = 10;
  statuses.forEach(([status, count]) => {
    summary.mergeCells(statusRow, 8, statusRow, 10);
    summary.mergeCells(statusRow, 11, statusRow, 12);
    const statusCell = summary.getCell(statusRow, 8);
    const countCell = summary.getCell(statusRow, 11);

    statusCell.value = status;
    statusCell.font = { name: FONT, size: 9, bold: true, color: { argb: C.slate700 } };
    statusCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate50 } };
    statusCell.border = { bottom: thinBorder, left: thinBorder };

    countCell.value = count;
    countCell.font = { name: FONT_SEMIBOLD, size: 10, bold: true, color: { argb: C.teal } };
    countCell.alignment = { vertical: "middle", horizontal: "center" };
    countCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.tealSoft } };
    countCell.border = { bottom: thinBorder, right: thinBorder };
    summary.getRow(statusRow).height = 25;
    statusRow += 1;
  });

  const detailRow = Math.max(teamRow, statusRow) + 2;
  summary.mergeCells(detailRow, 1, detailRow, 12);
  const alertsTitle = summary.getCell(detailRow, 1);
  alertsTitle.value = "INDICADORES DE ATENÇÃO";
  alertsTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.brandSoft } };
  alertsTitle.font = { name: FONT, size: 9.5, bold: true, color: { argb: C.white } };
  alertsTitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  summary.mergeCells(detailRow + 1, 1, detailRow + 2, 6);
  const materialCard = summary.getCell(detailRow + 1, 1);
  materialCard.value = `${materialCount} chamado(s) com material solicitado`;
  materialCard.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.warnBg } };
  materialCard.font = { name: FONT_SEMIBOLD, size: 11, bold: true, color: { argb: C.warnFg } };
  materialCard.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  materialCard.border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

  summary.mergeCells(detailRow + 1, 7, detailRow + 2, 12);
  const slaCard = summary.getCell(detailRow + 1, 7);
  slaCard.value = `${slaRisk} chamado(s) com 30 dias ou mais de abertura`;
  slaCard.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.dangerBg } };
  slaCard.font = { name: FONT_SEMIBOLD, size: 11, bold: true, color: { argb: C.dangerFg } };
  slaCard.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  slaCard.border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

  summary.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    paperSize: 9,
    horizontalCentered: true,
    margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
    printArea: `A1:L${detailRow + 2}`,
  };
  summary.headerFooter.oddFooter = "&L&9Apont Auto · Execução de Campo&C&9Resumo Executivo&R&9Página &P de &N";
}

export async function generateProgramacaoExcel(
  osList: OsCacheRow[],
  equipeFiltro: string,
  aba: "corretiva" | "preventiva",
) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const generatedAt = new Date();

  wb.creator = "Apont Auto · Programação";
  wb.company = "Apont Auto";
  wb.subject = "Programação de execução de campo";
  wb.created = generatedAt;
  wb.modified = generatedAt;

  const title = aba === "preventiva" ? "Programação de Backorder" : "Programação de Corretivas";
  const teamCount = new Set(osList.map((item) => item.equipe || "Sem equipe")).size;
  const slaRisk = osList.filter((item) => ageInDays(item.data_criacao) >= 30).length;
  const materialCount = osList.filter((item) => item.material_status === "solicitado").length;

  const ws = wb.addWorksheet("Programação", {
    properties: {
      defaultRowHeight: 18,
      tabColor: { argb: C.accent },
    },
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.55,
        bottom: 0.55,
        header: 0.2,
        footer: 0.2,
      },
    },
  });

  const headers = [
    "ID",
    "OS",
    "Equipe",
    "Solicitante",
    "Prédio / Andar",
    "Local",
    "Descrição do Serviço",
    "Abertura",
    "SLA (Atraso)",
    "Material",
    "Status Atual",
  ];

  ws.columns = [
    { width: 7 },
    { width: 14 },
    { width: 20 },
    { width: 27 },
    { width: 23 },
    { width: 25 },
    { width: 54 },
    { width: 15 },
    { width: 16 },
    { width: 17 },
    { width: 18 },
  ];

  titleBlock(
    ws,
    title.toUpperCase(),
    `Equipe: ${equipeFiltro.toUpperCase()}  •  ${osList.length} OS  •  ${teamCount} equipe(s)  •  ` +
      `Gerado em ${generatedAt.toLocaleString("pt-BR")}`,
    headers.length,
  );

  sectionBand(ws, 3);
  const headerIdx = 4;
  headerRow(ws, headerIdx, headers);

  const operationalRows: Array<{
    row: any;
    slaText: string;
    materialSolicitado: boolean;
    status: string;
    equipe: string | null;
  }> = [];

  osList.forEach((o, idx) => {
    const rowIdx = headerIdx + 1 + idx;
    const row = ws.getRow(rowIdx);

    const dataAbertura = o.data_criacao
      ? new Date(o.data_criacao).toLocaleDateString("pt-BR")
      : "—";

    const daysOpen = ageInDays(o.data_criacao);
    const slaText = daysOpen >= 30 ? `${daysOpen} dias` : "No prazo";
    const materialSolicitado = o.material_status === "solicitado";
    const status = statusLabel(o.status);

    row.values = [
      idx + 1,
      o.numero_os,
      o.equipe || "—",
      o.solicitante || "—",
      `${o.predio || "—"} / ${o.andar || "—"}`,
      o.local || "—",
      o.nome_os || "—",
      dataAbertura,
      slaText,
      materialSolicitado ? "Solicitado" : "N/A",
      status,
    ];

    operationalRows.push({ row, slaText, materialSolicitado, status, equipe: o.equipe });
  });

  const lastRow = headerIdx + osList.length;
  if (osList.length > 0) {
    styleBody(ws, headerIdx + 1, lastRow, headers.length);
    operationalRows.forEach(({ row, slaText, materialSolicitado, status, equipe }) => {
      styleTeamCell(row, equipe);
      highlightOperationalStatus(row, slaText, materialSolicitado, status);
    });
  }

  ws.autoFilter = {
    from: { row: headerIdx, column: 1 },
    to: { row: Math.max(headerIdx, lastRow), column: headers.length },
  };
  ws.pageSetup.printTitlesRow = `1:${headerIdx}`;

  const totalRow = Math.max(headerIdx, lastRow) + 2;
  styleSummaryRow(ws, totalRow, headers.length, {
    total: osList.length,
    teams: teamCount,
    slaRisk,
    materials: materialCount,
  });
  ws.pageSetup.printArea = `A1:K${totalRow}`;

  ws.headerFooter.oddFooter =
    `&L&9Apont Auto · Execução de Campo&C&9Página &P de &N&R&9${title}`;

  createExecutiveSummary(wb, osList, title, equipeFiltro, generatedAt);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `programacao_${aba}_${equipeFiltro.toLowerCase().replace(/\s+/g, "_")}_${generatedAt.toISOString().split("T")[0]}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
