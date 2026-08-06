import { OsCacheRow } from "./db";

export async function generateProgramacaoPDF(osList: OsCacheRow[], equipeFiltro: string) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const primaryColor = [15, 23, 42]; // #0F172A
  const accentColor = [59, 130, 246]; // #3B82F6
  const emeraldColor = [16, 185, 129]; // #10B981
  const amberColor = [245, 158, 11]; // #F59E0B
  const redColor = [239, 68, 68]; // #EF4444

  // --- Header ---
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, 210, 40, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("APONT AUTO", 15, 20);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("PROGRAMAÇÃO DE SERVIÇOS EM ABERTO", 15, 28);
  doc.text(`EQUIPE: ${equipeFiltro.toUpperCase()}`, 15, 33);
  doc.text(`GERADO EM: ${new Date().toLocaleString("pt-BR")}`, 145, 33);

  // --- Summary ---
  const total = osList.length;
  const emAtraso = osList.filter(o => {
    if (!o.data_criacao) return false;
    const diff = (new Date().getTime() - new Date(o.data_criacao).getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 30;
  }).length;
  const materialSolicitado = osList.filter(o => o.material_status === "solicitado").length;

  const cardWidth = 60;
  const startX = 15;
  const cardY = 50;

  const drawCard = (x: number, label: string, value: string | number, color: number[]) => {
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, cardY, cardWidth, 20, 2, 2, "FD");
    
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(label.toUpperCase(), x + 5, cardY + 7);
    
    doc.setTextColor(color[0], color[1], color[2]);
    doc.setFontSize(12);
    doc.text(String(value), x + 5, cardY + 15);
  };

  drawCard(startX, "Total em Aberto", total, primaryColor);
  drawCard(startX + cardWidth + 5, "Em Atraso (>30d)", emAtraso, redColor);
  drawCard(startX + (cardWidth + 5) * 2, "Aguardando Material", materialSolicitado, amberColor);

  // --- Table ---
  const tableData = osList.map((o) => {
    const dataAbertura = o.data_criacao ? new Date(o.data_criacao).toLocaleDateString("pt-BR") : "—";
    let slaText = "No prazo";
    let isAtraso = false;
    if (o.data_criacao) {
      const diff = Math.floor((new Date().getTime() - new Date(o.data_criacao).getTime()) / (1000 * 60 * 60 * 24));
      if (diff >= 30) {
        slaText = `${diff} dias`;
        isAtraso = true;
      }
    }

    return [
      o.numero_os,
      o.equipe || "N/A",
      `${o.predio} / ${o.andar}\n${o.local}`,
      o.nome_os,
      dataAbertura,
      slaText,
      o.material_status === "solicitado" ? "SIM" : "NÃO"
    ];
  });

  autoTable(doc, {
    startY: 80,
    head: [["OS", "EQUIPE", "LOCALIZAÇÃO", "DESCRIÇÃO", "ABERTURA", "ATRASO", "MAT."]],
    body: tableData,
    theme: "striped",
    headStyles: {
      fillColor: primaryColor as [number, number, number],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
      halign: "center",
      cellPadding: 3,
    },
    columnStyles: {
      0: { halign: "center", fontStyle: "bold", cellWidth: 15 },
      1: { halign: "center", cellWidth: 25 },
      2: { halign: "left", cellWidth: 40 },
      3: { halign: "left", cellWidth: 55 },
      4: { halign: "center", cellWidth: 20 },
      5: { halign: "center", cellWidth: 15 },
      6: { halign: "center", cellWidth: 10 },
    },
    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: 2,
      valign: "middle",
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        const text = data.cell.text[0];
        if (text !== "No prazo") {
          doc.setTextColor(redColor[0], redColor[1], redColor[2]);
          doc.setFont("helvetica", "bold");
        }
      }
      if (data.section === 'body' && data.column.index === 6) {
        const text = data.cell.text[0];
        if (text === "SIM") {
          doc.setTextColor(amberColor[0], amberColor[1], amberColor[2]);
          doc.setFont("helvetica", "bold");
        }
      }
    }
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Página ${i} de ${pageCount} - Apont Auto Sistema de Gestão`, 15, 285);
  }

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `programacao_${equipeFiltro.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
