import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { RondaCalha } from "./types";

export async function generateRondaPDF(ronda: RondaCalha) {
  const doc = new jsPDF();
  const primaryColor = [59, 130, 246]; // #3B82F6 (Primary Blue)
  
  // Header
  doc.setFillColor(15, 23, 42); // #0F172A
  doc.rect(0, 0, 210, 40, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("RELATÓRIO DE INSPEÇÃO DE CALHA", 105, 25, { align: "center" });
  
  // Content
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  
  const data = [
    ["Prédio", ronda.predio],
    ["Serviço", ronda.preventiva_nome],
    ["Status", ronda.status.toUpperCase()],
    ["Realizado por", ronda.realizado_por || "-"],
    ["Data/Hora", ronda.realizado_em ? new Date(ronda.realizado_em).toLocaleString("pt-BR") : "-"],
    ["Mês de Referência", ronda.mes_referencia],
  ];
  
  autoTable(doc, {
    startY: 50,
    head: [["Campo", "Informação"]],
    body: data,
    theme: "striped",
    headStyles: { fillColor: primaryColor },
    margin: { top: 50 },
  });
  
  if (ronda.problemas_identificados) {
    doc.setFont("helvetica", "bold");
    doc.text("Problemas Identificados:", 14, (doc as any).lastAutoTable.finalY + 15);
    doc.setFont("helvetica", "normal");
    const splitText = doc.splitTextToSize(ronda.problemas_identificados, 180);
    doc.text(splitText, 14, (doc as any).lastAutoTable.finalY + 22);
  }
  
  // Fotos
  if (ronda.fotos && ronda.fotos.length > 0) {
    let y = (doc as any).lastAutoTable.finalY + 40;
    doc.setFont("helvetica", "bold");
    doc.text("Evidências Fotográficas:", 14, y - 5);
    
    // Simplificação: apenas lista os links se houver muitos, ou tenta carregar os primeiros
    // Nota: Em um PDF real, carregar imagens remotas exige await/promessas
    ronda.fotos.forEach((url, i) => {
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(8);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(`Foto ${i + 1}: ${url}`, 14, y);
      y += 10;
    });
  }
  
  doc.save(`Relatorio_Ronda_${ronda.predio.replace(/\s+/g, "_")}_${ronda.mes_referencia}.pdf`);
}
