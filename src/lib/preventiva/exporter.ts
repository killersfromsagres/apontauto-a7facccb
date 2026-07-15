export { downloadBlob } from "@/lib/download";
import { TEAM_COLORS, type Team, type ProcessedOS } from "./processor";
import { scheduleOS, type ScheduledOS } from "./scheduler";

const hexNoHash = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();

const HEADERS = [
  "Ordem de Serviço",
  "Nome OS",
  "Prédio",
  "Andar",
  "Local",
  "Tipo",
  "Equipe",
  "Data SLA",
  "Data Programada",
  "Início",
  "Fim",
  "Ativo",
  "Equipamento",
];

export async function generateProgramacaoWorkbook(
  ordered: ProcessedOS[],
): Promise<Blob> {
  const scheduled = scheduleOS(ordered);
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistema de Apontamento";
  wb.created = new Date();

  const ws = wb.addWorksheet("PROGRAMAÇÃO", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = [
    { key: "os", width: 14 },
    { key: "nome", width: 40 },
    { key: "predio", width: 12 },
    { key: "andar", width: 10 },
    { key: "local", width: 28 },
    { key: "tipo", width: 12 },
    { key: "equipe", width: 18 },
    { key: "sla", width: 14 },
    { key: "data", width: 14 },
    { key: "ini", width: 8 },
    { key: "fim", width: 8 },
    { key: "ativo", width: 18 },
    { key: "equip", width: 22 },
  ];

  // Header row
  const header = ws.addRow(HEADERS);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { vertical: "middle", horizontal: "center" };
  header.height = 26;
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF334155" } },
      bottom: { style: "thin", color: { argb: "FF334155" } },
      left: { style: "thin", color: { argb: "FF334155" } },
      right: { style: "thin", color: { argb: "FF334155" } },
    };
  });

  // Sort output: date, team, start
  scheduled.sort(
    (a, b) =>
      a.scheduledDate.localeCompare(b.scheduledDate) ||
      a.equipe.localeCompare(b.equipe) ||
      a.scheduledStart.localeCompare(b.scheduledStart),
  );

  for (const os of scheduled) {
    const row = ws.addRow([
      os.ordemServico,
      os.nomeOS,
      os.predio,
      os.andar,
      os.local,
      os.tipo,
      os.equipe,
      os.dataSLA ? new Date(os.dataSLA) : "",
      new Date(os.scheduledDate),
      os.scheduledStart,
      os.scheduledEnd,
      os.ativo,
      os.equipamento,
    ]);

    const color = TEAM_COLORS[os.equipe as Team] || "#6B7280";
    const argb = hexNoHash(color);
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb },
      };
      cell.font = {
        color: { argb: needsDarkText(color) ? "FF0F172A" : "FFFFFFFF" },
        bold: false,
      };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
      cell.border = {
        top: { style: "hair", color: { argb: "FFCBD5E1" } },
        bottom: { style: "hair", color: { argb: "FFCBD5E1" } },
      };
    });

    // Date formats
    const slaCell = row.getCell(8);
    if (slaCell.value instanceof Date) slaCell.numFmt = "dd/mm/yyyy";
    const dateCell = row.getCell(9);
    if (dateCell.value instanceof Date) dateCell.numFmt = "dd/mm/yyyy";
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: HEADERS.length },
  };

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function needsDarkText(hex: string): boolean {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type { ScheduledOS };
