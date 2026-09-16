import type { OsCacheRow } from "./db";
import {
  BACKORDER_HEX,
  classifyPriority,
  PRIORITY_HEX,
  type PriorityLevel,
} from "./priority-classifier";

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function priorityLabel(level: PriorityLevel, score: number) {
  return `${level} · ${score}`;
}

function dateLabel(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("pt-BR");
}

export async function generateProgramacaoPDF(
  osList: OsCacheRow[],
  equipeFiltro: string,
) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const generatedAt = new Date();
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const navy: [number, number, number] = [7, 20, 38];
  const navySoft: [number, number, number] = [15, 35, 58];
  const slate: [number, number, number] = [100, 116, 139];
  const red: [number, number, number] = [220, 38, 38];
  const indigo = hexToRgb(BACKORDER_HEX.bg);

  doc.setFillColor(...navy);
  doc.rect(0, 0, 297, 34, "F");
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 34, 297, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("APONT AUTO", 14, 15);
  doc.setFontSize(10);
  doc.text("CORRETIVAS · FILA OPERACIONAL PRIORIZADA", 14, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Equipe/filtro: ${equipeFiltro}`, 14, 29);
  doc.text(`Gerado em ${generatedAt.toLocaleString("pt-BR")}`, 283, 29, { align: "right" });

  const priorities = osList.map((item) => classifyPriority(item, generatedAt));
  const critical = priorities.filter((item) => item.level === "CRÍTICA").length;
  const high = priorities.filter((item) => item.level === "ALTA").length;
  const backorders = priorities.filter((item) => item.isBackorder).length;
  const requestedMaterial = osList.filter(
    (item) => String(item.material_status ?? "").toLowerCase() === "solicitado",
  ).length;

  const cards = [
    ["TOTAL", osList.length, navySoft],
    ["CRÍTICAS", critical, hexToRgb(PRIORITY_HEX.CRÍTICA.bg)],
    ["ALTAS", high, hexToRgb(PRIORITY_HEX.ALTA.bg)],
    ["BACKORDER", backorders, indigo],
    ["AGUARD. MATERIAL", requestedMaterial, [180, 83, 9] as [number, number, number]],
  ] as const;
  cards.forEach(([label, value, color], index) => {
    const x = 14 + index * 54;
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, 41, 50, 16, 2, 2, "FD");
    doc.setTextColor(...slate);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    doc.text(label, x + 4, 47);
    doc.setTextColor(...color);
    doc.setFontSize(11.5);
    doc.text(String(value), x + 4, 54);
  });

  const tableData = osList.map((o) => {
    const priority = classifyPriority(o, generatedAt);
    return [
      o.numero_os || "—",
      priorityLabel(priority.level, priority.score),
      priority.isBackorder ? "BACKORDER" : "—",
      priority.reasons.slice(0, 3).join(" · "),
      o.equipe || "Sem equipe",
      `${o.predio || "—"} / ${o.andar || "—"}`,
      o.local || "—",
      o.nome_os || "Sem descrição",
      dateLabel(o.data_criacao),
      priority.daysToDue == null
        ? "—"
        : priority.daysToDue < 0
          ? `${Math.abs(priority.daysToDue)}d vencido`
          : `${priority.daysToDue}d`,
    ];
  });

  autoTable(doc, {
    startY: 63,
    head: [["OS", "PRIORIDADE", "TIPO", "MOTIVO", "EQUIPE", "PRÉDIO / ANDAR", "LOCAL", "DESCRIÇÃO DO SERVIÇO", "ABERTURA", "SLA"]],
    body: tableData,
    theme: "grid",
    margin: { left: 8, right: 8, bottom: 13 },
    showHead: "everyPage",
    headStyles: {
      fillColor: navy,
      textColor: [255, 255, 255],
      fontSize: 7,
      fontStyle: "bold",
      halign: "center",
      cellPadding: 2.2,
      minCellHeight: 8,
    },
    columnStyles: {
      0: { halign: "center", fontStyle: "bold", fontSize: 8.5, cellWidth: 14 },
      1: { halign: "center", fontStyle: "bold", cellWidth: 21 },
      2: { halign: "center", fontStyle: "bold", cellWidth: 18 },
      3: { halign: "left", cellWidth: 35 },
      4: { halign: "center", cellWidth: 22 },
      5: { halign: "left", fontStyle: "bold", fontSize: 8.4, cellWidth: 28 },
      6: { halign: "left", fontStyle: "bold", fontSize: 8.4, cellWidth: 33 },
      7: { halign: "left", fontStyle: "bold", fontSize: 9, cellWidth: 74 },
      8: { halign: "center", cellWidth: 17 },
      9: { halign: "center", cellWidth: 15 },
    },
    styles: {
      font: "helvetica",
      fontSize: 7.2,
      cellPadding: 2.2,
      valign: "middle",
      overflow: "linebreak",
      minCellHeight: 10,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const source = osList[data.row.index];
      if (!source) return;
      const priority = classifyPriority(source, generatedAt);
      if (data.column.index === 1) {
        const palette = PRIORITY_HEX[priority.level];
        data.cell.styles.fillColor = hexToRgb(palette.bg);
        data.cell.styles.textColor = hexToRgb(palette.fg);
        data.cell.styles.fontStyle = "bold";
      }
      if (data.column.index === 2 && priority.isBackorder) {
        data.cell.styles.fillColor = indigo;
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
      }
      if (data.column.index === 9 && priority.daysToDue != null && priority.daysToDue < 0) {
        data.cell.styles.textColor = red;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(8, 198, 289, 198);
    doc.setFontSize(7);
    doc.setTextColor(...slate);
    doc.text("Apont Auto · Prioridade recalculada na geração do relatório", 10, 203);
    doc.text(`Página ${i} de ${pageCount}`, 287, 203, { align: "right" });
  }

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `corretivas_${equipeFiltro.toLowerCase().replace(/\s+/g, "_")}_${generatedAt.toISOString().slice(0, 10)}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}