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
    ink: [8, 18, 34] as [number, number, number],
    navy: [14, 32, 57] as [number, number, number],
    navySoft: [25, 51, 86] as [number, number, number],
    blue: [50, 107, 255] as [number, number, number],
    blueSoft: [230, 238, 255] as [number, number, number],
    cyan: [55, 201, 238] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
    paper: [252, 253, 255] as [number, number, number],
    text: [28, 40, 58] as [number, number, number],
    muted: [103, 117, 137] as [number, number, number],
    subtle: [143, 154, 171] as [number, number, number],
    line: [220, 227, 236] as [number, number, number],
    lineStrong: [202, 212, 225] as [number, number, number],
    surface: [247, 249, 252] as [number, number, number],
    surface2: [241, 245, 250] as [number, number, number],
    green: [12, 169, 116] as [number, number, number],
    greenBg: [225, 247, 239] as [number, number, number],
    greenText: [5, 122, 85] as [number, number, number],
    amber: [239, 153, 15] as [number, number, number],
    amberBg: [255, 247, 224] as [number, number, number],
    amberText: [157, 91, 0] as [number, number, number],
    red: [232, 70, 70] as [number, number, number],
    redBg: [255, 237, 237] as [number, number, number],
    redText: [181, 35, 35] as [number, number, number],
    slateBg: [239, 243, 248] as [number, number, number],
    violet: [103, 92, 222] as [number, number, number],
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
  const marginX = 38;
  const contentW = pageW - marginX * 2;

  const statuses = items.map(statusOf);
  const semAgenda = statuses.filter((status) => status === "sem_agenda").length;
  const andaime = items.filter((item) => item.precisaAndaime).length;
  const empresas = new Set(items.map((item) => item.empresa.trim()).filter(Boolean)).size;
  const critical = m.vencidos + m.proximos;
  const nextItems = items
    .filter((item) => Boolean(item.proximaExecucao))
    .sort((a, b) => (a.proximaExecucao ?? "").localeCompare(b.proximaExecucao ?? ""))
    .slice(0, 3);

  const addContainedImage = (
    data: string,
    x: number,
    y: number,
    maxW: number,
    maxH: number,
  ) => {
    const properties = doc.getImageProperties(data);
    const sourceW = Math.max(1, Number(properties.width) || 1);
    const sourceH = Math.max(1, Number(properties.height) || 1);
    const scale = Math.min(maxW / sourceW, maxH / sourceH);
    const width = sourceW * scale;
    const height = sourceH * scale;
    doc.addImage(
      data,
      "PNG",
      x + (maxW - width) / 2,
      y + (maxH - height) / 2,
      width,
      height,
      undefined,
      "FAST",
    );
  };

  const drawBrandMark = (x: number, y: number, size = 52) => {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.4);
    doc.roundedRect(x, y, size, size, 10, 10, "FD");

    if (logoData) {
      try {
        addContainedImage(logoData, x + 5, y + 5, size - 10, size - 10);
        return;
      } catch {
        // Mantém o fallback vetorial caso o arquivo da logo não carregue.
      }
    }

    doc.setFillColor(...palette.blue);
    doc.roundedRect(x + 8, y + 8, size - 16, size - 16, 8, 8, "F");
    doc.setDrawColor(...palette.white);
    doc.setLineWidth(2.1);
    doc.line(x + 16, y + size - 17, x + size / 2, y + 15);
    doc.line(x + size / 2, y + 15, x + size - 16, y + size - 17);
    doc.line(x + 20, y + size - 24, x + size - 20, y + size - 24);
  };

  const drawCompactPageHeader = (pageNumber: number) => {
    doc.setFillColor(...palette.ink);
    doc.rect(0, 0, pageW, 58, "F");
    doc.setFillColor(...palette.navy);
    doc.rect(pageW * 0.79, 0, pageW * 0.21, 58, "F");
    doc.setFillColor(...palette.blue);
    doc.rect(0, 56, pageW, 2, "F");

    drawBrandMark(marginX, 10, 34);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...palette.white);
    doc.text("PAINEL DE ITENS LEGAIS", marginX + 47, 25);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(170, 186, 208);
    doc.text(`Relatório executivo de conformidade · Ano-base ${year}`, marginX + 47, 39);

    const right = `CONTINUAÇÃO  ·  ${String(pageNumber).padStart(2, "0")}`;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(202, 214, 230);
    doc.text(right, pageW - marginX - doc.getTextWidth(right), 31);
  };

  const drawMetricCard = (
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    value: string,
    note: string,
    accent: [number, number, number],
  ) => {
    doc.setFillColor(228, 234, 242);
    doc.roundedRect(x + 1.8, y + 2.4, w, h, 9, 9, "F");
    doc.setFillColor(...palette.white);
    doc.setDrawColor(...palette.line);
    doc.setLineWidth(0.55);
    doc.roundedRect(x, y, w, h, 9, 9, "FD");
    doc.setFillColor(...accent);
    doc.roundedRect(x, y, w, 4.2, 9, 9, "F");
    doc.rect(x, y + 3, w, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16.5);
    doc.setTextColor(...palette.ink);
    doc.text(value, x + 15, y + 29);

    doc.setFontSize(6.6);
    doc.setTextColor(...palette.muted);
    doc.text(label, x + 15, y + 44);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.3);
    doc.setTextColor(...palette.subtle);
    doc.text(note, x + 15, y + 57);
  };

  // Página inicial: cabeçalho institucional.
  doc.setFillColor(...palette.paper);
  doc.rect(0, 0, pageW, pageH, "F");
  doc.setFillColor(...palette.ink);
  doc.rect(0, 0, pageW, 112, "F");
  doc.setFillColor(...palette.navy);
  doc.rect(pageW * 0.69, 0, pageW * 0.31, 112, "F");
  doc.setFillColor(...palette.navySoft);
  doc.rect(pageW * 0.86, 0, pageW * 0.14, 112, "F");
  doc.setFillColor(...palette.blue);
  doc.rect(0, 108, pageW, 4, "F");
  doc.setFillColor(...palette.cyan);
  doc.rect(0, 108, pageW * 0.13, 4, "F");

  drawBrandMark(marginX, 28, 56);

  const titleX = marginX + 76;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.3);
  doc.setTextColor(126, 154, 194);
  doc.text("PCM  /  COMPLIANCE  /  CONTROLE DE RECORRÊNCIAS", titleX, 35);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(23);
  doc.setTextColor(...palette.white);
  doc.text("PAINEL DE ITENS LEGAIS", titleX, 61);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.6);
  doc.setTextColor(187, 201, 220);
  doc.text(
    "Relatório executivo de obrigações, vencimentos, agendamentos e evidências documentais",
    titleX,
    80,
  );
  doc.setFontSize(6.8);
  doc.setTextColor(126, 148, 180);
  doc.text("Documento de controle interno · visão consolidada para acompanhamento e tomada de decisão", titleX, 95);

  const metaRight = pageW - marginX;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.1);
  doc.setTextColor(156, 177, 205);
  const reportLabel = "RELATÓRIO EXECUTIVO";
  doc.text(reportLabel, metaRight - doc.getTextWidth(reportLabel), 31);

  doc.setFontSize(14.5);
  doc.setTextColor(...palette.white);
  const yearLabel = String(year);
  doc.text(yearLabel, metaRight - doc.getTextWidth(yearLabel), 54);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.1);
  doc.setTextColor(175, 192, 214);
  const emitted = `Emitido em ${generatedLabel}`;
  doc.text(emitted, metaRight - doc.getTextWidth(emitted), 73);
  doc.setTextColor(126, 148, 180);
  const system = "Apont Auto · Gestão de Manutenção";
  doc.text(system, metaRight - doc.getTextWidth(system), 91);

  // Linha de KPIs.
  const cardsY = 132;
  const cardsH = 68;
  const gap = 10;
  const cards = [
    { label: "TOTAL DE ITENS", value: String(m.total), note: `${empresas} empresa(s) no escopo`, accent: palette.blue },
    { label: "REGULARIDADE", value: `${m.regularidade}%`, note: `${m.emDia} item(ns) em dia`, accent: palette.green },
    { label: "VENCIDOS", value: String(m.vencidos), note: "tratamento prioritário", accent: palette.red },
    { label: "PRÓXIMOS", value: String(m.proximos), note: "janela de até 15 dias", accent: palette.amber },
    { label: "AGENDADOS", value: String(m.agendados), note: `${semAgenda} item(ns) sem agenda`, accent: palette.cyan },
    { label: "EXECUÇÕES", value: String(m.execucoesAno), note: `realizadas em ${year}`, accent: palette.violet },
  ];
  const cardW = (contentW - gap * (cards.length - 1)) / cards.length;
  cards.forEach((card, index) => {
    drawMetricCard(
      marginX + index * (cardW + gap),
      cardsY,
      cardW,
      cardsH,
      card.label,
      card.value,
      card.note,
      card.accent,
    );
  });

  // Leitura executiva em três blocos.
  const executiveY = 219;
  const executiveH = 82;
  const panelGap = 10;
  const scoreW = 330;
  const operationalW = 245;
  const riskW = contentW - scoreW - operationalW - panelGap * 2;

  doc.setFillColor(...palette.white);
  doc.setDrawColor(...palette.line);
  doc.setLineWidth(0.55);
  doc.roundedRect(marginX, executiveY, scoreW, executiveH, 9, 9, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.7);
  doc.setTextColor(...palette.muted);
  doc.text("ÍNDICE DE CONFORMIDADE", marginX + 16, executiveY + 20);

  doc.setFontSize(22);
  doc.setTextColor(...palette.ink);
  doc.text(`${m.regularidade}%`, marginX + 16, executiveY + 48);

  const scoreText = m.regularidade >= 90 ? "NÍVEL ELEVADO" : m.regularidade >= 70 ? "ATENÇÃO" : "AÇÃO NECESSÁRIA";
  const scoreColor = m.regularidade >= 90 ? palette.green : m.regularidade >= 70 ? palette.amber : palette.red;
  doc.setFillColor(...scoreColor);
  doc.roundedRect(marginX + 92, executiveY + 31, 86, 18, 9, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.2);
  doc.setTextColor(...palette.white);
  doc.text(scoreText, marginX + 135 - doc.getTextWidth(scoreText) / 2, executiveY + 43);

  const progressX = marginX + 16;
  const progressY = executiveY + 61;
  const progressW = scoreW - 32;
  doc.setFillColor(229, 234, 241);
  doc.roundedRect(progressX, progressY, progressW, 7, 3.5, 3.5, "F");
  if (m.regularidade > 0) {
    doc.setFillColor(...scoreColor);
    doc.roundedRect(
      progressX,
      progressY,
      Math.max(7, progressW * (m.regularidade / 100)),
      7,
      3.5,
      3.5,
      "F",
    );
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.1);
  doc.setTextColor(...palette.subtle);
  doc.text("Percentual de itens em dia ou concluídos", progressX, executiveY + 76);

  const riskX = marginX + scoreW + panelGap;
  doc.setFillColor(...palette.white);
  doc.setDrawColor(...palette.line);
  doc.roundedRect(riskX, executiveY, riskW, executiveH, 9, 9, "FD");
  doc.setFillColor(...(critical > 0 ? palette.red : palette.green));
  doc.roundedRect(riskX, executiveY, 4, executiveH, 2, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.7);
  doc.setTextColor(...palette.muted);
  doc.text("LEITURA DE RISCO", riskX + 17, executiveY + 20);

  doc.setFontSize(14.5);
  doc.setTextColor(...palette.ink);
  doc.text(String(critical), riskX + 17, executiveY + 45);
  doc.setFontSize(7.2);
  doc.setTextColor(...palette.text);
  doc.text("item(ns) exigem atenção no recorte atual", riskX + 43, executiveY + 44);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...palette.muted);
  doc.text(`${m.vencidos} vencido(s)  ·  ${m.proximos} próximo(s) do vencimento`, riskX + 17, executiveY + 62);
  doc.setTextColor(...palette.subtle);
  doc.text(
    critical > 0 ? "Priorize vencidos e confirme os próximos agendamentos." : "Nenhuma criticidade imediata identificada.",
    riskX + 17,
    executiveY + 76,
  );

  const operationalX = riskX + riskW + panelGap;
  doc.setFillColor(...palette.navy);
  doc.setDrawColor(...palette.navy);
  doc.roundedRect(operationalX, executiveY, operationalW, executiveH, 9, 9, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.7);
  doc.setTextColor(139, 166, 201);
  doc.text("LEITURA OPERACIONAL", operationalX + 16, executiveY + 20);
  doc.setFontSize(10.5);
  doc.setTextColor(...palette.white);
  doc.text(`${andaime} com andaime`, operationalX + 16, executiveY + 42);
  doc.text(`${m.agendados} agendados`, operationalX + 16, executiveY + 58);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.4);
  doc.setTextColor(169, 187, 211);
  doc.text(`${semAgenda} item(ns) sem agenda definida`, operationalX + 16, executiveY + 73);

  // Próximas referências em cartões curtos.
  const referencesY = 318;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.setTextColor(...palette.navy);
  doc.text("PRÓXIMAS REFERÊNCIAS", marginX, referencesY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.4);
  doc.setTextColor(...palette.subtle);
  doc.text("Três próximas execuções cadastradas", marginX + 111, referencesY);

  const refCardsY = referencesY + 10;
  const refGap = 9;
  const refW = (contentW - refGap * 2) / 3;
  const refH = 42;

  if (nextItems.length === 0) {
    doc.setFillColor(...palette.surface);
    doc.setDrawColor(...palette.line);
    doc.roundedRect(marginX, refCardsY, contentW, refH, 7, 7, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...palette.muted);
    doc.text("Nenhuma próxima execução cadastrada para o período.", marginX + 14, refCardsY + 25);
  } else {
    for (let index = 0; index < 3; index += 1) {
      const x = marginX + index * (refW + refGap);
      const item = nextItems[index];
      doc.setFillColor(...palette.surface);
      doc.setDrawColor(...palette.line);
      doc.roundedRect(x, refCardsY, refW, refH, 7, 7, "FD");

      if (!item) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(169, 178, 191);
        doc.text("Sem outra referência cadastrada", x + 13, refCardsY + 25);
        continue;
      }

      doc.setFillColor(...palette.blue);
      doc.roundedRect(x + 11, refCardsY + 10, 60, 21, 10.5, 10.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(...palette.white);
      const dateText = fmt(item.proximaExecucao);
      doc.text(dateText, x + 41 - doc.getTextWidth(dateText) / 2, refCardsY + 24);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.7);
      doc.setTextColor(...palette.text);
      const clippedTitle = doc.splitTextToSize(item.titulo || "Item legal", refW - 94)[0] ?? "Item legal";
      doc.text(clippedTitle, x + 82, refCardsY + 20);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.1);
      doc.setTextColor(...palette.muted);
      const clippedMeta = doc.splitTextToSize(`${item.empresa || "Sem empresa"} · ${item.predio || "Sem prédio"}`, refW - 94)[0] ?? "";
      doc.text(clippedMeta, x + 82, refCardsY + 32);
    }
  }

  // Legenda e tabela detalhada.
  const legendY = 384;
  const legend = [
    { label: "Em dia / concluído", color: palette.green },
    { label: "Próximo", color: palette.amber },
    { label: "Vencido", color: palette.red },
    { label: "Sem agenda", color: palette.muted },
  ];

  doc.setDrawColor(...palette.line);
  doc.line(marginX, legendY - 10, pageW - marginX, legendY - 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...palette.muted);
  doc.text("LEGENDA", marginX, legendY + 2);

  let legendX = marginX + 52;
  legend.forEach((entry) => {
    doc.setFillColor(...entry.color);
    doc.circle(legendX, legendY, 2.6, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.4);
    doc.setTextColor(...palette.muted);
    doc.text(entry.label, legendX + 7, legendY + 2);
    legendX += doc.getTextWidth(entry.label) + 34;
  });

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
    startY: 398,
    theme: "plain",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    margin: { top: 73, right: marginX, bottom: 47, left: marginX },
    styles: {
      font: "helvetica",
      fontSize: 7.15,
      cellPadding: { top: 5.7, right: 5, bottom: 5.7, left: 5 },
      textColor: palette.text,
      valign: "middle",
      overflow: "linebreak",
      lineWidth: 0,
    },
    headStyles: {
      fillColor: palette.navy,
      textColor: palette.white,
      fontStyle: "bold",
      fontSize: 6.55,
      halign: "center",
      valign: "middle",
      cellPadding: { top: 7.5, right: 4, bottom: 7.5, left: 4 },
      lineColor: palette.navySoft,
      lineWidth: 0.35,
    },
    bodyStyles: { fillColor: palette.white },
    alternateRowStyles: { fillColor: palette.surface },
    columnStyles: {
      0: { cellWidth: 170, fontStyle: "bold" },
      1: { cellWidth: 118 },
      2: { cellWidth: 77 },
      3: { cellWidth: 76, halign: "center" },
      4: { cellWidth: 77, halign: "center" },
      5: { cellWidth: 79, halign: "center", fontStyle: "bold" },
      6: { cellWidth: 79, halign: "center" },
      7: { cellWidth: 56, halign: "center", fontStyle: "bold" },
      8: { cellWidth: 80, halign: "center", fontStyle: "bold" },
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
        data.cell.styles.fontStyle = "bold";
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
      doc.rect(data.cell.x, data.cell.y + 2.5, 2.5, Math.max(2, data.cell.height - 5), "F");
      doc.setDrawColor(...palette.line);
      doc.setLineWidth(0.34);
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
    doc.line(marginX, height - 32, width - marginX, height - 32);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.4);
    doc.setTextColor(...palette.muted);
    doc.text("APONT AUTO  ·  PCM / COMPLIANCE  ·  DOCUMENTO DE CONTROLE INTERNO", marginX, height - 17);

    const center = `Emitido em ${generatedLabel}`;
    doc.text(center, width / 2 - doc.getTextWidth(center) / 2, height - 17);

    const pageLabel = `PÁGINA ${String(page).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...palette.navy);
    doc.text(pageLabel, width - marginX - doc.getTextWidth(pageLabel), height - 17);
  }

  doc.save(`painel-legal-${year}-${dateStamp(generatedAt)}.pdf`);
}
