import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { parseFuelingNotes } from "@/features/fleet/fueling-meta";
import { vehicleTitle, type FleetVehicle, type Fueling } from "@/features/fleet/api";

const COLORS = {
  ink: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  line: [226, 232, 240] as [number, number, number],
  panel: [248, 250, 252] as [number, number, number],
  accent: [15, 118, 110] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const decimal = (value: number, digits = 2) =>
  value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const fuelLabel = (value: string) => {
  const map: Record<string, string> = {
    gasolina: "Gasolina",
    etanol: "Etanol",
    diesel: "Diesel",
    gnv: "GNV",
    arla: "ARLA",
  };
  return map[value] ?? value;
};

const paymentLabel = (value?: string | null) => {
  const map: Record<string, string> = {
    cartao: "Cartão",
    vale: "Vale",
    dinheiro: "Dinheiro",
    pix: "PIX",
    faturado: "Faturado",
  };
  return value ? map[value] ?? value : "—";
};

function localDateLabel(date: string, time?: string) {
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date);
  const label = Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("pt-BR");
  return time ? `${label} ${time}` : label;
}

function vehicleLabel(vehicle?: FleetVehicle) {
  if (!vehicle) return "Veículo removido";
  return `${vehicle.prefix} · ${vehicle.plate ?? "sem placa"} · ${vehicleTitle(vehicle)}`;
}

export function exportFuelingsPdf({
  rows,
  vehicles,
  filterLabel = "Toda a frota",
}: {
  rows: Fueling[];
  vehicles: FleetVehicle[];
  filterLabel?: string;
}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const totalCost = rows.reduce((sum, row) => sum + row.total_cost, 0);
  const totalLiters = rows.reduce((sum, row) => sum + row.liters, 0);
  const average = totalLiters > 0 ? totalCost / totalLiters : 0;
  const receipts = rows.filter((row) => Boolean(parseFuelingNotes(row.notes).meta.receiptPath)).length;
  const generatedAt = new Date();

  // Cabeçalho executivo.
  doc.setFillColor(...COLORS.ink);
  doc.roundedRect(margin, 10, pageWidth - margin * 2, 27, 3, 3, "F");
  doc.setFillColor(...COLORS.accent);
  doc.roundedRect(margin + 5, 16, 7, 7, 1.8, 1.8, "F");
  doc.setDrawColor(...COLORS.white);
  doc.setLineWidth(0.45);
  doc.line(margin + 7.2, 18.2, margin + 9.8, 20.8);
  doc.line(margin + 9.8, 18.2, margin + 7.2, 20.8);

  doc.setTextColor(...COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("APONT AUTO", margin + 16, 19.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.text("RELATÓRIO DE ABASTECIMENTOS", margin + 16, 25);
  doc.setTextColor(203, 213, 225);
  doc.setFontSize(7.2);
  doc.text(`Escopo: ${filterLabel}`, margin + 16, 30.5);
  doc.text(
    `Emitido em ${generatedAt.toLocaleDateString("pt-BR")} às ${generatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
    pageWidth - margin - 5,
    30.5,
    { align: "right" },
  );

  const metrics = [
    ["ABASTECIMENTOS", String(rows.length)],
    ["VOLUME TOTAL", `${decimal(totalLiters, 2)} L`],
    ["VALOR TOTAL", money(totalCost)],
    ["PREÇO MÉDIO", average > 0 ? `${money(average)}/L` : "—"],
    ["COMPROVANTES", `${receipts}/${rows.length}`],
  ];
  const metricsTop = 42;
  const gap = 3;
  const metricWidth = (pageWidth - margin * 2 - gap * (metrics.length - 1)) / metrics.length;

  metrics.forEach(([label, value], index) => {
    const x = margin + index * (metricWidth + gap);
    doc.setFillColor(...COLORS.panel);
    doc.setDrawColor(...COLORS.line);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, metricsTop, metricWidth, 17, 2, 2, "FD");
    doc.setTextColor(...COLORS.muted);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    doc.text(label, x + 4, metricsTop + 5.3);
    doc.setTextColor(...COLORS.ink);
    doc.setFontSize(10.3);
    doc.text(value, x + 4, metricsTop + 12.2);
  });

  const body = rows.map((row) => {
    const vehicle = vehicleById.get(row.vehicle_id);
    const { meta, notes } = parseFuelingNotes(row.notes);
    const receipt = meta.receiptPath ? "Anexado" : "—";
    const extra = [row.invoice_number ? `NF ${row.invoice_number}` : "", notes].filter(Boolean).join(" · ");

    return [
      localDateLabel(row.fueled_at, meta.time),
      vehicleLabel(vehicle),
      row.driver_name || "—",
      fuelLabel(row.fuel_type),
      `${decimal(row.liters, 2)} L`,
      money(row.total_cost),
      row.liters > 0 ? money(row.total_cost / row.liters) : "—",
      `${Math.round(row.odometer_km).toLocaleString("pt-BR")} km`,
      row.station || "—",
      paymentLabel(row.payment_method),
      receipt,
      extra || "—",
    ];
  });

  autoTable(doc, {
    startY: 64,
    margin: { left: margin, right: margin, bottom: 13 },
    head: [[
      "Data / hora",
      "Veículo",
      "Condutor",
      "Combustível",
      "Litros",
      "Valor",
      "R$/L",
      "Hodômetro",
      "Posto",
      "Pagamento",
      "Comprovante",
      "Informações",
    ]],
    body,
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 6.7,
      textColor: COLORS.ink,
      cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 },
      lineColor: COLORS.line,
      lineWidth: { bottom: 0.18 },
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: COLORS.ink,
      textColor: COLORS.white,
      fontStyle: "bold",
      fontSize: 6.4,
      minCellHeight: 8,
      lineWidth: 0,
    },
    alternateRowStyles: { fillColor: COLORS.panel },
    columnStyles: {
      0: { cellWidth: 19 },
      1: { cellWidth: 38 },
      2: { cellWidth: 23 },
      3: { cellWidth: 17 },
      4: { cellWidth: 15, halign: "right" },
      5: { cellWidth: 20, halign: "right" },
      6: { cellWidth: 17, halign: "right" },
      7: { cellWidth: 20, halign: "right" },
      8: { cellWidth: 24 },
      9: { cellWidth: 19 },
      10: { cellWidth: 18, halign: "center" },
      11: { cellWidth: "auto" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 10 && data.cell.raw === "Anexado") {
        data.cell.styles.textColor = COLORS.accent;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...COLORS.line);
    doc.setLineWidth(0.25);
    doc.line(margin, pageHeight - 9, pageWidth - margin, pageHeight - 9);
    doc.setTextColor(...COLORS.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text("PCM · Frota e Abastecimento · Apont Auto", margin, pageHeight - 5.2);
    doc.text(`Página ${page} de ${pages}`, pageWidth - margin, pageHeight - 5.2, { align: "right" });
  }

  const stamp = `${generatedAt.getFullYear()}-${String(generatedAt.getMonth() + 1).padStart(2, "0")}-${String(generatedAt.getDate()).padStart(2, "0")}`;
  doc.save(`relatorio-abastecimentos-${stamp}.pdf`);
}
