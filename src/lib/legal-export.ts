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
  const marginX = 28;

  doc.setProperties({
    title: `Painel de Itens Legais ${year}`,
    subject: "Relatório gerencial de obrigações, agendamentos e recorrências legais",
    author: "Apont Auto",
    creator: "Apont Auto",
    keywords: "itens legais, agendamento, manutenção, compliance, Apont Auto",
  });

  const palette = {
    ink: [8, 19, 36] as [number, number, number],
    navy: [10, 24, 44] as [number, number, number],
    navySoft: [20, 43, 72] as [number, number, number],
    blue: [59, 130, 246] as [number, number, number],
    blueSoft: [219, 234, 254] as [number, number, number],
    blueText: [30, 64, 175] as [number, number, number],
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

  const generatedAt = new Date();
  const generatedDate = generatedAt.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const generatedTime = generatedAt.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

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
  const agendados = items.filter((item) => Boolean(item.agendamento)).length;
  const andaime = items.filter((item) => item.precisaAndaime).length;
  const empresas = new Set(items.map((item) => item.empresa.trim()).filter(Boolean)).size;
  const responsaveis = new Set(items.map((item) => item.responsavel.trim()).filter(Boolean)).size;
  const regularidade = total > 0 ? Math.round((emDia / total) * 100) : 0;

  const nextScheduled = items
    .filter((item) => item.agendamento)
    .sort((a, b) => String(a.agendamento).localeCompare(String(b.agendamento)))[0];

  const drawBrandMark = (x: number, y: number) => {
    doc.setFillColor(...palette.blue);
    doc.roundedRect(x, y, 24, 24, 6, 6, "F");
    doc.setDrawColor(...palette.white);
    doc.setLineWidth(1.8);
    doc.line(x + 6, y + 17, x + 12, y + 6);
    doc.line(x + 12, y + 6, x + 18, y + 17);
    doc.line(x + 9, y + 13, x + 15, y + 13);
  };

  const drawPrimaryHeader = () => {
    doc.setFillColor(...palette.ink);
    doc.rect(0, 0, pageW, 78, "F");
    doc.setFillColor(...palette.navySoft);
    doc.rect(pageW * 0.62, 0, pageW * 0.38, 78, "F");
    doc.setFillColor(...palette.blue);
    doc.rect(0, 76, pageW, 2, "F");
    doc.setFillColor(...palette.cyan);
    doc.rect(0, 76, pageW * 0.22, 2, "F");

    drawBrandMark(marginX, 22);

    doc.setTextColor(...palette.white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17.5);
    doc.text("PAINEL DE ITENS LEGAIS", marginX + 34, 33);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.7);
    doc.setTextColor(203, 213, 225);
    doc.text("Relatório gerencial de obrigações, agendamentos e conformidade", marginX + 34, 49);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...palette.white);
    const brand = "APONT AUTO";
    doc.text(brand, pageW - marginX - doc.getTextWidth(brand), 29);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.7);
    doc.setTextColor(148, 163, 184);
    const meta = `Ano-base ${year} · ${generatedDate} às ${generatedTime}`;
    doc.text(meta, pageW - marginX - doc.getTextWidth(meta), 45);
  };

  const drawSectionHeader = (title: string, subtitle: string) => {
    doc.setFillColor(...palette.ink);
    doc.rect(0, 0, pageW, 54, "F");
    doc.setFillColor(...palette.blue);
    doc.rect(0, 52, pageW, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(...palette.white);
    doc.text(title, marginX, 23);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.7);
    doc.setTextColor(180, 196, 218);
    doc.text(subtitle, marginX, 38);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(148, 197, 255);
    const brand = "APONT AUTO";
    doc.text(brand, pageW - marginX - doc.getTextWidth(brand), 30);
  };

  const drawMetricCard = (
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    value: string,
    accent: [number, number, number],
    helper?: string,
  ) => {
    doc.setFillColor(...palette.white);
    doc.setDrawColor(...palette.line);
    doc.setLineWidth(0.55);
    doc.roundedRect(x, y, w, h, 7, 7, "FD");

    doc.setFillColor(...accent);
    doc.roundedRect(x, y, 4, h, 2, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15.5);
    doc.setTextColor(...palette.navy);
    doc.text(value, x + 13, y + 20);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.7);
    doc.setTextColor(...palette.muted);
    doc.text(label.toUpperCase(), x + 13, y + 33);

    if (helper) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.2);
      doc.setTextColor(148, 163, 184);
      doc.text(helper, x + 13, y + 43);
    }
  };

  const drawFooter = (pageNumber: number, totalPages: number) => {
    const y = pageH - 16;
    doc.setDrawColor(...palette.line);
    doc.setLineWidth(0.45);
    doc.line(marginX, y - 9, pageW - marginX, y - 9);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.1);
    doc.setTextColor(...palette.muted);
    doc.text("Apont Auto · Painel de Itens Legais · Documento gerencial", marginX, y);

    const pageLabel = `Página ${pageNumber} de ${totalPages}`;
    doc.text(pageLabel, pageW - marginX - doc.getTextWidth(pageLabel), y);
  };

  drawPrimaryHeader();

  const cardGap = 7;
  const cards = 6;
  const availableW = pageW - marginX * 2;
  const cardW = (availableW - cardGap * (cards - 1)) / cards;
  const cardY = 90;
  const cardH = 49;

  const metricCards: Array<{
    label: string;
    value: string;
    accent: [number, number, number];
    helper?: string;
  }> = [
    { label: "Itens no relatório", value: String(total), accent: palette.blue, helper: `${empresas} empresa(s)` },
    { label: "Regularidade", value: `${regularidade}%`, accent: [16, 185, 129], helper: `${emDia} em dia/concluído(s)` },
    { label: "Próximos", value: String(proximos), accent: [245, 158, 11], helper: "até 15 dias" },
    { label: "Vencidos", value: String(vencidos), accent: [239, 68, 68], helper: "requer atenção" },
    { label: "Agendados", value: String(agendados), accent: palette.cyan, helper: `${semAgenda} sem agenda legal` },
    { label: "Responsáveis", value: String(responsaveis), accent: [139, 92, 246], helper: `${andaime} requer(em) andaime` },
  ];

  metricCards.forEach((card, index) => {
    drawMetricCard(
      marginX + index * (cardW + cardGap),
      cardY,
      cardW,
      cardH,
      card.label,
      card.value,
      card.accent,
      card.helper,
    );
  });

  doc.setFillColor(...palette.surface);
  doc.setDrawColor(...palette.line);
  doc.roundedRect(marginX, 149, availableW, 27, 5, 5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.setTextColor(...palette.navySoft);
  doc.text("RESUMO DE AGENDA", marginX + 11, 166);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...palette.muted);
  const nextAgendaText = nextScheduled?.agendamento
    ? `Próximo agendamento: ${fmt(nextScheduled.agendamento)} · ${nextScheduled.titulo}`
    : "Nenhum agendamento específico registrado nos itens deste relatório.";
  const agendaText = doc.splitTextToSize(nextAgendaText, availableW - 158);
  doc.text(agendaText, marginX + 99, 166);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.setTextColor(...palette.navy);
  doc.text("CONTROLE OPERACIONAL", marginX, 194);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...palette.muted);
  doc.text(
    "Datas, responsáveis, periodicidade, agendamento e situação atual de cada obrigação.",
    marginX,
    207,
  );

  const operationalHead = [
    [
      "Tarefa",
      "Empresa",
      "Prédio",
      "Responsável",
      "Última",
      "Próxima",
      "Agendamento",
      "Periodic.",
      "Andaime",
      "Status",
    ],
  ];

  const operationalBody = items.map((it) => [
    it.titulo || "—",
    it.empresa || "—",
    it.predio || "—",
    it.responsavel || "—",
    fmt(it.ultimaExecucao),
    fmt(it.proximaExecucao),
    fmt(it.agendamento),
    PERIOD_LABEL[it.periodicidade] ?? it.periodicidade,
    it.precisaAndaime ? "SIM" : "NÃO",
    STATUS_LABEL[statusOf(it)] ?? statusOf(it),
  ]);

  const operationalStartPage = doc.getCurrentPageInfo().pageNumber;

  autoTable(doc, {
    head: operationalHead,
    body: operationalBody,
    startY: 218,
    showHead: "everyPage",
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: { top: 4.5, right: 4, bottom: 4.5, left: 4 },
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
      fontSize: 6.7,
      halign: "center",
      valign: "middle",
      minCellHeight: 25,
      lineColor: [51, 65, 85],
    },
    bodyStyles: { minCellHeight: 24 },
    alternateRowStyles: { fillColor: palette.surface },
    columnStyles: {
      0: { cellWidth: 176, fontStyle: "bold", halign: "left" },
      1: { cellWidth: 82, halign: "left" },
      2: { cellWidth: 54, halign: "center" },
      3: { cellWidth: 78, halign: "left" },
      4: { cellWidth: 54, halign: "center" },
      5: { cellWidth: 54, halign: "center" },
      6: { cellWidth: 61, halign: "center", fontStyle: "bold" },
      7: { cellWidth: 54, halign: "center" },
      8: { cellWidth: 42, halign: "center", fontStyle: "bold" },
      9: { cellWidth: 63, halign: "center", fontStyle: "bold" },
    },
    didParseCell: (data: any) => {
      if (data.section !== "body") return;

      if (data.column.index === 6) {
        const value = String(data.cell.raw ?? "");
        if (value !== "—") {
          data.cell.styles.fillColor = palette.blueSoft;
          data.cell.styles.textColor = palette.blueText;
        } else {
          data.cell.styles.fillColor = palette.slateBg;
          data.cell.styles.textColor = palette.muted;
        }
      }

      if (data.column.index === 8 && String(data.cell.raw ?? "") === "SIM") {
        data.cell.styles.fillColor = palette.amberBg;
        data.cell.styles.textColor = palette.amberText;
      }

      if (data.column.index === 9) {
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
    },
    didDrawPage: () => {
      if (doc.getCurrentPageInfo().pageNumber > operationalStartPage) {
        drawSectionHeader(
          "CONTROLE OPERACIONAL · CONTINUAÇÃO",
          `Itens legais e agendamentos · Ano-base ${year}`,
        );
      }
    },
    margin: { top: 70, left: marginX, right: marginX, bottom: 42 },
  });

  doc.addPage();
  drawSectionHeader(
    "MAPA ANUAL DE CONFORMIDADE",
    `Visão mês a mês das execuções e programações registradas · ${year}`,
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(...palette.muted);
  doc.text("Legenda:", marginX, 70);

  const annualLegend = [
    { label: "OK Concluído", color: palette.greenText },
    { label: "AG Programado", color: palette.amberText },
    { label: "! Vencido", color: palette.redText },
    { label: "— Sem registro", color: palette.muted },
  ];
  let legendX = marginX + 42;
  annualLegend.forEach((entry) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...entry.color);
    doc.text(entry.label, legendX, 70);
    legendX += doc.getTextWidth(entry.label) + 18;
  });

  const annualHead = [["Tarefa", "Empresa", ...MONTHS]];
  const annualBody = items.map((it) => {
    const cells = buildMonthMap(it, execs, year);
    return [
      it.titulo || "—",
      it.empresa || "—",
      ...cells.map((cell) =>
        cell === "done" ? "OK" : cell === "scheduled" ? "AG" : cell === "overdue" ? "!" : "—",
      ),
    ];
  });

  const annualStartPage = doc.getCurrentPageInfo().pageNumber;

  autoTable(doc, {
    head: annualHead,
    body: annualBody,
    startY: 81,
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
      fontSize: 6.7,
      halign: "center",
      minCellHeight: 23,
    },
    bodyStyles: { minCellHeight: 22 },
    alternateRowStyles: { fillColor: palette.surface },
    columnStyles: {
      0: { cellWidth: 178, fontStyle: "bold", halign: "left" },
      1: { cellWidth: 92, halign: "left" },
      2: { cellWidth: 38, halign: "center" },
      3: { cellWidth: 38, halign: "center" },
      4: { cellWidth: 38, halign: "center" },
      5: { cellWidth: 38, halign: "center" },
      6: { cellWidth: 38, halign: "center" },
      7: { cellWidth: 38, halign: "center" },
      8: { cellWidth: 38, halign: "center" },
      9: { cellWidth: 38, halign: "center" },
      10: { cellWidth: 38, halign: "center" },
      11: { cellWidth: 38, halign: "center" },
      12: { cellWidth: 38, halign: "center" },
      13: { cellWidth: 38, halign: "center" },
    },
    didParseCell: (data: any) => {
      if (data.section !== "body" || data.column.index < 2) return;

      const value = String(data.cell.raw ?? "");
      data.cell.styles.halign = "center";
      data.cell.styles.fontStyle = "bold";

      if (value === "OK") {
        data.cell.styles.fillColor = palette.greenBg;
        data.cell.styles.textColor = palette.greenText;
      } else if (value === "AG") {
        data.cell.styles.fillColor = palette.amberBg;
        data.cell.styles.textColor = palette.amberText;
      } else if (value === "!") {
        data.cell.styles.fillColor = palette.redBg;
        data.cell.styles.textColor = palette.redText;
      } else {
        data.cell.styles.fillColor = palette.slateBg;
        data.cell.styles.textColor = palette.muted;
      }
    },
    didDrawPage: () => {
      if (doc.getCurrentPageInfo().pageNumber > annualStartPage) {
        drawSectionHeader(
          "MAPA ANUAL DE CONFORMIDADE · CONTINUAÇÃO",
          `Execuções e programações por mês · ${year}`,
        );
      }
    },
    margin: { top: 70, left: marginX, right: marginX, bottom: 42 },
  });

  const detailItems = items.filter(
    (item) => item.descricao.trim() || item.observacoes.trim() || item.responsavel.trim(),
  );

  if (detailItems.length > 0) {
    doc.addPage();
    drawSectionHeader(
      "INFORMAÇÕES COMPLEMENTARES",
      "Responsáveis, descrição do requisito e observações registradas no Painel de Itens Legais",
    );

    const detailHead = [["Tarefa", "Responsável", "Descrição / requisito", "Observações"]];
    const detailBody = detailItems.map((item) => [
      item.titulo || "—",
      item.responsavel || "—",
      item.descricao || "—",
      item.observacoes || "—",
    ]);

    const detailsStartPage = doc.getCurrentPageInfo().pageNumber;

    autoTable(doc, {
      head: detailHead,
      body: detailBody,
      startY: 69,
      showHead: "everyPage",
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 7.2,
        cellPadding: { top: 5, right: 5, bottom: 5, left: 5 },
        lineColor: palette.line,
        lineWidth: 0.35,
        textColor: palette.text,
        valign: "top",
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: palette.navySoft,
        textColor: palette.white,
        fontStyle: "bold",
        fontSize: 7,
        halign: "left",
        valign: "middle",
        minCellHeight: 24,
      },
      alternateRowStyles: { fillColor: palette.surface },
      columnStyles: {
        0: { cellWidth: 172, fontStyle: "bold" },
        1: { cellWidth: 105 },
        2: { cellWidth: 250 },
        3: { cellWidth: 250 },
      },
      didDrawPage: () => {
        if (doc.getCurrentPageInfo().pageNumber > detailsStartPage) {
          drawSectionHeader(
            "INFORMAÇÕES COMPLEMENTARES · CONTINUAÇÃO",
            "Detalhamento documental dos itens legais",
          );
        }
      },
      margin: { top: 70, left: marginX, right: marginX, bottom: 42 },
    });
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawFooter(page, totalPages);
  }

  doc.save(`painel-itens-legais-${year}.pdf`);
}
