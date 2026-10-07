import type { OsCacheRow } from "./db";

type ProgramacaoPdfRow = OsCacheRow & {
  tipo_importacao?: string | null;
  programacao_status?: string | null;
  programacao_dia?: string | null;
  programacao_periodo?: string | null;
  programacao_equipe?: string | null;
};

type Rgb = [number, number, number];

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

function isExplicitBackorder(item: ProgramacaoPdfRow) {
  return [item.tipo, item.tipo_importacao]
    .map(normalize)
    .some((value) => value === "BACKORDER" || value.startsWith("BACKORDER "));
}

function typeLabel(item: ProgramacaoPdfRow) {
  if (isExplicitBackorder(item)) return "BACKORDER";
  const raw = String(item.tipo || item.tipo_importacao || "CORRETIVA").trim();
  return raw ? raw.replace(/_/g, " ").toUpperCase() : "CORRETIVA";
}

function materialRequested(item: OsCacheRow) {
  return normalize(item.material_status) === "SOLICITADO" || Boolean(item.pecas_solicitadas);
}

function dateLabel(value: unknown) {
  if (!value) return "—";
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}/.test(raw)
    ? new Date(`${raw.slice(0, 10)}T12:00:00`)
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

type SlaInfo = {
  label: string;
  overdue: boolean;
};

function slaInfo(value: string | null | undefined, generatedAt: Date): SlaInfo {
  if (!value) return { label: "—", overdue: false };

  const raw = String(value);
  const due = /^\d{4}-\d{2}-\d{2}/.test(raw)
    ? new Date(`${raw.slice(0, 10)}T12:00:00`)
    : new Date(raw);
  if (Number.isNaN(due.getTime())) return { label: "—", overdue: false };

  const reference = new Date(generatedAt);
  reference.setHours(12, 0, 0, 0);
  due.setHours(12, 0, 0, 0);

  const days = Math.round((due.getTime() - reference.getTime()) / 86400000);
  if (days < 0) {
    const overdueDays = Math.abs(days);
    return {
      label: `Vencido há ${overdueDays}d`,
      overdue: true,
    };
  }
  if (days === 0) return { label: "Vence hoje", overdue: false };
  if (days === 1) return { label: "Vence amanhã", overdue: false };
  return { label: `Vence em ${days}d`, overdue: false };
}

function isProgrammed(item: ProgramacaoPdfRow) {
  return Boolean(
    item.programacao_status ||
      item.programacao_dia ||
      item.programacao_periodo ||
      item.programacao_equipe,
  );
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function generateProgramacaoPDF(
  osList: ProgramacaoPdfRow[],
  equipeFiltro: string,
) {
  const [{ jsPDF }, { default: autoTable }, logoData] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    loadImageData("/apontauto-logo.png"),
  ]);

  const generatedAt = new Date();
  const generatedLabel = generatedAt.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const palette = {
    ink: [7, 17, 31] as Rgb,
    navy: [12, 31, 51] as Rgb,
    navySoft: [22, 50, 78] as Rgb,
    blue: [37, 99, 235] as Rgb,
    cyan: [56, 189, 248] as Rgb,
    white: [255, 255, 255] as Rgb,
    paper: [252, 253, 255] as Rgb,
    surface: [247, 249, 252] as Rgb,
    text: [30, 41, 59] as Rgb,
    muted: [100, 116, 139] as Rgb,
    subtle: [148, 163, 184] as Rgb,
    line: [226, 232, 240] as Rgb,
    lineStrong: [203, 213, 225] as Rgb,
    red: [190, 24, 93] as Rgb,
    redBg: [255, 228, 230] as Rgb,
    amber: [180, 83, 9] as Rgb,
    amberBg: [254, 243, 199] as Rgb,
    sky: [3, 105, 161] as Rgb,
    skyBg: [224, 242, 254] as Rgb,
    green: [4, 120, 87] as Rgb,
    greenBg: [209, 250, 229] as Rgb,
  };

  doc.setProperties({
    title: "Apont Auto · Programação de Corretivas",
    subject: "Relatório operacional de chamados corretivos",
    author: "Apont Auto",
    creator: "Apont Auto",
    keywords: "corretivas, programação, manutenção, SLA, materiais, PCM",
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 9;

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

  const drawBrand = (x: number, y: number, size: number) => {
    doc.setFillColor(...palette.white);
    doc.setDrawColor(...palette.white);
    doc.roundedRect(x, y, size, size, 2.4, 2.4, "FD");
    if (logoData) {
      try {
        addContainedImage(logoData, x + 1.3, y + 1.3, size - 2.6, size - 2.6);
        return;
      } catch {
        // Usa o fallback vetorial abaixo.
      }
    }
    doc.setFillColor(...palette.blue);
    doc.roundedRect(x + 2.4, y + 2.4, size - 4.8, size - 4.8, 1.7, 1.7, "F");
    doc.setDrawColor(...palette.white);
    doc.setLineWidth(0.7);
    doc.line(x + 4.2, y + size - 4.6, x + size / 2, y + 4.2);
    doc.line(x + size / 2, y + 4.2, x + size - 4.2, y + size - 4.6);
  };

  const drawCompactHeader = (pageNumber: number) => {
    doc.setFillColor(...palette.ink);
    doc.rect(0, 0, pageW, 20, "F");
    doc.setFillColor(...palette.navy);
    doc.rect(pageW * 0.78, 0, pageW * 0.22, 20, "F");
    doc.setFillColor(...palette.blue);
    doc.rect(0, 19.2, pageW, 0.8, "F");

    drawBrand(marginX, 3.3, 12.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...palette.white);
    doc.text("PROGRAMAÇÃO DE CORRETIVAS", marginX + 17, 8.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(190, 203, 220);
    doc.text(`Apont Auto · ${equipeFiltro.replace(/_/g, " ")}`, marginX + 17, 13.2);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(211, 222, 237);
    const label = `CONTINUAÇÃO · ${String(pageNumber).padStart(2, "0")}`;
    doc.text(label, pageW - marginX - doc.getTextWidth(label), 10.8);
  };

  // Cabeçalho institucional da primeira página.
  doc.setFillColor(...palette.paper);
  doc.rect(0, 0, pageW, pageH, "F");
  doc.setFillColor(...palette.ink);
  doc.rect(0, 0, pageW, 37, "F");
  doc.setFillColor(...palette.navy);
  doc.rect(pageW * 0.7, 0, pageW * 0.3, 37, "F");
  doc.setFillColor(...palette.navySoft);
  doc.rect(pageW * 0.88, 0, pageW * 0.12, 37, "F");
  doc.setFillColor(...palette.blue);
  doc.rect(0, 36.1, pageW, 0.9, "F");
  doc.setFillColor(...palette.cyan);
  doc.rect(0, 36.1, pageW * 0.13, 0.9, "F");

  drawBrand(12, 8, 19);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.7);
  doc.setTextColor(128, 157, 198);
  doc.text("PCM  /  CONTROLE OPERACIONAL  /  MANUTENÇÃO", 36, 11.5);
  doc.setFontSize(19);
  doc.setTextColor(...palette.white);
  doc.text("PROGRAMAÇÃO DE CORRETIVAS", 36, 21.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(190, 203, 220);
  doc.text(
    "Relatório de campo para acompanhamento de equipes, localização, SLA e materiais",
    36,
    27.2,
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.2);
  doc.setTextColor(...palette.white);
  const docType = "RELATÓRIO OPERACIONAL";
  doc.text(docType, pageW - 12 - doc.getTextWidth(docType), 12.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(170, 186, 207);
  const scope = `Escopo: ${equipeFiltro.replace(/_/g, " ")}`;
  const emitted = `Emissão: ${generatedLabel}`;
  doc.text(scope, pageW - 12 - doc.getTextWidth(scope), 20.2);
  doc.text(emitted, pageW - 12 - doc.getTextWidth(emitted), 25.8);

  const metrics = {
    total: osList.length,
    programmed: osList.filter(isProgrammed).length,
    material: osList.filter(materialRequested).length,
    overdue: osList.filter((item) => slaInfo(item.data_sla, generatedAt).overdue).length,
  };

  const cards = [
    { label: "TOTAL DE OS", value: metrics.total, accent: palette.blue, bg: palette.white },
    { label: "EM PROGRAMAÇÃO", value: metrics.programmed, accent: palette.sky, bg: palette.skyBg },
    { label: "MATERIAL SOLICITADO", value: metrics.material, accent: palette.amber, bg: palette.amberBg },
    { label: "SLA VENCIDO", value: metrics.overdue, accent: palette.red, bg: palette.redBg },
  ];

  const cardsY = 43;
  const cardGap = 4;
  const cardW = (pageW - marginX * 2 - cardGap * 3) / 4;
  cards.forEach((card, index) => {
    const x = marginX + index * (cardW + cardGap);
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(x + 0.5, cardsY + 0.7, cardW, 17, 2.2, 2.2, "F");
    doc.setFillColor(...card.bg);
    doc.setDrawColor(...palette.line);
    doc.setLineWidth(0.18);
    doc.roundedRect(x, cardsY, cardW, 17, 2.2, 2.2, "FD");
    doc.setFillColor(...card.accent);
    doc.roundedRect(x, cardsY, 1.5, 17, 0.8, 0.8, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(...palette.ink);
    doc.text(String(card.value), x + 5, cardsY + 7.2);
    doc.setFontSize(6.2);
    doc.setTextColor(...card.accent);
    doc.text(card.label, x + 5, cardsY + 12.5);
  });

  const tableData = osList.map((item) => {
    const sla = slaInfo(item.data_sla, generatedAt);
    return [
      item.numero_os || "—",
      typeLabel(item),
      item.equipe || "Sem equipe",
      `${item.predio || "—"} / ${item.andar || "—"}`,
      item.local || "—",
      item.nome_os || "Sem descrição",
      dateLabel(item.data_criacao),
      sla.label,
      materialRequested(item) ? "SOLICITADO" : "—",
    ];
  });

  autoTable(doc, {
    startY: 66,
    head: [[
      "OS",
      "TIPO",
      "EQUIPE",
      "PRÉDIO / ANDAR",
      "LOCAL",
      "DESCRIÇÃO DO SERVIÇO",
      "ABERTURA",
      "SLA",
      "MATERIAL",
    ]],
    body: tableData,
    theme: "plain",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    margin: { top: 27, left: marginX, right: marginX, bottom: 15 },
    styles: {
      font: "helvetica",
      fontSize: 7.2,
      cellPadding: { top: 2.4, right: 1.8, bottom: 2.4, left: 1.8 },
      valign: "middle",
      overflow: "linebreak",
      minCellHeight: 9.5,
      textColor: palette.text,
      lineWidth: 0,
    },
    headStyles: {
      fillColor: palette.navy,
      textColor: palette.white,
      fontSize: 6.7,
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
      cellPadding: { top: 2.6, right: 1.5, bottom: 2.6, left: 1.5 },
      minCellHeight: 8.5,
    },
    bodyStyles: { fillColor: palette.white },
    alternateRowStyles: { fillColor: palette.surface },
    columnStyles: {
      0: { halign: "center", fontStyle: "bold", fontSize: 8.3, cellWidth: 15 },
      1: { halign: "center", fontStyle: "bold", cellWidth: 18 },
      2: { halign: "center", fontStyle: "bold", cellWidth: 22 },
      3: { halign: "left", fontStyle: "bold", cellWidth: 28 },
      4: { halign: "left", fontStyle: "bold", cellWidth: 34 },
      5: { halign: "left", fontStyle: "bold", fontSize: 8, cellWidth: 89 },
      6: { halign: "center", cellWidth: 20 },
      7: { halign: "center", fontStyle: "bold", cellWidth: 25 },
      8: { halign: "center", fontStyle: "bold", cellWidth: 20 },
    },
    didParseCell: (data: any) => {
      if (data.section !== "body") return;
      const source = osList[data.row.index];
      if (!source) return;

      if (data.column.index === 1 && isExplicitBackorder(source)) {
        data.cell.styles.fillColor = palette.redBg;
        data.cell.styles.textColor = palette.red;
        data.cell.styles.fontStyle = "bold";
      }

      if (data.column.index === 2) {
        data.cell.styles.fillColor = palette.skyBg;
        data.cell.styles.textColor = palette.sky;
        data.cell.styles.fontStyle = "bold";
      }

      if (data.column.index === 7) {
        const sla = slaInfo(source.data_sla, generatedAt);
        if (sla.overdue) {
          data.cell.styles.fillColor = palette.redBg;
          data.cell.styles.textColor = palette.red;
          data.cell.styles.fontStyle = "bold";
        }
      }

      if (data.column.index === 8 && materialRequested(source)) {
        data.cell.styles.fillColor = palette.amberBg;
        data.cell.styles.textColor = palette.amber;
        data.cell.styles.fontStyle = "bold";
      }
    },
    didDrawCell: (data: any) => {
      if (data.section !== "body" || data.column.index !== 0) return;
      doc.setDrawColor(...palette.line);
      doc.setLineWidth(0.12);
      doc.line(
        data.cell.x,
        data.cell.y + data.cell.height,
        pageW - marginX,
        data.cell.y + data.cell.height,
      );
    },
    didDrawPage: () => {
      const current = doc.getCurrentPageInfo().pageNumber;
      if (current > 1) drawCompactHeader(current);
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...palette.lineStrong);
    doc.setLineWidth(0.15);
    doc.line(marginX, pageH - 12, pageW - marginX, pageH - 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.4);
    doc.setTextColor(...palette.muted);
    doc.text("APONT AUTO · PCM · PROGRAMAÇÃO DE CORRETIVAS", marginX, pageH - 7);

    const center = `Emitido em ${generatedLabel}`;
    doc.text(center, pageW / 2 - doc.getTextWidth(center) / 2, pageH - 7);

    const pageLabel = `PÁGINA ${String(page).padStart(2, "0")} / ${String(pageCount).padStart(2, "0")}`;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...palette.navy);
    doc.text(pageLabel, pageW - marginX - doc.getTextWidth(pageLabel), pageH - 7);
  }

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const scopeSlug = slugify(equipeFiltro) || "todas-equipes";
  link.download = `apont-auto_programacao-corretivas_${scopeSlug}_${generatedAt.toISOString().slice(0, 10)}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
