// Bibliotecas pesadas continuam carregadas sob demanda, apenas no momento da exportação.
import type { LegalExecution, LegalItem } from "@/lib/legal-items";
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

function fmt(date: string | null | undefined) {
  if (!date) return "—";
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR");
}

function dateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function metrics(items: LegalItem[], execs: LegalExecution[], year: number) {
  const statuses = items.map(statusOf);
  const emDia = statuses.filter((status) => status === "em_dia" || status === "concluido").length;
  const proximos = statuses.filter((status) => status === "proximo").length;
  const vencidos = statuses.filter((status) => status === "vencido").length;
  const agendados = items.filter((item) => Boolean(item.agendamento)).length;
  const execucoesAno = execs.filter((exec) => exec.data.startsWith(`${year}-`)).length;
  return {
    total: items.length,
    emDia,
    proximos,
    vencidos,
    agendados,
    execucoesAno,
    regularidade: items.length ? Math.round((emDia / items.length) * 100) : 0,
  };
}

async function loadImageData(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportLegalXLSX(items: LegalItem[], execs: LegalExecution[], year: number) {
  const XLSX = await import("xlsx");
  const generatedAt = new Date();
  const m = metrics(items, execs, year);

  const summaryRows = [
    ["PAINEL DE ITENS LEGAIS"],
    ["Resumo executivo de conformidade e recorrências"],
    [],
    ["Ano-base", year],
    ["Emitido em", generatedAt.toLocaleString("pt-BR")],
    [],
    ["Indicador", "Valor"],
    ["Total de itens", m.total],
    ["Em dia / concluídos", m.emDia],
    ["Regularidade", `${m.regularidade}%`],
    ["Próximos do vencimento", m.proximos],
    ["Vencidos", m.vencidos],
    ["Agendados", m.agendados],
    ["Execuções no ano", m.execucoesAno],
  ];
  const summary = XLSX.utils.aoa_to_sheet(summaryRows);
  summary["!cols"] = [{ wch: 34 }, { wch: 24 }];

  const rows = items.map((item) => {
    const cells = buildMonthMap(item, execs, year);
    const monthCols: Record<string, string> = {};
    MONTHS.forEach((month, index) => {
      monthCols[month] =
        cells[index] === "done"
          ? "Concluído"
          : cells[index] === "scheduled"
            ? "Programado"
            : cells[index] === "overdue"
              ? "Vencido"
              : "";
    });
    return {
      "Item legal": item.titulo,
      Empresa: item.empresa,
      Prédio: item.predio,
      Periodicidade: PERIOD_LABEL[item.periodicidade] ?? item.periodicidade,
      "Última execução": item.ultimaExecucao ? fmt(item.ultimaExecucao) : "",
      "Próxima execução": item.proximaExecucao ? fmt(item.proximaExecucao) : "",
      Agendamento: item.agendamento ? fmt(item.agendamento) : "",
      Status: STATUS_LABEL[statusOf(item)] ?? statusOf(item),
      Andaime: item.precisaAndaime ? "Sim" : "Não",
      ...monthCols,
      Observações: item.observacoes,
    };
  });

  const details = XLSX.utils.json_to_sheet(rows);
  details["!cols"] = [
    { wch: 42 }, { wch: 28 }, { wch: 18 }, { wch: 16 }, { wch: 17 }, { wch: 17 },
    { wch: 17 }, { wch: 21 }, { wch: 10 }, ...MONTHS.map(() => ({ wch: 12 })), { wch: 52 },
  ];
  details["!autofilter"] = { ref: details["!ref"] ?? "A1:A1" };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, summary, "Resumo");
  XLSX.utils.book_append_sheet(workbook, details, "Itens Legais");
  XLSX.writeFile(workbook, `painel-legal-${year}-${dateStamp(generatedAt)}.xlsx`);
}

export async function exportLegalPDF(items: LegalItem[], execs: LegalExecution[], year: number) {
  const [{ jsPDF }, { default: autoTable }, logoData] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    loadImageData("/apontauto-logo.png"),
  ]);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });
  const generatedAt = new Date();
  const generatedLabel = generatedAt.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const m = metrics(items, execs, year);

  const palette = {
    ink: [7, 15, 28] as [number, number, number],
    navy: [15, 32, 55] as [number, number, number],
    navySoft: [25, 48, 78] as [number, number, number],
    blue: [63, 126, 255] as [number, number, number],
    cyan: [70, 211, 255] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    text: [28, 39, 56] as [number, number, number],
    muted: [104, 116, 134] as [number, number, number],
    line: [220, 226, 234] as [number, number, number],
    lineStrong: [203, 211, 222] as [number, number, number],
    surface: [247, 249, 252] as [number, number, number],
    surface2: [241, 245, 249] as [number, number, number],
    green: [16, 185, 129] as [number, number, number],
    greenBg: [226, 248, 240] as [number, number, number],
    greenText: [5, 122, 85] as [number, number, number],
    amber: [245, 158, 11] as [number, number, number],
    amberBg: [255, 247, 224] as [number, number, number],
    amberText: [157, 91, 0] as [number, number, number],
    red: [239, 68, 68] as [number, number, number],
    redBg: [255, 237, 237] as [number, number, number],
    redText: [185, 28, 28] as [number, number, number],
    slateBg: [241, 245, 249] as [number, number, number],
    violet: [99, 102, 241] as [number, number, number],
  };

  doc.setProperties({
    title: `Painel de Itens Legais ${year}`,
    subject: "Relatório executivo de conformidade legal, vencimentos, agendamentos e evidências",
    author: "Apont Auto",
    creator: "Apont Auto",
    keywords: "painel legal, compliance, PCM, manutenção, conformidade, vencimentos",
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 36;
  const contentW = pageW - marginX * 2;

  const statuses = items.map(statusOf);
  const semAgenda = statuses.filter((status) => status === "sem_agenda").length;
  const andaime = items.filter((item) => item.precisaAndaime).length;
  const empresas = new Set(items.map((item) => item.empresa.trim()).filter(Boolean)).size;
  const critical = m.vencidos + m.proximos;
  const nextItems = items
    .filter((item) => item.proximaExecucao)
    .sort((a, b) => a.proximaExecucao.localeCompare(b.proximaExecucao))
    .slice(0, 3);

  const drawBrandMark = (x: number, y: number) => {
    if (logoData) {
      try {
        doc.addImage(logoData, "PNG", x, y, 98, 42, undefined, "FAST");
        return;
      } catch {
        // Mantém o fallback vetorial abaixo.
      }
    }
    doc.setFillColor(...palette.blue);
    doc.roundedRect(x, y + 4, 34, 34, 8, 8, "F");
    doc.setDrawColor(...palette.white);
    doc.setLineWidth(2.2);
    doc.line(x + 8, y + 29, x + 17, y + 10);
    doc.line(x + 17, y + 10, x + 26, y + 29);
    doc.line(x + 12, y + 22, x + 22, y + 22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...palette.white);
    doc.text("APONT AUTO", x + 44, y + 25);
  };

  const drawCompactPageHeader = (pageNumber: number) => {
    doc.setFillColor(...palette.ink);
    doc.rect(0, 0, pageW, 50, "F");
    doc.setFillColor(...palette.blue);
    doc.rect(0, 48, pageW, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...palette.white);
    doc.text("PAINEL DE ITENS LEGAIS", marginX, 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(167, 181, 201);
    doc.text(`Relatório de conformidade · Ano-base ${year}`, marginX, 35);
    const right = `APONT AUTO  ·  Continuação  ·  ${String(pageNumber).padStart(2, "0")}`;
    doc.text(right, pageW - marginX - doc.getTextWidth(right), 29);
  };

  // Fundo e cabeçalho principal.
  doc.setFillColor(...palette.white);
  doc.rect(0, 0, pageW, pageH, "F");
  doc.setFillColor(...palette.ink);
  doc.rect(0, 0, pageW, 94, "F");
  doc.setFillColor(...palette.navy);
  doc.rect(pageW * 0.67, 0, pageW * 0.33, 94, "F");
  doc.setFillColor(...palette.blue);
  doc.rect(0, 91, pageW, 3, "F");
  doc.setFillColor(...palette.cyan);
  doc.rect(0, 91, pageW * 0.16, 3, "F");

  drawBrandMark(marginX, 21);

  const titleX = logoData ? marginX + 118 : marginX + 152;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(136, 157, 186);
  doc.text("GESTÃO DE COMPLIANCE E RECORRÊNCIAS", titleX, 28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20.5);
  doc.setTextColor(...palette.white);
  doc.text("PAINEL DE ITENS LEGAIS", titleX, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.setTextColor(183, 198, 219);
  doc.text("Visão executiva de obrigações, vencimentos, agendamentos e evidências documentais", titleX, 68);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.2);
  doc.setTextColor(...palette.white);
  const docType = "RELATÓRIO EXECUTIVO";
  doc.text(docType, pageW - marginX - doc.getTextWidth(docType), 29);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.3);
  doc.setTextColor(155, 171, 194);
  const meta1 = `Ano-base  ${year}`;
  const meta2 = `Emissão  ${generatedLabel}`;
  doc.text(meta1, pageW - marginX - doc.getTextWidth(meta1), 48);
  doc.text(meta2, pageW - marginX - doc.getTextWidth(meta2), 63);
  doc.setTextColor(113, 132, 158);
  const control = "Controle interno · Documento gerado pelo sistema";
  doc.text(control, pageW - marginX - doc.getTextWidth(control), 78);

  // KPIs em cartões independentes.
  const cardsY = 112;
  const cardsH = 62;
  const gap = 10;
  const cards = [
    { label: "TOTAL DE ITENS", value: String(m.total), accent: palette.blue, note: `${empresas} empresa(s)` },
    { label: "REGULARIDADE", value: `${m.regularidade}%`, accent: palette.green, note: `${m.emDia} em dia` },
    { label: "VENCIDOS", value: String(m.vencidos), accent: palette.red, note: "ação imediata" },
    { label: "PRÓXIMOS", value: String(m.proximos), accent: palette.amber, note: "até 15 dias" },
    { label: "AGENDADOS", value: String(m.agendados), accent: palette.cyan, note: `${semAgenda} sem agenda` },
    { label: "EXECUÇÕES", value: String(m.execucoesAno), accent: palette.violet, note: `realizadas em ${year}` },
  ];
  const cardW = (contentW - gap * (cards.length - 1)) / cards.length;

  cards.forEach((card, index) => {
    const x = marginX + index * (cardW + gap);
    doc.setFillColor(229, 234, 241);
    doc.roundedRect(x + 1.6, cardsY + 2.2, cardW, cardsH, 8, 8, "F");
    doc.setFillColor(...palette.white);
    doc.setDrawColor(...palette.line);
    doc.setLineWidth(0.55);
    doc.roundedRect(x, cardsY, cardW, cardsH, 8, 8, "FD");
    doc.setFillColor(...card.accent);
    doc.roundedRect(x, cardsY, 4.5, cardsH, 2.2, 2.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15.5);
    doc.setTextColor(...palette.ink);
    doc.text(card.value, x + 18, cardsY + 26);
    doc.setFontSize(6.6);
    doc.setTextColor(...palette.muted);
    doc.text(card.label, x + 18, cardsY + 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.4);
    doc.setTextColor(139, 150, 166);
    doc.text(card.note, x + 18, cardsY + 52);
  });

  // Faixa executiva com score e prioridades.
  const executiveY = 190;
  const executiveH = 55;
  const leftW = 330;
  doc.setFillColor(...palette.surface);
  doc.setDrawColor(...palette.line);
  doc.roundedRect(marginX, executiveY, contentW, executiveH, 8, 8, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.setTextColor(...palette.navy);
  doc.text("ÍNDICE DE CONFORMIDADE", marginX + 16, executiveY + 17);
  doc.setFontSize(18);
  doc.setTextColor(...palette.ink);
  doc.text(`${m.regularidade}%`, marginX + 16, executiveY + 38);

  const progressX = marginX + 78;
  const progressY = executiveY + 30;
  const progressW = leftW - 100;
  doc.setFillColor(226, 231, 238);
  doc.roundedRect(progressX, progressY, progressW, 7, 3.5, 3.5, "F");
  const progressColor = m.regularidade >= 90 ? palette.green : m.regularidade >= 70 ? palette.amber : palette.red;
  doc.setFillColor(...progressColor);
  doc.roundedRect(progressX, progressY, Math.max(5, progressW * (m.regularidade / 100)), 7, 3.5, 3.5, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...palette.muted);
  doc.text("Percentual de itens classificados como em dia/concluídos", progressX, executiveY + 46);

  doc.setDrawColor(...palette.lineStrong);
  doc.line(marginX + leftW, executiveY + 12, marginX + leftW, executiveY + executiveH - 12);

  const priorityX = marginX + leftW + 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.setTextColor(...palette.navy);
  doc.text("LEITURA EXECUTIVA", priorityX, executiveY + 17);

  const executiveText = critical > 0
    ? `${critical} item(ns) exigem atenção: ${m.vencidos} vencido(s) e ${m.proximos} próximo(s) do vencimento.`
    : "Nenhum item vencido ou próximo do vencimento no recorte atual.";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.3);
  doc.setTextColor(...palette.text);
  doc.text(executiveText, priorityX, executiveY + 34);
  doc.setTextColor(...palette.muted);
  doc.text(`${andaime} item(ns) requerem andaime · ${m.agendados} possuem agendamento específico · ${semAgenda} sem agenda`, priorityX, executiveY + 47);

  // Próximos vencimentos em uma linha discreta antes da tabela.
  const nextY = 260;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...palette.navy);
  doc.text("PRÓXIMAS REFERÊNCIAS", marginX, nextY);

  let nextX = marginX + 102;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.7);
  doc.setTextColor(...palette.muted);
  if (nextItems.length === 0) {
    doc.text("Nenhuma próxima execução cadastrada.", nextX, nextY);
  } else {
    nextItems.forEach((item, index) => {
      const label = `${fmt(item.proximaExecucao)} · ${item.titulo}`;
      const maxW = (contentW - 110) / Math.max(1, nextItems.length) - 14;
      const clipped = doc.splitTextToSize(label, maxW)[0] ?? label;
      doc.text(clipped, nextX, nextY);
      nextX += maxW + 14;
      if (index < nextItems.length - 1) {
        doc.setFillColor(...palette.lineStrong);
        doc.circle(nextX - 8, nextY - 2, 1.2, "F");
      }
    });
  }

  doc.setDrawColor(...palette.line);
  doc.line(marginX, 272, pageW - marginX, 272);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...palette.muted);
  doc.text(
    "Legenda de status:  Em dia / Concluído   ·   Próximo do vencimento   ·   Vencido   ·   Sem agenda",
    marginX,
    285,
  );

  const head = [[
    "ITEM LEGAL",
    "EMPRESA",
    "PRÉDIO",
    "PERIODICIDADE",
    "ÚLTIMA EXEC.",
    "PRÓXIMA EXEC.",
    "AGENDAMENTO",
    "ANDAIME",
    "STATUS",
    "OBSERVAÇÕES",
  ]];

  const body = items.map((item) => [
    item.titulo || "—",
    item.empresa || "—",
    item.predio || "—",
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
    startY: 298,
    theme: "plain",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    margin: { top: 66, right: marginX, bottom: 46, left: marginX },
    styles: {
      font: "helvetica",
      fontSize: 7.25,
      cellPadding: { top: 5.4, right: 4.8, bottom: 5.4, left: 4.8 },
      textColor: palette.text,
      valign: "middle",
      overflow: "linebreak",
      lineWidth: 0,
    },
    headStyles: {
      fillColor: palette.navy,
      textColor: palette.white,
      fontStyle: "bold",
      fontSize: 6.7,
      halign: "center",
      valign: "middle",
      cellPadding: { top: 7, right: 4, bottom: 7, left: 4 },
      lineColor: palette.navySoft,
      lineWidth: 0.35,
    },
    bodyStyles: { fillColor: palette.white },
    alternateRowStyles: { fillColor: palette.surface },
    columnStyles: {
      0: { cellWidth: 168, fontStyle: "bold" },
      1: { cellWidth: 120 },
      2: { cellWidth: 76 },
      3: { cellWidth: 75, halign: "center" },
      4: { cellWidth: 77, halign: "center" },
      5: { cellWidth: 77, halign: "center", fontStyle: "bold" },
      6: { cellWidth: 77, halign: "center" },
      7: { cellWidth: 55, halign: "center", fontStyle: "bold" },
      8: { cellWidth: 78, halign: "center", fontStyle: "bold" },
      9: { cellWidth: "auto" },
    },
    didParseCell: (data: any) => {
      if (data.section !== "body") return;
      const item = items[data.row.index];
      const status = item ? statusOf(item) : null;

      if (data.column.index === 5 && status === "vencido") {
        data.cell.styles.textColor = palette.redText;
        data.cell.styles.fontStyle = "bold";
      }

      if (data.column.index === 7) {
        if (String(data.cell.raw) === "SIM") {
          data.cell.styles.fillColor = palette.amberBg;
          data.cell.styles.textColor = palette.amberText;
        } else {
          data.cell.styles.textColor = palette.muted;
        }
      }

      if (data.column.index === 8) {
        const value = String(data.cell.raw ?? "");
        if (value === "Vencido") {
          data.cell.styles.fillColor = palette.redBg;
          data.cell.styles.textColor = palette.redText;
        } else if (value === "Próximo") {
          data.cell.styles.fillColor = palette.amberBg;
          data.cell.styles.textColor = palette.amberText;
        } else if (value === "Em dia" || value === "Concluído") {
          data.cell.styles.fillColor = palette.greenBg;
          data.cell.styles.textColor = palette.greenText;
        } else {
          data.cell.styles.fillColor = palette.slateBg;
          data.cell.styles.textColor = palette.muted;
        }
      }
    },
    didDrawCell: (data: any) => {
      if (data.section !== "body" || data.column.index !== 0) return;
      const item = items[data.row.index];
      if (!item) return;
      const status = statusOf(item);
      const accent =
        status === "vencido"
          ? palette.red
          : status === "proximo"
            ? palette.amber
            : status === "em_dia" || status === "concluido"
              ? palette.green
              : palette.muted;
      doc.setFillColor(...accent);
      doc.rect(data.cell.x, data.cell.y + 2, 2.2, Math.max(2, data.cell.height - 4), "F");
      doc.setDrawColor(...palette.line);
      doc.setLineWidth(0.35);
      doc.line(data.cell.x, data.cell.y + data.cell.height, pageW - marginX, data.cell.y + data.cell.height);
    },
    didDrawPage: () => {
      const current = doc.internal.getCurrentPageInfo().pageNumber;
      if (current > 1) drawCompactPageHeader(current);
    },
  });

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    const height = doc.internal.pageSize.getHeight();
    const width = doc.internal.pageSize.getWidth();

    doc.setDrawColor(...palette.line);
    doc.setLineWidth(0.45);
    doc.line(marginX, height - 31, width - marginX, height - 31);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.6);
    doc.setTextColor(...palette.muted);
    doc.text("APONT AUTO  ·  PCM / COMPLIANCE  ·  Documento de controle interno", marginX, height - 17);

    const center = `Emitido em ${generatedLabel}`;
    doc.text(center, width / 2 - doc.getTextWidth(center) / 2, height - 17);

    const pageLabel = `PÁGINA ${String(page).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...palette.navy);
    doc.text(pageLabel, width - marginX - doc.getTextWidth(pageLabel), height - 17);
  }

  doc.save(`painel-legal-${year}-${dateStamp(generatedAt)}.pdf`);
}
