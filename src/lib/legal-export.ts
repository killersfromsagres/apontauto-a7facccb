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

  // Folha única: o tamanho físico cresce conforme o volume para preservar leitura.
  const format = items.length <= 45 ? "a3" : items.length <= 95 ? "a2" : "a1";
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = Math.max(28, pageW * 0.025);
  const contentW = pageW - marginX * 2;

  doc.setProperties({
    title: `Painel de Itens Legais ${year}`,
    subject: "Relatório executivo de itens legais, agendamentos e conformidade",
    author: "Apont Auto",
    creator: "Apont Auto",
    keywords: "itens legais, agendamento, compliance, manutenção, Apont Auto",
  });

  const palette = {
    ink: [7, 18, 35] as [number, number, number],
    navy: [12, 29, 52] as [number, number, number],
    navy2: [17, 42, 73] as [number, number, number],
    blue: [37, 99, 235] as [number, number, number],
    cyan: [14, 165, 233] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    text: [30, 41, 59] as [number, number, number],
    muted: [100, 116, 139] as [number, number, number],
    line: [218, 226, 236] as [number, number, number],
    surface: [248, 250, 252] as [number, number, number],
    surfaceBlue: [239, 246, 255] as [number, number, number],
    greenBg: [220, 252, 231] as [number, number, number],
    greenText: [21, 128, 61] as [number, number, number],
    amberBg: [254, 243, 199] as [number, number, number],
    amberText: [161, 98, 7] as [number, number, number],
    redBg: [254, 226, 226] as [number, number, number],
    redText: [185, 28, 28] as [number, number, number],
    slateBg: [241, 245, 249] as [number, number, number],
  };

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  const generatedAt = new Date();
  const generatedLabel = generatedAt.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const statuses = items.map((item) => statusOf(item));
  const total = items.length;
  const emDia = statuses.filter((status) => status === "em_dia" || status === "concluido").length;
  const proximos = statuses.filter((status) => status === "proximo").length;
  const vencidos = statuses.filter((status) => status === "vencido").length;
  const agendados = items.filter((item) => Boolean(item.agendamento)).length;
  const semAgendamento = total - agendados;
  const regularidade = total > 0 ? Math.round((emDia / total) * 100) : 0;
  const execucoesAno = execs.filter((exec) => exec.data.startsWith(`${year}-`)).length;
  const empresas = new Set(items.map((item) => item.empresa.trim()).filter(Boolean)).size;

  const nextScheduled = items
    .filter((item) => item.agendamento)
    .sort((a, b) => String(a.agendamento).localeCompare(String(b.agendamento)))[0];

  // Fundo branco com detalhe superior editorial.
  doc.setFillColor(...palette.white);
  doc.rect(0, 0, pageW, pageH, "F");
  doc.setFillColor(...palette.ink);
  doc.rect(0, 0, pageW, 82, "F");
  doc.setFillColor(...palette.navy2);
  doc.rect(pageW * 0.68, 0, pageW * 0.32, 82, "F");
  doc.setFillColor(...palette.blue);
  doc.rect(0, 80, pageW, 2, "F");
  doc.setFillColor(...palette.cyan);
  doc.rect(0, 80, pageW * 0.2, 2, "F");

  // Marca gráfica simples e vetorial.
  const logoX = marginX;
  const logoY = 23;
  doc.setFillColor(...palette.blue);
  doc.roundedRect(logoX, logoY, 28, 28, 7, 7, "F");
  doc.setDrawColor(...palette.white);
  doc.setLineWidth(2);
  doc.line(logoX + 7, logoY + 20, logoX + 14, logoY + 7);
  doc.line(logoX + 14, logoY + 7, logoX + 21, logoY + 20);
  doc.line(logoX + 10, logoY + 15, logoX + 18, logoY + 15);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(format === "a1" ? 24 : format === "a2" ? 21 : 18);
  doc.setTextColor(...palette.white);
  doc.text("PAINEL DE ITENS LEGAIS", logoX + 40, 37);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(format === "a1" ? 10.5 : 8.5);
  doc.setTextColor(191, 205, 224);
  doc.text(
    "Relatório consolidado de obrigações, responsáveis, vencimentos e agendamentos",
    logoX + 40,
    55,
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(format === "a1" ? 13 : 10.5);
  doc.setTextColor(...palette.white);
  const brand = "APONT AUTO";
  doc.text(brand, pageW - marginX - doc.getTextWidth(brand), 31);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(format === "a1" ? 9 : 7.5);
  doc.setTextColor(148, 163, 184);
  const issue = `Ano-base ${year} · Emitido em ${generatedLabel}`;
  doc.text(issue, pageW - marginX - doc.getTextWidth(issue), 49);
  const sheetLabel = `Folha única · Formato ${String(format).toUpperCase()}`;
  doc.text(sheetLabel, pageW - marginX - doc.getTextWidth(sheetLabel), 63);

  // Linha executiva: compacta, sem cartões altos.
  const bandY = 96;
  const bandH = format === "a1" ? 62 : format === "a2" ? 56 : 52;
  doc.setFillColor(...palette.surface);
  doc.setDrawColor(...palette.line);
  doc.setLineWidth(0.6);
  doc.roundedRect(marginX, bandY, contentW, bandH, 7, 7, "FD");

  const metrics = [
    { label: "ITENS", value: String(total), accent: palette.blue },
    { label: "REGULARIDADE", value: `${regularidade}%`, accent: [16, 185, 129] as [number, number, number] },
    { label: "VENCIDOS", value: String(vencidos), accent: [239, 68, 68] as [number, number, number] },
    { label: "PRÓXIMOS", value: String(proximos), accent: [245, 158, 11] as [number, number, number] },
    { label: "AGENDADOS", value: String(agendados), accent: palette.cyan },
    { label: "EXECUÇÕES NO ANO", value: String(execucoesAno), accent: [99, 102, 241] as [number, number, number] },
  ];
  const metricW = contentW / metrics.length;

  metrics.forEach((metric, index) => {
    const x = marginX + metricW * index;
    if (index > 0) {
      doc.setDrawColor(...palette.line);
      doc.line(x, bandY + 11, x, bandY + bandH - 11);
    }
    doc.setFillColor(...metric.accent);
    doc.roundedRect(x + 13, bandY + 13, 4, bandH - 26, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(format === "a1" ? 18 : 14.5);
    doc.setTextColor(...palette.ink);
    doc.text(metric.value, x + 26, bandY + 26);
    doc.setFontSize(format === "a1" ? 7.5 : 6.4);
    doc.setTextColor(...palette.muted);
    doc.text(metric.label, x + 26, bandY + 41);
  });

  // Linha contextual com informação útil, sem criar nova seção/página.
  const infoY = bandY + bandH + 13;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(format === "a1" ? 9.5 : 7.5);
  doc.setTextColor(...palette.navy);
  doc.text("VISÃO CONSOLIDADA", marginX, infoY);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...palette.muted);
  const contextParts = [
    `${empresas} empresa(s)`,
    `${emDia} item(ns) em dia/concluído(s)`,
    `${semAgendamento} sem agendamento específico`,
  ];
  if (nextScheduled?.agendamento) {
    contextParts.push(`próximo agendamento: ${fmt(nextScheduled.agendamento)} · ${nextScheduled.titulo}`);
  }
  const context = contextParts.join("  •  ");
  const contextX = marginX + doc.getTextWidth("VISÃO CONSOLIDADA") + 16;
  doc.text(doc.splitTextToSize(context, pageW - marginX - contextX), contextX, infoY);

  const tableStartY = infoY + (format === "a1" ? 20 : 16);
  const footerY = pageH - 25;
  const availableTableH = footerY - tableStartY - 10;
  const headerH = format === "a1" ? 31 : format === "a2" ? 27 : 25;
  const targetRowH = total > 0 ? (availableTableH - headerH) / total : 18;
  const rowFont = clamp(targetRowH * 0.43, format === "a1" ? 5.4 : 4.8, format === "a1" ? 8.6 : 7.2);
  const rowPadding = clamp((targetRowH - rowFont * 1.18) / 2, 0.55, 3.1);
  const headerFont = clamp(rowFont + 0.8, 5.5, format === "a1" ? 9.2 : 8);

  const weights = [2.65, 2.15, 1.45, 1.2, 1.55, 1.05, 1.05, 1.05, 1.15, 0.8, 1.15, 2.35];
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const widths = weights.map((weight) => (weight / weightSum) * contentW);

  const head = [[
    "Item legal",
    "Descrição / requisito",
    "Empresa",
    "Prédio",
    "Responsável",
    "Periodic.",
    "Última exec.",
    "Próxima exec.",
    "Agendamento",
    "Andaime",
    "Status",
    "Observações",
  ]];

  const body = items.map((item) => [
    item.titulo || "—",
    item.descricao || "—",
    item.empresa || "—",
    item.predio || "—",
    item.responsavel || "—",
    PERIOD_LABEL[item.periodicidade] ?? item.periodicidade,
    fmt(item.ultimaExecucao),
    fmt(item.proximaExecucao),
    fmt(item.agendamento),
    item.precisaAndaime ? "SIM" : "NÃO",
    STATUS_LABEL[statusOf(item)] ?? statusOf(item),
    item.observacoes || "—",
  ]);

  autoTable(doc, {
    head,
    body,
    startY: tableStartY,
    theme: "grid",
    showHead: "firstPage",
    pageBreak: "avoid",
    rowPageBreak: "avoid",
    styles: {
      font: "helvetica",
      fontSize: rowFont,
      cellPadding: { top: rowPadding, right: 2.8, bottom: rowPadding, left: 2.8 },
      lineColor: palette.line,
      lineWidth: 0.4,
      textColor: palette.text,
      valign: "middle",
      overflow: "ellipsize",
      minCellHeight: Math.max(7, targetRowH),
    },
    headStyles: {
      fillColor: palette.navy2,
      textColor: palette.white,
      fontStyle: "bold",
      fontSize: headerFont,
      halign: "center",
      valign: "middle",
      minCellHeight: headerH,
      cellPadding: { top: 4, right: 3, bottom: 4, left: 3 },
      lineColor: [49, 67, 91],
      lineWidth: 0.5,
    },
    bodyStyles: {
      fillColor: palette.white,
    },
    alternateRowStyles: {
      fillColor: palette.surface,
    },
    margin: { top: tableStartY, left: marginX, right: marginX, bottom: 28 },
    columnStyles: {
      0: { cellWidth: widths[0], fontStyle: "bold", halign: "left" },
      1: { cellWidth: widths[1], halign: "left" },
      2: { cellWidth: widths[2], halign: "left" },
      3: { cellWidth: widths[3], halign: "center" },
      4: { cellWidth: widths[4], halign: "left" },
      5: { cellWidth: widths[5], halign: "center" },
      6: { cellWidth: widths[6], halign: "center" },
      7: { cellWidth: widths[7], halign: "center" },
      8: { cellWidth: widths[8], halign: "center", fontStyle: "bold" },
      9: { cellWidth: widths[9], halign: "center", fontStyle: "bold" },
      10: { cellWidth: widths[10], halign: "center", fontStyle: "bold" },
      11: { cellWidth: widths[11], halign: "left" },
    },
    didParseCell: (data: any) => {
      if (data.section !== "body") return;

      if (data.column.index === 8) {
        const value = String(data.cell.raw ?? "");
        if (value !== "—") {
          data.cell.styles.fillColor = palette.surfaceBlue;
          data.cell.styles.textColor = palette.blue;
        } else {
          data.cell.styles.fillColor = palette.slateBg;
          data.cell.styles.textColor = palette.muted;
        }
      }

      if (data.column.index === 9 && String(data.cell.raw ?? "") === "SIM") {
        data.cell.styles.fillColor = palette.amberBg;
        data.cell.styles.textColor = palette.amberText;
      }

      if (data.column.index === 10) {
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
  });

  // Rodapé editorial da única folha.
  doc.setDrawColor(...palette.line);
  doc.setLineWidth(0.5);
  doc.line(marginX, footerY - 10, pageW - marginX, footerY - 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(format === "a1" ? 8.5 : 6.8);
  doc.setTextColor(...palette.muted);
  doc.text(
    "Apont Auto · Painel de Itens Legais · Todos os itens desta exportação consolidados em uma única folha",
    marginX,
    footerY,
  );
  const pageLabel = "FOLHA 01 / 01";
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...palette.navy);
  doc.text(pageLabel, pageW - marginX - doc.getTextWidth(pageLabel), footerY);

  // Segurança adicional: se o autotable ultrapassar uma folha por uma quantidade extrema
  // de registros, mantém apenas a primeira folha em vez de gerar um PDF fragmentado.
  while (doc.getNumberOfPages() > 1) {
    doc.deletePage(doc.getNumberOfPages());
  }

  doc.save(`painel-itens-legais-${year}.pdf`);
}
