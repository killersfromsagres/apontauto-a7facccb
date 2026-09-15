import ExcelJS from "exceljs";
import type { RondaCalha } from "./types";

const HEADER_ROW = 9;

function normalizeMonth(value?: string | null) {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  return new Date().toISOString().slice(0, 7);
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function businessDays(monthRef: string) {
  const [year, month] = monthRef.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const dates: Date[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month - 1, day);
    const weekDay = date.getDay();
    if (weekDay !== 0 && weekDay !== 6) dates.push(date);
  }
  return dates;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("pt-BR");
}

function dayName(date: Date) {
  const value = date.toLocaleDateString("pt-BR", { weekday: "long" });
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function saveWorkbook(buffer: ExcelJS.Buffer, filename: string) {
  const blob = new Blob([buffer as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function generateRondasProgramacaoExcel(rondas: RondaCalha[]) {
  if (!rondas.length) throw new Error("Não há rondas pendentes para programar.");

  const sorted = [...rondas].sort((a, b) => {
    const building = (a.predio || "").localeCompare(b.predio || "", "pt-BR", {
      numeric: true,
      sensitivity: "base",
    });
    if (building !== 0) return building;
    return (a.preventiva_nome || "").localeCompare(b.preventiva_nome || "", "pt-BR", {
      numeric: true,
      sensitivity: "base",
    });
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ApontAuto";
  workbook.company = "ApontAuto";
  workbook.subject = "Programação de Rondas de Calhas";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Programação", {
    views: [{ state: "frozen", ySplit: HEADER_ROW }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  sheet.columns = [
    { key: "data", width: 16 },
    { key: "dia", width: 19 },
    { key: "predio", width: 22 },
    { key: "atividade", width: 48 },
    { key: "mes", width: 20 },
    { key: "status", width: 16 },
    { key: "responsavel", width: 24 },
    { key: "turno", width: 16 },
    { key: "execucao", width: 18 },
    { key: "observacoes", width: 34 },
  ];

  sheet.mergeCells("A1:J2");
  const title = sheet.getCell("A1");
  title.value = "PROGRAMAÇÃO DE RONDAS DE CALHAS";
  title.font = { name: "Aptos Display", size: 20, bold: true, color: { argb: "FFFFFFFF" } };
  title.alignment = { vertical: "middle", horizontal: "left" };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };

  sheet.mergeCells("A3:J3");
  const subtitle = sheet.getCell("A3");
  subtitle.value = "Planejamento operacional • inspeções preventivas de calhas por prédio";
  subtitle.font = { name: "Aptos", size: 10, color: { argb: "FFCBD5E1" }, italic: true };
  subtitle.alignment = { vertical: "middle", horizontal: "left" };
  subtitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };

  const buildings = new Set(sorted.map((item) => item.predio).filter(Boolean));
  const months = Array.from(new Set(sorted.map((item) => normalizeMonth(item.mes_referencia))));
  const summary = [
    ["TOTAL DE RONDAS", sorted.length],
    ["PRÉDIOS", buildings.size],
    ["PERÍODO", months.map(monthLabel).join(" • ")],
    ["GERADO EM", new Date().toLocaleString("pt-BR")],
  ];

  summary.forEach(([label, value], index) => {
    const startColumn = index === 0 ? "A" : index === 1 ? "C" : index === 2 ? "E" : "H";
    const endColumn = index === 0 ? "B" : index === 1 ? "D" : index === 2 ? "G" : "J";
    sheet.mergeCells(`${startColumn}5:${endColumn}6`);
    const cell = sheet.getCell(`${startColumn}5`);
    cell.value = `${label}\n${value}`;
    cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFF8FAFC" } };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    cell.border = {
      top: { style: "thin", color: { argb: "FF334155" } },
      left: { style: "thin", color: { argb: "FF334155" } },
      bottom: { style: "thin", color: { argb: "FF334155" } },
      right: { style: "thin", color: { argb: "FF334155" } },
    };
  });

  const headers = [
    "DATA PROGRAMADA",
    "DIA",
    "PRÉDIO",
    "ATIVIDADE / PREVENTIVA",
    "MÊS REFERÊNCIA",
    "STATUS",
    "RESPONSÁVEL",
    "TURNO",
    "EXECUÇÃO",
    "OBSERVAÇÕES",
  ];
  const header = sheet.getRow(HEADER_ROW);
  headers.forEach((value, index) => {
    const cell = header.getCell(index + 1);
    cell.value = value;
    cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    cell.border = {
      top: { style: "thin", color: { argb: "FF0B4F49" } },
      left: { style: "thin", color: { argb: "FF0B4F49" } },
      bottom: { style: "thin", color: { argb: "FF0B4F49" } },
      right: { style: "thin", color: { argb: "FF0B4F49" } },
    };
  });
  header.height = 30;

  const monthIndexes = new Map<string, number>();
  sorted.forEach((ronda, index) => {
    const monthRef = normalizeMonth(ronda.mes_referencia);
    const dates = businessDays(monthRef);
    const sequence = monthIndexes.get(monthRef) ?? 0;
    const plannedDate = dates[sequence % Math.max(1, dates.length)] ?? new Date();
    monthIndexes.set(monthRef, sequence + 1);

    const row = sheet.addRow({
      data: formatDate(plannedDate),
      dia: dayName(plannedDate),
      predio: ronda.predio || "Não informado",
      atividade: ronda.preventiva_nome || "Ronda preventiva de calhas",
      mes: monthLabel(monthRef),
      status: "PENDENTE",
      responsavel: "",
      turno: "A definir",
      execucao: "☐ Não realizada",
      observacoes: "",
    });

    row.height = 34;
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cell.font = { name: "Aptos", size: 9, color: { argb: "FF111827" } };
      cell.alignment = {
        vertical: "middle",
        horizontal: [1, 2, 5, 6, 8, 9].includes(columnNumber) ? "center" : "left",
        wrapText: true,
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: index % 2 === 0 ? "FFF8FAFC" : "FFF1F5F9" },
      };
      cell.border = {
        bottom: { style: "hair", color: { argb: "FFCBD5E1" } },
        right: { style: "hair", color: { argb: "FFE2E8F0" } },
      };
    });

    const statusCell = row.getCell(6);
    statusCell.font = { name: "Aptos", size: 9, bold: true, color: { argb: "FF92400E" } };
    statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
    statusCell.dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: ['"PENDENTE,PROGRAMADA,EM EXECUÇÃO,CONCLUÍDA"'],
    };

    row.getCell(8).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Manhã,Tarde,Integral,A definir"'],
    };
    row.getCell(9).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: ['"☐ Não realizada,◐ Em andamento,☑ Realizada"'],
    };
  });

  const lastRow = sheet.rowCount;
  sheet.autoFilter = { from: `A${HEADER_ROW}`, to: `J${lastRow}` };
  sheet.pageSetup.printArea = `A1:J${lastRow}`;
  sheet.headerFooter.oddFooter = "&LApontAuto • Rondas de Calhas&C&P de &N&RDocumento operacional";

  const summarySheet = workbook.addWorksheet("Resumo por Prédio", {
    views: [{ state: "frozen", ySplit: 4 }],
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  summarySheet.columns = [
    { header: "PRÉDIO", key: "predio", width: 30 },
    { header: "RONDAS PROGRAMADAS", key: "total", width: 24 },
    { header: "MÊS / REFERÊNCIA", key: "mes", width: 28 },
  ];
  summarySheet.mergeCells("A1:C2");
  const summaryTitle = summarySheet.getCell("A1");
  summaryTitle.value = "RESUMO DA PROGRAMAÇÃO POR PRÉDIO";
  summaryTitle.font = { name: "Aptos Display", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  summaryTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
  summaryTitle.alignment = { vertical: "middle", horizontal: "left" };

  const grouped = new Map<string, { total: number; months: Set<string> }>();
  sorted.forEach((ronda) => {
    const key = ronda.predio || "Não informado";
    const current = grouped.get(key) ?? { total: 0, months: new Set<string>() };
    current.total += 1;
    current.months.add(monthLabel(normalizeMonth(ronda.mes_referencia)));
    grouped.set(key, current);
  });

  const summaryHeader = summarySheet.getRow(4);
  summaryHeader.values = ["PRÉDIO", "RONDAS PROGRAMADAS", "MÊS / REFERÊNCIA"];
  summaryHeader.eachCell((cell) => {
    cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" }))
    .forEach(([predio, value], index) => {
      const row = summarySheet.addRow([predio, value.total, Array.from(value.months).join(" • ")]);
      row.height = 28;
      row.eachCell((cell, col) => {
        cell.font = { name: "Aptos", size: 9, color: { argb: "FF111827" } };
        cell.alignment = { vertical: "middle", horizontal: col === 2 ? "center" : "left", wrapText: true };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: index % 2 === 0 ? "FFF8FAFC" : "FFF1F5F9" },
        };
        cell.border = { bottom: { style: "hair", color: { argb: "FFCBD5E1" } } };
      });
    });

  summarySheet.autoFilter = { from: "A4", to: `C${summarySheet.rowCount}` };

  const buffer = await workbook.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  saveWorkbook(buffer, `PROGRAMACAO_RONDAS_CALHAS_${stamp}.xlsx`);
}
