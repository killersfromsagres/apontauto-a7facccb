import { classifyPriority } from "@/lib/corretiva/priority-classifier";
import { EQUIPE_COLOR, EQUIPES_ORDEM, type Equipe } from "./triage";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const COLORS = {
  white: "FFFFFFFF",
  stripe: "FFF7FAFC",
  text: "FF162231",
  border: "FFDDE5EC",
  correctiveBg: "FFFFD966",
  correctiveText: "FF000000",
  criticalBg: "FFFEE2E2",
  criticalText: "FFB91C1C",
  highBg: "FFFFEDD5",
  highText: "FFC2410C",
  mediumBg: "FFE0F2FE",
  mediumText: "FF0369A1",
  normalBg: "FFF1F5F9",
  normalText: "FF475569",
  dangerBg: "FFFFE8E8",
  dangerText: "FFC62828",
};

const DAY_NAMES = [
  "SEGUNDA-FEIRA",
  "TERÇA-FEIRA",
  "QUARTA-FEIRA",
  "QUINTA-FEIRA",
  "SEXTA-FEIRA",
];

const COL = {
  os: 1,
  nome: 2,
  predio: 3,
  andar: 4,
  espaco: 5,
  atividade: 6,
  sla: 7,
  equipe: 8,
  ativo: 9,
  equipamento: 10,
  prioridade: 11,
} as const;

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
}

function argbFromHex(hex: string) {
  return `FF${hex.replace("#", "").toUpperCase()}`;
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

function isDataRow(row: import("exceljs").Row) {
  const activity = normalize(row.getCell(COL.atividade).text);
  return activity === "CORRETIVA" || activity === "PREVENTIVA";
}

function isCorrectiveRow(row: import("exceljs").Row) {
  return normalize(row.getCell(COL.atividade).text) === "CORRETIVA";
}

function parseBrDate(value: string): string | undefined {
  const raw = value.trim();
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return raw || undefined;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function priorityForRow(row: import("exceljs").Row) {
  return classifyPriority({
    numero_os: row.getCell(COL.os).text,
    nome_os: row.getCell(COL.nome).text,
    predio: row.getCell(COL.predio).text,
    andar: row.getCell(COL.andar).text,
    local: row.getCell(COL.espaco).text,
    equipe: row.getCell(COL.equipe).text,
    data_sla: parseBrDate(row.getCell(COL.sla).text),
  });
}

function priorityPalette(level: ReturnType<typeof classifyPriority>["level"]) {
  if (level === "CRÍTICA")
    return { bg: COLORS.criticalBg, text: COLORS.criticalText };
  if (level === "ALTA")
    return { bg: COLORS.highBg, text: COLORS.highText };
  if (level === "MÉDIA")
    return { bg: COLORS.mediumBg, text: COLORS.mediumText };
  return { bg: COLORS.normalBg, text: COLORS.normalText };
}

function visualLineCount(value: string, charsPerLine: number): number {
  if (!value.trim()) return 1;
  return value
    .split(/\r?\n/)
    .reduce(
      (total, part) =>
        total + Math.max(1, Math.ceil(part.trim().length / charsPerLine)),
      0,
    );
}

function intelligentRowHeight(row: import("exceljs").Row): number {
  const nameLines = visualLineCount(row.getCell(COL.nome).text, 52);
  const localLines = visualLineCount(row.getCell(COL.espaco).text, 30);
  const equipmentLines = visualLineCount(
    row.getCell(COL.equipamento).text,
    42,
  );
  const teamLines = visualLineCount(row.getCell(COL.equipe).text, 24);
  const lines = Math.max(nameLines, localLines, equipmentLines, teamLines, 2);

  // ExcelJS usa pontos. A faixa abaixo deixa descrições longas completamente
  // visíveis sem criar linhas gigantes para textos curtos.
  return Math.min(180, Math.max(64, 24 + lines * 20));
}

function copyHeaderStyle(
  source: import("exceljs").Cell,
  target: import("exceljs").Cell,
) {
  target.fill = source.fill;
  target.font = source.font;
  target.border = source.border;
  target.alignment = {
    ...(source.alignment ?? {}),
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };
}

function extendMergedRowToPriority(
  sheet: import("exceljs").Worksheet,
  rowNumber: number,
) {
  try {
    sheet.unMergeCells(`A${rowNumber}:J${rowNumber}`);
  } catch {
    // A linha pode não estar mesclada; nesse caso apenas seguimos.
  }
  try {
    sheet.mergeCells(`A${rowNumber}:K${rowNumber}`);
  } catch {
    // Evita interromper a exportação por uma mesclagem preexistente atípica.
  }
}

function stylePriorityCell(
  cell: import("exceljs").Cell,
  level: ReturnType<typeof classifyPriority>["level"],
) {
  const palette = priorityPalette(level);
  cell.value = level;
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: palette.bg },
  };
  cell.font = {
    name: "Aptos ExtraBold",
    bold: true,
    size: 10,
    color: { argb: palette.text },
  };
  cell.alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };
  cell.border = {
    top: { style: "thin", color: { argb: COLORS.border } },
    bottom: { style: "thin", color: { argb: COLORS.border } },
    left: { style: "thin", color: { argb: COLORS.border } },
    right: { style: "thin", color: { argb: COLORS.border } },
  };
}

function restoreCorrectiveVisual(
  row: import("exceljs").Row,
  stripe: string,
) {
  const team = row.getCell(COL.equipe).text.trim() as Equipe;
  const teamHex = EQUIPE_COLOR[team] ?? "#64748B";

  for (let column = 1; column <= COL.equipamento; column += 1) {
    const cell = row.getCell(column);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: stripe },
    };
    cell.font = {
      ...(cell.font ?? {}),
      color: { argb: COLORS.text },
    };

    if (column === COL.equipe) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: mixWithWhite(teamHex) },
      };
      cell.font = {
        ...(cell.font ?? {}),
        color: { argb: argbFromHex(teamHex) },
        bold: true,
      };
    }

    if (
      column === COL.ativo &&
      normalize(cell.text) === "ATIVO NAO LOCALIZADO"
    ) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.dangerBg },
      };
      cell.font = {
        ...(cell.font ?? {}),
        color: { argb: COLORS.dangerText },
        bold: true,
      };
    }
  }

  // Conforme solicitado: somente OS e a célula "Corretiva" ficam amarelas.
  for (const column of [COL.os, COL.atividade]) {
    const cell = row.getCell(column);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.correctiveBg },
    };
    cell.font = {
      ...(cell.font ?? {}),
      name: "Aptos ExtraBold",
      bold: true,
      color: { argb: COLORS.correctiveText },
    };
  }
}

function prepareSheet(sheet: import("exceljs").Worksheet) {
  const isProgram = sheet.name === "PROGRAMAÇÃO";
  const isTeam = sheet.name.startsWith("IMP ");
  if (!isProgram && !isTeam) return;

  sheet.pageSetup.blackAndWhite = false;
  sheet.pageSetup.fitToPage = true;
  sheet.pageSetup.fitToWidth = 1;
  sheet.pageSetup.fitToHeight = 0;

  // Larguras refinadas para priorizar leitura integral da descrição.
  sheet.getColumn(COL.os).width = 15;
  sheet.getColumn(COL.nome).width = 72;
  sheet.getColumn(COL.predio).width = 16;
  sheet.getColumn(COL.andar).width = 15;
  sheet.getColumn(COL.espaco).width = 38;
  sheet.getColumn(COL.atividade).width = 16;
  sheet.getColumn(COL.sla).width = 18;
  sheet.getColumn(COL.equipe).width = 30;
  sheet.getColumn(COL.ativo).width = 30;
  sheet.getColumn(COL.equipamento).width = 50;
  sheet.getColumn(COL.prioridade).width = 18;

  extendMergedRowToPriority(sheet, 1);

  let firstHeaderRow = 0;
  let lastDataRow = 1;

  sheet.eachRow({ includeEmpty: false }, (row) => {
    const firstText = row.getCell(1).text.trim();
    const activityText = normalize(row.getCell(COL.atividade).text);

    if (isProgram && DAY_NAMES.some((day) => firstText.startsWith(day))) {
      extendMergedRowToPriority(sheet, row.number);
      return;
    }

    if (firstText === "Nenhuma OS programada para este dia.") {
      extendMergedRowToPriority(sheet, row.number);
      return;
    }

    if (activityText === "ATIVIDADE") {
      firstHeaderRow ||= row.number;
      const priorityHeader = row.getCell(COL.prioridade);
      copyHeaderStyle(row.getCell(COL.equipamento), priorityHeader);
      priorityHeader.value = "Prioridade";
      row.height = Math.max(row.height || 0, 30);
      return;
    }

    if (!isDataRow(row)) return;
    lastDataRow = Math.max(lastDataRow, row.number);

    row.height = intelligentRowHeight(row);
    for (let column = 1; column <= COL.equipamento; column += 1) {
      const cell = row.getCell(column);
      cell.alignment = {
        ...(cell.alignment ?? {}),
        vertical: "middle",
        wrapText: true,
      };
    }

    if (isCorrectiveRow(row)) {
      const stripe = row.number % 2 === 0 ? COLORS.white : COLORS.stripe;
      restoreCorrectiveVisual(row, stripe);
      stylePriorityCell(
        row.getCell(COL.prioridade),
        priorityForRow(row).level,
      );
    } else {
      const priorityCell = row.getCell(COL.prioridade);
      priorityCell.value = null;
      priorityCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {
          argb: row.number % 2 === 0 ? COLORS.white : COLORS.stripe,
        },
      };
      priorityCell.border = {
        top: { style: "thin", color: { argb: COLORS.border } },
        bottom: { style: "thin", color: { argb: COLORS.border } },
        left: { style: "thin", color: { argb: COLORS.border } },
        right: { style: "thin", color: { argb: COLORS.border } },
      };
      priorityCell.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      };
    }
  });

  if (firstHeaderRow) {
    sheet.autoFilter = `A${firstHeaderRow}:K${firstHeaderRow}`;
  }
  sheet.pageSetup.printArea = `A1:K${Math.max(lastDataRow, sheet.rowCount)}`;
}

/**
 * Pós-processamento da programação semanal:
 * - 2 corretivas continuam no fim de cada dia (ordem definida no gerador);
 * - amarelo somente em OS e Atividade=Corretiva;
 * - coluna Prioridade;
 * - altura inteligente para exibir Nome/Local/Equipamento completos;
 * - impressão colorida por padrão.
 */
export async function polishWeeklyProgramacao(blob: Blob): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());

  workbook.worksheets.forEach(prepareSheet);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME });
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
  if (!value || typeof value !== "object" || !("argb" in value)) {
    return fallback;
  }
  const argb = String((value as { argb?: string }).argb ?? "");
  return argb.length >= 6 ? `#${argb.slice(-6)}` : fallback;
}

function renderRow(
  row: import("exceljs").Row,
  className: string,
  merged = false,
  firstOverride?: string,
): string {
  const cells: string[] = [];
  for (let column = 1; column <= COL.prioridade; column += 1) {
    if (merged && column > 1) continue;
    const cell = row.getCell(column);
    const fill =
      cell.fill && "fgColor" in cell.fill ? cell.fill.fgColor : undefined;
    const background = excelColor(fill, "#FFFFFF");
    const color = excelColor(cell.font?.color, "#162231");
    const align =
      cell.alignment?.horizontal ??
      ([COL.nome, COL.espaco, COL.equipe, COL.ativo, COL.equipamento].includes(
        column as 2 | 5 | 8 | 9 | 10,
      )
        ? "left"
        : "center");
    const value =
      column === 1 && firstOverride !== undefined
        ? firstOverride
        : cell.text;

    cells.push(
      `<td${merged ? ` colspan="${COL.prioridade}"` : ""} style="background:${background};color:${color};text-align:${align};font-weight:${cell.font?.bold ? 800 : 500}">${escapeHtml(value)}</td>`,
    );
  }
  return `<tr class="${className}">${cells.join("")}</tr>`;
}

function compareNatural(a: string, b: string) {
  return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}

/** Impressão HTML já usando a planilha pós-processada com 11 colunas. */
export async function printWeeklyProgramacaoColor(blob: Blob): Promise<void> {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("O navegador bloqueou a janela de impressão.");
  }

  printWindow.opener = null;
  printWindow.document.write(
    "<p style='font-family:Arial;padding:24px'>Preparando impressão colorida...</p>",
  );

  try {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    const sheet = workbook.getWorksheet("PROGRAMAÇÃO");
    if (!sheet) throw new Error("A aba PROGRAMAÇÃO não foi encontrada.");

    const titleRow = sheet.getRow(1);
    const days: Array<{
      band: import("exceljs").Row;
      header: import("exceljs").Row;
      rows: import("exceljs").Row[];
    }> = [];

    let band: import("exceljs").Row | undefined;
    let header: import("exceljs").Row | undefined;
    let rows: import("exceljs").Row[] = [];

    const flush = () => {
      if (band && header) days.push({ band, header, rows });
    };

    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (row.number === 1) return;
      const first = row.getCell(1).text;
      if (DAY_NAMES.some((day) => first.startsWith(day))) {
        flush();
        band = row;
        header = undefined;
        rows = [];
        return;
      }
      if (!band) return;
      if (!header && normalize(row.getCell(COL.atividade).text) === "ATIVIDADE") {
        header = row;
        return;
      }
      if (header && isDataRow(row)) rows.push(row);
    });
    flush();

    const discoveredTeams = new Set(
      days.flatMap((day) =>
        day.rows
          .map((row) => row.getCell(COL.equipe).text.trim())
          .filter(Boolean),
      ),
    );
    const teams = [
      ...EQUIPES_ORDEM.filter((team) => discoveredTeams.has(team)),
      ...[...discoveredTeams]
        .filter((team) => !EQUIPES_ORDEM.includes(team as Equipe))
        .sort(compareNatural),
    ];

    const sections: string[] = [];
    for (const team of teams) {
      for (const day of days) {
        const teamRows = day.rows.filter(
          (row) => row.getCell(COL.equipe).text.trim() === team,
        );
        if (teamRows.length === 0) continue;

        const correctiveCount = teamRows.filter(isCorrectiveRow).length;
        const dayParts = day.band.getCell(1).text.split(" • ");
        const dayLabel = dayParts.slice(0, 2).join(" • ");
        const titleLabel = `${titleRow.getCell(1).text} • EQUIPE ${team}`;
        const bandLabel = `${dayLabel} • ${teamRows.length} OS (${correctiveCount} CORRETIVAS) • ${team}`;

        sections.push(`<section class="day-sheet"><table>
          <thead>
            ${renderRow(titleRow, "title-row", true, titleLabel)}
            ${renderRow(day.band, "day-band", true, bandLabel)}
            ${renderRow(day.header, "column-header")}
          </thead>
          <tbody>${teamRows.map((row) => renderRow(row, "data-row")).join("")}</tbody>
        </table></section>`);
      }
    }

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Programação semanal</title><style>
      @page { size: A4 landscape; margin: 5mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      html, body { margin: 0; background: #fff; font-family: Aptos, Arial, sans-serif; color: #162231; }
      .day-sheet { break-inside: auto; page-break-inside: auto; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      td { border: 1px solid #DDE5EC; padding: 5px; font-size: 7pt; line-height: 1.25; vertical-align: middle; overflow-wrap: anywhere; white-space: normal; }
      .title-row td { padding: 6px; font-size: 12pt; }
      .day-band td { padding: 5px; font-size: 8.4pt; }
      .column-header td { padding: 4px; font-size: 7pt; }
      .data-row { height: 68px; }
      .data-row td:nth-child(2) { font-size: 7.7pt; line-height: 1.28; }
      td:nth-child(1){width:6%} td:nth-child(2){width:25%} td:nth-child(3){width:7%} td:nth-child(4){width:6%}
      td:nth-child(5){width:11%} td:nth-child(6){width:7%} td:nth-child(7){width:7%} td:nth-child(8){width:9%}
      td:nth-child(9){width:7%} td:nth-child(10){width:8%} td:nth-child(11){width:7%}
      @media print { html, body, table, thead, tbody, tr, td { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
    </style></head><body>${sections.join("")}</body></html>`;

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
