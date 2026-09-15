import type { OsCacheRow } from "./db";
import {
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
  return `${level} (${score})`;
}

export async function generateProgramacaoPDF(
  osList: OsCacheRow[],
  equipeFiltro: string,
) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const generatedAt = new Date();

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const primaryColor: [number, number, number] = [15, 23, 42];
  const amberColor: [number, number, number] = [245, 158, 11];
  const redColor: [number, number, number] = [239, 68, 68];

  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 297, 35, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("APONT AUTO", 14, 16);
  doc.setFontSize(10);
  doc.text("PROGRAMAÇÃO DE CORRETIVAS · PRIORIDADE OPERACIONAL", 14, 23);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`EQUIPE: ${equipeFiltro.toUpperCase()}`, 14, 29);
  doc.text(`GERADO EM: ${generatedAt.toLocaleString("pt-BR")}`, 216, 29);

  const priorities = osList.map((item) => classifyPriority(item, generatedAt));
  const critical = priorities.filter((item) => item.level === "CRÍTICA").length;
  const high = priorities.filter((item) => item.level === "ALTA").length;
  const medium = priorities.filter((item) => item.level === "MÉDIA").length;
  const materialRequested = osList.filter(
    (item) => String(item.material_status ?? "").toLowerCase() === "solicitado",
  ).length;

  const cards = [
    ["TOTAL", osList.length, primaryColor],
    ["CRÍTICA", critical, hexToRgb(PRIORITY_HEX.CRÍTICA.bg)],
    ["ALTA", high, hexToRgb(PRIORITY_HEX.ALTA.bg)],
    ["MÉDIA", medium, hexToRgb(PRIORITY_HEX.MÉDIA.bg)],
    ["MATERIAL", materialRequested, amberColor],
  ] as const;
  const cardWidth = 50;
  cards.forEach(([label, value, color], index) => {
    const x = 14 + index * 54;
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, 42, cardWidth, 16, 2, 2, "FD");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.text(label, x + 4, 48);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.setFontSize(11);
    doc.text(String(value), x + 4, 55);
  });

  const tableData = osList.map((o) => {
    const priority = classifyPriority(o, generatedAt);
    const dataAbertura = o.data_criacao
      ? new Date(o.data_criacao).toLocaleDateString("pt-BR")
      : "—";
    let slaText = "No prazo";
    if (o.data_criacao) {
      const diff = Math.floor(
        (generatedAt.getTime() - new Date(o.data_criacao).getTime()) / 86_400_000,
      );
      if (diff >= 30) slaText = `${diff} dias`;
    }

    return [
      o.numero_os,
      priorityLabel(priority.level, priority.score),
      priority.reasons.slice(0, 2).join(" · "),
      o.equipe || "N/A",
      `${o.predio || "—"} / ${o.andar || "—"}\n${o.local || "—"}`,
      o.nome_os || "Sem descrição",
      dataAbertura,
      slaText,
      String(o.material_status ?? "").toLowerCase() === "solicitado" ? "SIM" : "NÃO",
    ];
  });

  autoTable(doc, {
    startY: 64,
    head: [[
      "OS",
      "PRIORIDADE",
      "MOTIVO",
      "EQUIPE",
      "LOCALIZAÇÃO",
      "DESCRIÇÃO",
      "ABERTURA",
      "ATRASO",
      "MAT.",
    ]],
    body: tableData,
    theme: "grid",
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontSize: 7.2,
      fontStyle: "bold",
      halign: "center",
      cellPadding: 2.5,
    },
    columnStyles: {
      0: { halign: "center", fontStyle: "bold", cellWidth: 16 },
      1: { halign: "center", fontStyle: "bold", cellWidth: 25 },
      2: { halign: "left", cellWidth: 43 },
      3: { halign: "center", cellWidth: 27 },
      4: { halign: "left", cellWidth: 45 },
      5: { halign: "left", cellWidth: 75 },
      6: { halign: "center", cellWidth: 20 },
      7: { halign: "center", cellWidth: 18 },
      8: { halign: "center", cellWidth: 13 },
    },
    styles: {
      font: "helvetica",
      fontSize: 6.8,
      cellPadding: 2,
      valign: "middle",
      overflow: "linebreak",
    },
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
      if (data.column.index === 7 && data.cell.text[0] !== "No prazo") {
        data.cell.styles.textColor = redColor;
        data.cell.styles.fontStyle = "bold";
      }
      if (data.column.index === 8 && data.cell.text[0] === "SIM") {
        data.cell.styles.textColor = amberColor;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Página ${i} de ${pageCount} · Apont Auto · prioridade calculada automaticamente`,
      14,
      202,
    );
  }

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `programacao_${equipeFiltro
    .toLowerCase()
    .replace(/\s+/g, "_")}_${generatedAt.toISOString().slice(0, 10)}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
