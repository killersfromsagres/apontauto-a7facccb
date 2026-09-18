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
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });
  const generatedAt = new Date();
  const generatedLabel = generatedAt.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const m = metrics(items, execs, year);

  const palette = {
    ink: [10, 22, 39] as [number, number, number],
    navy: [17, 42, 73] as [number, number, number],
    blue: [37, 99, 235] as [number, number, number],
    cyan: [14, 165, 233] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    text: [30, 41, 59] as [number, number, number],
    muted: [100, 116, 139] as [number, number, number],
    line: [218, 226, 236] as [number, number, number],
    surface: [248, 250, 252] as [number, number, number],
    greenBg: [220, 252, 231] as [number, number, number],
    greenText: [21, 128, 61] as [number, number, number],
    amberBg: [254, 243, 199] as [number, number, number],
    amberText: [161, 98, 7] as [number, number, number],
    redBg: [254, 226, 226] as [number, number, number],
    redText: [185, 28, 28] as [number, number, number],
    slateBg: [241, 245, 249] as [number, number, number],
  };

  doc.setProperties({
    title: `Painel de Itens Legais ${year}`,
    subject: "Relatório de obrigações, vencimentos, agendamentos e conformidade",
    author: "Apont Auto",
    creator: "Apont Auto",
  });

  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 34;
  const contentW = pageW - marginX * 2;

  // Cabeçalho executivo da primeira página.
  doc.setFillColor(...palette.ink);
  doc.rect(0, 0, pageW, 82, "F");
  doc.setFillColor(...palette.blue);
  doc.rect(0, 80, pageW, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...palette.white);
  doc.text("PAINEL DE ITENS LEGAIS", marginX, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(191, 205, 224);
  doc.text("Relatório executivo de conformidade, recorrências e evidências", marginX, 54);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...palette.white);
  const brand = "APONT AUTO";
  doc.text(brand, pageW - marginX - doc.getTextWidth(brand), 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  const issue = `Ano-base ${year} · Emitido em ${generatedLabel}`;
  doc.text(issue, pageW - marginX - doc.getTextWidth(issue), 51);

  const bandY = 98;
  const bandH = 58;
  doc.setFillColor(...palette.surface);
  doc.setDrawColor(...palette.line);
  doc.roundedRect(marginX, bandY, contentW, bandH, 7, 7, "FD");
  const cards = [
    ["ITENS", String(m.total), palette.blue],
    ["REGULARIDADE", `${m.regularidade}%`, [16, 185, 129] as [number, number, number]],
    ["VENCIDOS", String(m.vencidos), [239, 68, 68] as [number, number, number]],
    ["PRÓXIMOS", String(m.proximos), [245, 158, 11] as [number, number, number]],
    ["AGENDADOS", String(m.agendados), palette.cyan],
    ["EXECUÇÕES NO ANO", String(m.execucoesAno), [99, 102, 241] as [number, number, number]],
  ] as const;
  const cardW = contentW / cards.length;
  cards.forEach(([label, value, accent], index) => {
    const x = marginX + cardW * index;
    if (index) {
      doc.setDrawColor(...palette.line);
      doc.line(x, bandY + 12, x, bandY + bandH - 12);
    }
    doc.setFillColor(...accent);
    doc.roundedRect(x + 12, bandY + 14, 4, bandH - 28, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...palette.ink);
    doc.text(value, x + 25, bandY + 28);
    doc.setFontSize(6.8);
    doc.setTextColor(...palette.muted);
    doc.text(label, x + 25, bandY + 43);
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...palette.muted);
  doc.text(
    "Legenda: verde = em dia/concluído  ·  amarelo = próximo do vencimento  ·  vermelho = vencido  ·  cinza = sem agenda",
    marginX,
    173,
  );

  const head = [[
    "Item legal", "Empresa", "Prédio", "Periodic.", "Última exec.", "Próxima exec.",
    "Agendamento", "Andaime", "Status", "Observações",
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
    startY: 184,
    theme: "grid",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    margin: { top: 42, right: marginX, bottom: 42, left: marginX },
    styles: {
      font: "helvetica",
      fontSize: 7.4,
      cellPadding: { top: 5, right: 4, bottom: 5, left: 4 },
      lineColor: palette.line,
      lineWidth: 0.4,
      textColor: palette.text,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: palette.navy,
      textColor: palette.white,
      fontStyle: "bold",
      fontSize: 7.5,
      halign: "center",
      cellPadding: 6,
      lineColor: [49, 67, 91],
    },
    bodyStyles: { fillColor: palette.white },
    alternateRowStyles: { fillColor: palette.surface },
    columnStyles: {
      0: { cellWidth: 155, fontStyle: "bold" },
      1: { cellWidth: 118 },
      2: { cellWidth: 72 },
      3: { cellWidth: 70, halign: "center" },
      4: { cellWidth: 72, halign: "center" },
      5: { cellWidth: 72, halign: "center" },
      6: { cellWidth: 72, halign: "center" },
      7: { cellWidth: 52, halign: "center", fontStyle: "bold" },
      8: { cellWidth: 75, halign: "center", fontStyle: "bold" },
      9: { cellWidth: "auto" },
    },
    didParseCell: (data: any) => {
      if (data.section !== "body") return;
      if (data.column.index === 7 && String(data.cell.raw) === "SIM") {
        data.cell.styles.fillColor = palette.amberBg;
        data.cell.styles.textColor = palette.amberText;
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
  });

  // Paginação final, aplicada depois da tabela para conhecer o total real.
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    const pageHeight = doc.internal.pageSize.getHeight();
    const width = doc.internal.pageSize.getWidth();
    doc.setDrawColor(...palette.line);
    doc.setLineWidth(0.5);
    doc.line(marginX, pageHeight - 28, width - marginX, pageHeight - 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...palette.muted);
    doc.text(`Apont Auto · Painel de Itens Legais · Emitido em ${generatedLabel}`, marginX, pageHeight - 14);
    const pageLabel = `Página ${page} de ${totalPages}`;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...palette.navy);
    doc.text(pageLabel, width - marginX - doc.getTextWidth(pageLabel), pageHeight - 14);
  }

  doc.save(`painel-legal-${year}-${dateStamp(generatedAt)}.pdf`);
}
