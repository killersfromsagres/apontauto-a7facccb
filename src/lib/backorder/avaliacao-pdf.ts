import { SolicitanteResumo } from "./avaliacao-email";

export async function generateAvaliacaoPDF(input: {
  titulo: string;
  resumo: SolicitanteResumo[];
  ano: string | number;
}) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const primaryColor = [15, 23, 42]; // #0F172A
  const accentColor = [59, 130, 246]; // #3B82F6

  // --- Header ---
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, 210, 40, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("APONT AUTO", 15, 20);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("RELATÓRIO EXECUTIVO DE AVALIAÇÃO", 15, 28);
  doc.text(`ANO DE REFERÊNCIA: ${input.ano}`, 15, 33);

  // --- Summary Cards ---
  const totalSolicitantes = input.resumo.length;
  const totalConcluidos = input.resumo.reduce((a, b) => a + b.concluidos, 0);
  const totalAguardando = input.resumo.reduce((a, b) => a + b.aguardando, 0);
  const totalGeral = totalConcluidos + totalAguardando;

  const cardWidth = 43;
  const startX = 15;
  const cardY = 50;

  const drawCard = (x: number, label: string, value: string | number, sub: string) => {
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, cardY, cardWidth, 25, 2, 2, "FD");
    
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(label.toUpperCase(), x + 5, cardY + 7);
    
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFontSize(14);
    doc.text(String(value), x + 5, cardY + 16);
    
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(sub, x + 5, cardY + 21);
  };

  drawCard(startX, "Solicitantes", totalSolicitantes, "Total na lista");
  drawCard(startX + cardWidth + 5, "Concluídos", totalConcluidos, "Aguardando nota");
  drawCard(startX + (cardWidth + 5) * 2, "Aguardando", totalAguardando, "Pendente aprovação");
  drawCard(startX + (cardWidth + 5) * 3, "Total Geral", totalGeral, "OS pendentes");

  // --- Chart / Visual Section Header ---
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("DISTRIBUIÇÃO POR SOLICITANTE", 15, 88);

  // --- Table ---
  const tableData = input.resumo.map((r) => [
    r.nome.toUpperCase(),
    r.concluidos,
    r.aguardando,
    r.total,
  ]);

  autoTable(doc, {
    startY: 95,
    head: [["SOLICITANTE", "CONCLUÍDOS", "AGUARD. APROV.", "TOTAL PENDENTE"]],
    body: tableData,
    theme: "striped",
  headStyles: {
      fillColor: primaryColor as [number, number, number],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: "bold",
      halign: "center",
      cellPadding: 4,
    },
    columnStyles: {
      0: { halign: "left", fontStyle: "bold", cellWidth: 80 },
      1: { halign: "center", cellWidth: 30 },
      2: { halign: "center", cellWidth: 35 },
      3: { halign: "center", cellWidth: 35 },
    },
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 3,
      valign: "middle",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 15, right: 15 },
    didDrawCell: (data) => {
      // Add a small visual hint for non-zero pending
      if (data.section === 'body' && data.column.index === 3) {
        const val = Number(data.cell.text[0]);
        if (val > 0) {
          doc.setDrawColor(accentColor[0], accentColor[1], accentColor[2]);
          doc.setLineWidth(0.5);
          doc.line(data.cell.x + 2, data.cell.y + 2, data.cell.x + 2, data.cell.y + data.cell.height - 2);
        }
      }
    }
  });

  // --- Footer ---
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Relatório gerado automaticamente via Apont Auto - Sistema de Gestão Predial`,
      15,
      285
    );
    doc.text(`Página ${i} de ${pageCount}`, 180, 285);
  }

  return doc.output("blob");
}
