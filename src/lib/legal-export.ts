// Vendors pesados (xlsx, jsPDF) são carregados sob demanda apenas quando
// o usuário clica em exportar — mantém o bundle inicial enxuto.
import type { LegalItem, LegalExecution } from "@/lib/legal-items";
import { buildMonthMap, statusOf } from "@/lib/legal-items";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const STATUS_LABEL: Record<string, string> = {
  em_dia: "Em dia",
  proximo: "Próximo",
  vencido: "Vencido",
  concluido: "Concluído",
  sem_agenda: "Sem agenda",
};

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

export function exportLegalXLSX(items: LegalItem[], execs: LegalExecution[], year: number) {
  const rows = items.map((it) => {
    const cells = buildMonthMap(it, execs, year);
    const monthCols: Record<string, string> = {};
    MONTHS.forEach((m, i) => {
      monthCols[m] =
        cells[i] === "done" ? "✓" : cells[i] === "scheduled" ? "•" : cells[i] === "overdue" ? "X" : "";
    });
    return {
      Tarefa: it.titulo,
      Empresa: it.empresa,
      Prédio: it.predio,
      "Última Execução": it.ultimaExecucao ?? "",
      "Próxima Execução": it.proximaExecucao ?? "",
      Agendamento: it.agendamento ?? "",
      Periodicidade: it.periodicidade,
      Status: statusOf(it),
      ...monthCols,
      Observações: it.observacoes,
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Painel ${year}`);
  XLSX.writeFile(wb, `painel-itens-legais-${year}.xlsx`);
}

export function exportLegalPDF(items: LegalItem[], execs: LegalExecution[], year: number) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Cabeçalho corporativo
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageW, 70, "F");
  doc.setFillColor(59, 130, 246); // primary
  doc.rect(0, 70, pageW, 3, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("PAINEL DE ITENS LEGAIS", 40, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(203, 213, 225);
  doc.text(`Controle de tarefas legais e recorrentes · ${year}`, 40, 52);

  doc.setFontSize(9);
  const gerado = `Gerado em ${new Date().toLocaleString("pt-BR")}`;
  doc.text(gerado, pageW - 40 - doc.getTextWidth(gerado), 52);

  // Tabela
  const head = [
    ["Tarefa", "Empresa", "Prédio", "Última", "Próxima", "Period.", "Status", ...MONTHS],
  ];
  const body = items.map((it) => {
    const cells = buildMonthMap(it, execs, year);
    return [
      it.titulo,
      it.empresa || "—",
      it.predio || "—",
      fmt(it.ultimaExecucao),
      fmt(it.proximaExecucao),
      it.periodicidade,
      STATUS_LABEL[statusOf(it)] ?? statusOf(it),
      ...cells.map((c) =>
        c === "done" ? "✓" : c === "scheduled" ? "•" : c === "overdue" ? "X" : "",
      ),
    ];
  });

  autoTable(doc, {
    head,
    body,
    startY: 90,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 4,
      lineColor: [226, 232, 240],
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 130, fontStyle: "bold" },
      1: { cellWidth: 90 },
      2: { cellWidth: 70 },
      3: { cellWidth: 55, halign: "center" },
      4: { cellWidth: 55, halign: "center" },
      5: { cellWidth: 55, halign: "center" },
      6: { cellWidth: 55, halign: "center" },
    },
    didParseCell: (data) => {
      // Meses coloridos
      if (data.section === "body" && data.column.index >= 7) {
        const v = String(data.cell.raw ?? "");
        if (v === "✓") { data.cell.styles.fillColor = [220, 252, 231]; data.cell.styles.textColor = [22, 101, 52]; }
        else if (v === "X") { data.cell.styles.fillColor = [254, 226, 226]; data.cell.styles.textColor = [153, 27, 27]; }
        else if (v === "•") { data.cell.styles.fillColor = [254, 243, 199]; data.cell.styles.textColor = [146, 64, 14]; }
        data.cell.styles.halign = "center";
      }
      if (data.section === "body" && data.column.index === 6) {
        const s = String(data.cell.raw ?? "");
        if (s === "Vencido") { data.cell.styles.fillColor = [254, 226, 226]; data.cell.styles.textColor = [153, 27, 27]; }
        else if (s === "Próximo") { data.cell.styles.fillColor = [254, 243, 199]; data.cell.styles.textColor = [146, 64, 14]; }
        else if (s === "Em dia" || s === "Concluído") { data.cell.styles.fillColor = [220, 252, 231]; data.cell.styles.textColor = [22, 101, 52]; }
      }
    },
    didDrawPage: () => {
      // Rodapé
      const y = pageH - 20;
      doc.setDrawColor(226, 232, 240);
      doc.line(40, y - 10, pageW - 40, y - 10);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("ApontAuto · Painel de Itens Legais", 40, y);
      const pg = `Página ${doc.getCurrentPageInfo().pageNumber}`;
      doc.text(pg, pageW - 40 - doc.getTextWidth(pg), y);
    },
    margin: { top: 90, left: 40, right: 40, bottom: 40 },
  });

  doc.save(`painel-itens-legais-${year}.pdf`);
}
