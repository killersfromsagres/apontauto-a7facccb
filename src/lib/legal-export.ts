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

const PERIOD_LABEL: Record<string, string> = {
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

export async function exportLegalXLSX(items: LegalItem[], execs: LegalExecution[], year: number) {
  const XLSX = await import("xlsx");
  const rows = items.map((it) => {
    const cells = buildMonthMap(it, execs, year);
    const monthCols: Record<string, string> = {};
    MONTHS.forEach((m, i) => {
      monthCols[m] =
        cells[i] === "done"
          ? "✓"
          : cells[i] === "scheduled"
            ? "•"
            : cells[i] === "overdue"
              ? "X"
              : "";
    });
    return {
      Tarefa: it.titulo,
      Empresa: it.empresa,
      Prédio: it.predio,
      "Última Execução": it.ultimaExecucao ?? "",
      "Próxima Execução": it.proximaExecucao ?? "",
      Agendamento: it.agendamento ?? "",
      Periodicidade: PERIOD_LABEL[it.periodicidade] ?? it.periodicidade,
      Andaime: it.precisaAndaime ? "SIM" : "NÃO",
      Status: STATUS_LABEL[statusOf(it)] ?? statusOf(it),
      ...monthCols,
      Observações: it.observacoes,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 42 },
    { wch: 24 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 11 },
    { wch: 18 },
    ...MONTHS.map(() => ({ wch: 5 })),
    { wch: 48 },
  ];
  ws["!autofilter"] = { ref: ws["!ref"] ?? "A1:A1" };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Painel ${year}`);
  XLSX.writeFile(wb, `painel-itens-legais-${year}.xlsx`);
}

export async function exportLegalPDF(items: LegalItem[], execs: LegalExecution[], year: number) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const palette = {
    navy: [10, 24, 44] as [number, number, number],
    navySoft: [20, 43, 72] as [number, number, number],
    blue: [56, 132, 255] as [number, number, number],
    cyan: [56, 189, 248] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    text: [30, 41, 59] as [number, number, number],
    muted: [100, 116, 139] as [number, number, number],
    line: [226, 232, 240] as [number, number, number],
    surface: [248, 250, 252] as [number, number, number],
    greenBg: [220, 252, 231] as [number, number, number],
    greenText: [22, 101, 52] as [number, number, number],
    amberBg: [254, 243, 199] as [number, number, number],
    amberText: [146, 64, 14] as [number, number, number],
    redBg: [254, 226, 226] as [number, number, number],
    redText: [153, 27, 27] as [number, number, number],
    slateBg: [241, 245, 249] as [number, number, number],
  };

  const statusCounts = items.reduce(
    (acc, item) => {
      const status = statusOf(item);
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const total = items.length;
  const emDia = (statusCounts.em_dia ?? 0) + (statusCounts.concluido ?? 0);
  const proximos = statusCounts.proximo ?? 0;
  const vencidos = statusCounts.vencido ?? 0;
  const semAgenda = statusCounts.sem_agenda ?? 0;
  const andaime = items.filter((item) => item.precisaAndaime).length;

  const drawRoundedCard = (
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    value: string,
    accent: [number, number, number],
  ) => {
    doc.setFillColor(...palette.white);
    doc.setDrawColor(...palette.line);
    doc.roundedRect(x, y, w, h, 7, 7, "FD");
    doc.setFillColor(...accent);
    doc.roundedRect(x, y, 4, h, 2, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...palette.navy);
    doc.text(value, x + 14, y + 21);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...palette.muted);
    doc.text(label.toUpperCase(), x + 14, y + 35);
  };

  const drawPrimaryHeader = () => {
    doc.setFillColor(...palette.navy);
    doc.rect(0, 0, pageW, 70, "F");

    doc.setFillColor(...palette.blue);
    doc.rect(0, 70, pageW, 3, "F");

    doc.setTextColor(...palette.white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("RELATÓRIO GERENCIAL · ITENS LEGAIS", 30, 31);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(203, 213, 225);
    doc.text(`Acompanhamento de obrigações, recorrências e vencimentos · ${year}`, 30, 48);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...palette.white);
    const brand = "APONT AUTO";
    doc.text(brand, pageW - 30 - doc.getTextWidth(brand), 31);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    const updated = `Atualizado em ${new Date().toLocaleDateString("pt-BR")}`;
    doc.text(updated, pageW - 30 - doc.getTextWidth(updated), 48);
  };

  const drawContinuationHeader = () => {
    doc.setFillColor(...palette.navy);
    doc.rect(0, 0, pageW, 52, "F");
    doc.setFillColor(...palette.blue);
    doc.rect(0, 52, pageW, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(...palette.white);
    doc.text("ITENS LEGAIS", 30, 25);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    doc.text(`Continuação do relatório · ${year}`, 30, 38);
  };

  const drawFooter = () => {
    const pageNumber = doc.getCurrentPageInfo().pageNumber;
    const y = pageH - 18;

    doc.setDrawColor(...palette.line);
    doc.line(30, y - 10, pageW - 30, y - 10);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...palette.muted);
    doc.text("Apont Auto · Painel de Itens Legais", 30, y);

    const pageLabel = `Página ${pageNumber}`;
    doc.text(pageLabel, pageW - 30 - doc.getTextWidth(pageLabel), y);
  };

  drawPrimaryHeader();

  const cardGap = 8;
  const cards = 6;
  const availableW = pageW - 60;
  const cardW = (availableW - cardGap * (cards - 1)) / cards;
  const cardY = 84;
  const cardH = 44;

  const metricCards: Array<{
    label: string;
    value: number;
    accent: [number, number, number];
  }> = [
    { label: "Itens no relatório", value: total, accent: palette.blue },
    { label: "Em dia / concluídos", value: emDia, accent: [16, 185, 129] },
    { label: "Próximos", value: proximos, accent: [245, 158, 11] },
    { label: "Vencidos", value: vencidos, accent: [239, 68, 68] },
    { label: "Sem agenda", value: semAgenda, accent: [100, 116, 139] },
    { label: "Requerem andaime", value: andaime, accent: palette.cyan },
  ];

  metricCards.forEach((card, index) => {
    drawRoundedCard(
      30 + index * (cardW + cardGap),
      cardY,
      cardW,
      cardH,
      card.label,
      String(card.value),
      card.accent,
    );
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...palette.muted);
  doc.text("Legenda mensal:", 30, 141);

  const legendItems = [
    { text: "✓ Concluído", color: palette.greenText },
    { text: "• Programado", color: palette.amberText },
    { text: "X Vencido", color: palette.redText },
    { text: "— Sem registro", color: palette.muted },
  ];
  let legendX = 91;
  legendItems.forEach((item) => {
    doc.setTextColor(...item.color);
    doc.setFont("helvetica", "bold");
    doc.text(item.text, legendX, 141);
    legendX += doc.getTextWidth(item.text) + 18;
  });

  const head = [
    ["Tarefa", "Empresa", "Prédio", "Andaime", "Última", "Próxima", "Period.", "Status", ...MONTHS],
  ];

  const body = items.map((it) => {
    const cells = buildMonthMap(it, execs, year);
    return [
      it.titulo,
      it.empresa || "—",
      it.predio || "—",
      it.precisaAndaime ? "SIM" : "—",
      fmt(it.ultimaExecucao),
      fmt(it.proximaExecucao),
      PERIOD_LABEL[it.periodicidade] ?? it.periodicidade,
      STATUS_LABEL[statusOf(it)] ?? statusOf(it),
      ...cells.map((c) =>
        c === "done" ? "✓" : c === "scheduled" ? "•" : c === "overdue" ? "X" : "—",
      ),
    ];
  });

  autoTable(doc, {
    head,
    body,
    startY: 153,
    showHead: "everyPage",
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: { top: 4, right: 3, bottom: 4, left: 3 },
      lineColor: palette.line,
      lineWidth: 0.35,
      textColor: palette.text,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: palette.navySoft,
      textColor: palette.white,
      fontStyle: "bold",
      fontSize: 6.6,
      halign: "center",
      valign: "middle",
      minCellHeight: 22,
      lineColor: [51, 65, 85],
    },
    bodyStyles: {
      minCellHeight: 22,
    },
    alternateRowStyles: { fillColor: palette.surface },
    columnStyles: {
      0: { cellWidth: 150, fontStyle: "bold", halign: "left" },
      1: { cellWidth: 78, halign: "left" },
      2: { cellWidth: 46, halign: "center" },
      3: { cellWidth: 34, halign: "center", fontStyle: "bold" },
      4: { cellWidth: 48, halign: "center" },
      5: { cellWidth: 48, halign: "center" },
      6: { cellWidth: 48, halign: "center" },
      7: { cellWidth: 48, halign: "center", fontStyle: "bold" },
      8: { cellWidth: 20, halign: "center" },
      9: { cellWidth: 20, halign: "center" },
      10: { cellWidth: 20, halign: "center" },
      11: { cellWidth: 20, halign: "center" },
      12: { cellWidth: 20, halign: "center" },
      13: { cellWidth: 20, halign: "center" },
      14: { cellWidth: 20, halign: "center" },
      15: { cellWidth: 20, halign: "center" },
      16: { cellWidth: 20, halign: "center" },
      17: { cellWidth: 20, halign: "center" },
      18: { cellWidth: 20, halign: "center" },
      19: { cellWidth: 20, halign: "center" },
    },
    didParseCell: (data: any) => {
      if (data.section !== "body") return;

      if (data.column.index >= 8) {
        const value = String(data.cell.raw ?? "");
        data.cell.styles.halign = "center";
        data.cell.styles.fontStyle = "bold";

        if (value === "✓") {
          data.cell.styles.fillColor = palette.greenBg;
          data.cell.styles.textColor = palette.greenText;
        } else if (value === "X") {
          data.cell.styles.fillColor = palette.redBg;
          data.cell.styles.textColor = palette.redText;
        } else if (value === "•") {
          data.cell.styles.fillColor = palette.amberBg;
          data.cell.styles.textColor = palette.amberText;
        } else {
          data.cell.styles.fillColor = palette.slateBg;
          data.cell.styles.textColor = palette.muted;
        }
      }

      if (data.column.index === 7) {
        const status = String(data.cell.raw ?? "");
        if (status === "Vencido") {
          data.cell.styles.fillColor = palette.redBg;
          data.cell.styles.textColor = palette.redText;
        } else if (status === "Próximo") {
          data.cell.styles.fillColor = palette.amberBg;
          data.cell.styles.textColor = palette.amberText;
        } else if (status === "Em dia" || status === "Concluído") {
          data.cell.styles.fillColor = palette.greenBg;
          data.cell.styles.textColor = palette.greenText;
        } else {
          data.cell.styles.fillColor = palette.slateBg;
          data.cell.styles.textColor = palette.muted;
        }
      }

      if (data.column.index === 3 && String(data.cell.raw ?? "") === "SIM") {
        data.cell.styles.fillColor = palette.amberBg;
        data.cell.styles.textColor = palette.amberText;
      }
    },
    didDrawPage: () => {
      const pageNumber = doc.getCurrentPageInfo().pageNumber;
      if (pageNumber > 1) drawContinuationHeader();
      drawFooter();
    },
    margin: { top: 70, left: 30, right: 30, bottom: 38 },
  });

  doc.save(`painel-itens-legais-${year}.pdf`);
}
