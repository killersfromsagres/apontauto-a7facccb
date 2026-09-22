import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import {
  materialPhotoKey,
  type MaterialEvidencePhoto,
  type MaterialPhotosByOs,
} from "@/lib/materiais/material-request-photos";
import type { MaterialCompraRow, MaterialOsRow } from "@/lib/materiais/compras-premium-excel";

const COLORS = {
  navy: [9, 25, 41] as [number, number, number],
  navy2: [20, 46, 70] as [number, number, number],
  ink: [24, 37, 52] as [number, number, number],
  muted: [93, 108, 124] as [number, number, number],
  border: [220, 226, 232] as [number, number, number],
  surface: [246, 248, 250] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  teal: [20, 124, 115] as [number, number, number],
  tealSoft: [232, 246, 244] as [number, number, number],
  amber: [176, 112, 20] as [number, number, number],
  amberSoft: [252, 246, 229] as [number, number, number],
  red: [175, 55, 55] as [number, number, number],
};

type PdfGroup = {
  key: string;
  origem: "refrigeracao" | "corretiva";
  os: MaterialOsRow | undefined;
  items: MaterialCompraRow[];
  photos: MaterialEvidencePhoto[];
};

type ExportOptions = {
  title?: string;
  filename?: string;
};

function display(value: unknown, fallback = "Não informado") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "Não informado";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString("pt-BR");
}

function formatShortDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString("pt-BR");
}

function originLabel(value: unknown) {
  return value === "refrigeracao" ? "Refrigeração" : "Corretiva";
}

function costCenterFor(items: MaterialCompraRow[]) {
  const centers = Array.from(
    new Set(items.map((item) => String(item.centro_custo || "").trim()).filter(Boolean)),
  );
  return centers.join(" / ") || "Não mapeado";
}

function locationLabel(os: MaterialOsRow | undefined) {
  return [os?.predio, os?.andar, os?.local].filter(Boolean).join(" · ") || "Não informado";
}

function assetLabel(os: MaterialOsRow | undefined) {
  return [os?.ativo, os?.equipamento, os?.patrimonio].filter(Boolean).join(" · ") || "Não informado";
}

function groupItems(
  items: MaterialCompraRow[],
  osById: Map<string, MaterialOsRow>,
  photosByOs: MaterialPhotosByOs,
): PdfGroup[] {
  const groups = new Map<string, PdfGroup>();

  for (const item of items) {
    const origem: "refrigeracao" | "corretiva" =
      item.origem === "refrigeracao" ? "refrigeracao" : "corretiva";
    const osId = String(item.os_id || "");
    const key = `${origem}:${osId || item.id || item.descricao || groups.size}`;
    const current = groups.get(key);
    if (current) {
      current.items.push(item);
      continue;
    }
    groups.set(key, {
      key,
      origem,
      os: osById.get(osId),
      items: [item],
      photos: osId ? photosByOs.get(materialPhotoKey(origem, osId)) || [] : [],
    });
  }

  return [...groups.values()].sort((a, b) => {
    const ad = new Date(a.items[0]?.created_at || 0).getTime();
    const bd = new Date(b.items[0]?.created_at || 0).getTime();
    return bd - ad;
  });
}

async function imageUrlToJpeg(url: string) {
  try {
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Falha ao carregar imagem"));
        img.src = objectUrl;
      });

      const maxEdge = 1400;
      const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
      const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
      const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      return {
        dataUrl: canvas.toDataURL("image/jpeg", 0.82),
        width,
        height,
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch (error) {
    console.warn("[MateriaisPDF] Evidência ignorada no PDF:", error);
    return null;
  }
}

function drawPageHeader(doc: jsPDF, title: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(...COLORS.navy);
  doc.rect(0, 0, pageWidth, 31, "F");
  doc.setFillColor(...COLORS.teal);
  doc.rect(0, 31, pageWidth, 1.8, "F");

  doc.setTextColor(...COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.8);
  doc.text("GRUPO GPS  |  FACILITIES", 14, 9.2);
  doc.setFontSize(16.5);
  doc.text(title.toUpperCase(), 14, 19.2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(202, 215, 226);
  doc.text("Operação Suvinil / Sherwin-Williams · Gestão de materiais e manutenção", 14, 26.1);

  doc.setFontSize(7.3);
  doc.setTextColor(202, 215, 226);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, pageWidth - 14, 10, { align: "right" });
  doc.text("Documento operacional · Apont Auto", pageWidth - 14, 15, { align: "right" });
}

function drawPageFooter(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();

  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...COLORS.border);
    doc.line(14, height - 13, width - 14, height - 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text("Grupo GPS · Facilities  |  Operação Suvinil / Sherwin-Williams", 14, height - 7.5);
    doc.text(`Página ${page} de ${pages}`, width - 14, height - 7.5, { align: "right" });
  }
}

function ensureSpace(doc: jsPDF, y: number, needed: number, title: string) {
  const height = doc.internal.pageSize.getHeight();
  if (y + needed <= height - 18) return y;
  doc.addPage();
  drawPageHeader(doc, title);
  return 41;
}

function drawKpi(doc: jsPDF, x: number, y: number, w: number, value: string, label: string, accent: [number, number, number]) {
  doc.setFillColor(...COLORS.surface);
  doc.setDrawColor(...COLORS.border);
  doc.roundedRect(x, y, w, 18, 2, 2, "FD");
  doc.setFillColor(...accent);
  doc.roundedRect(x, y, 2.2, 18, 1, 1, "F");
  doc.setTextColor(...COLORS.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.text(value, x + 6, y + 7.5);
  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.text(label.toUpperCase(), x + 6, y + 13.2);
}

function drawLabelValue(doc: jsPDF, label: string, value: string, x: number, y: number, width: number) {
  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text(label.toUpperCase(), x, y);
  doc.setTextColor(...COLORS.ink);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  const lines = doc.splitTextToSize(value, width);
  doc.text(lines.slice(0, 3), x, y + 4.3);
}

function drawCostCenterHighlight(doc: jsPDF, value: string, x: number, y: number, width: number) {
  const missing = value === "Não mapeado";
  const fill = missing ? COLORS.amberSoft : COLORS.tealSoft;
  const accent = missing ? COLORS.amber : COLORS.teal;
  const valueColor = missing ? COLORS.red : COLORS.teal;
  const mainValue = missing ? "NÃO MAPEADO" : value;

  doc.setFillColor(...fill);
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, width, 19, 2.2, 2.2, "FD");
  doc.setFillColor(...accent);
  doc.roundedRect(x, y, 3.2, 19, 1.6, 1.6, "F");

  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  doc.text("CENTRO DE CUSTO", x + 7, y + 5.2);

  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.3);
  doc.text(
    missing ? "Revisar antes de encaminhar para compra" : "Referência para compra / apropriação",
    x + width - 5,
    y + 5.2,
    { align: "right" },
  );

  doc.setTextColor(...valueColor);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13.5);
  const lines = doc.splitTextToSize(mainValue, width - 14);
  doc.text(lines.slice(0, 1), x + 7, y + 13.5);
}

async function drawPhotos(doc: jsPDF, photos: MaterialEvidencePhoto[], y: number, title: string) {
  if (!photos.length) return y;
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 14;
  const usable = pageWidth - 28;
  const gap = 4;
  const columns = 2;
  const cellW = (usable - gap) / columns;
  const cellH = 50;
  const selected = photos;

  y = ensureSpace(doc, y, 18, title);
  doc.setTextColor(...COLORS.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`EVIDÊNCIAS FOTOGRÁFICAS (${photos.length})`, left, y + 2);
  y += 6;

  for (let index = 0; index < selected.length; index += 1) {
    if (index % columns === 0) y = ensureSpace(doc, y, cellH + 7, title);
    const col = index % columns;
    const x = left + col * (cellW + gap);
    const photo = selected[index];
    const image = await imageUrlToJpeg(photo.image_url);

    doc.setFillColor(241, 244, 247);
    doc.setDrawColor(...COLORS.border);
    doc.roundedRect(x, y, cellW, cellH, 1.5, 1.5, "FD");

    if (image) {
      const innerW = cellW - 2;
      const innerH = cellH - 11;
      const ratio = Math.min(innerW / image.width, innerH / image.height);
      const drawW = image.width * ratio;
      const drawH = image.height * ratio;
      const imageX = x + (cellW - drawW) / 2;
      const imageY = y + 1 + (innerH - drawH) / 2;
      doc.addImage(image.dataUrl, "JPEG", imageX, imageY, drawW, drawH, undefined, "FAST");
    } else {
      doc.setTextColor(...COLORS.muted);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text("Foto indisponível para incorporação", x + cellW / 2, y + 20, { align: "center" });
    }

    doc.setFillColor(...COLORS.white);
    doc.rect(x + 0.5, y + cellH - 9.5, cellW - 1, 9, "F");
    doc.setTextColor(...COLORS.ink);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.text(photo.legenda || `Evidência ${index + 1}`, x + 2.5, y + cellH - 5.5, { maxWidth: cellW - 5 });
    doc.setTextColor(...COLORS.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.8);
    doc.text(formatShortDate(photo.created_at), x + cellW - 2.5, y + cellH - 2.5, { align: "right" });

    if (col === columns - 1 || index === selected.length - 1) y += cellH + gap;
  }

  return y;
}

export async function exportComprasPremiumPdf(
  items: MaterialCompraRow[],
  osById: Map<string, MaterialOsRow>,
  photosByOs: MaterialPhotosByOs,
  options: ExportOptions = {},
) {
  if (!items.length) throw new Error("Não há solicitações para exportar.");

  const title = options.title || "Relatório de Solicitação de Materiais";
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  drawPageHeader(doc, title);

  const groups = groupItems(items, osById, photosByOs);
  const totalQty = items.reduce((sum, item) => sum + Number(item.quantidade || 1), 0);
  const centers = new Set(items.map((item) => String(item.centro_custo || "").trim()).filter(Boolean));
  const photoCount = groups.reduce((sum, group) => sum + group.photos.length, 0);

  const pageWidth = doc.internal.pageSize.getWidth();
  const gap = 3.5;
  const kpiW = (pageWidth - 28 - gap * 3) / 4;
  let y = 40;
  drawKpi(doc, 14, y, kpiW, String(items.length), "Solicitações", COLORS.teal);
  drawKpi(doc, 14 + (kpiW + gap), y, kpiW, String(groups.length), "Chamados / OS", COLORS.navy2);
  drawKpi(doc, 14 + (kpiW + gap) * 2, y, kpiW, String(totalQty), "Itens / unidades", COLORS.amber);
  drawKpi(doc, 14 + (kpiW + gap) * 3, y, kpiW, `${centers.size}/${groups.length}`, "CC identificados", COLORS.teal);
  y += 25;

  doc.setTextColor(...COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.text(
    `${photoCount} evidência(s) fotográfica(s) vinculada(s). O relatório reflete os filtros aplicados na Central de Materiais no momento da exportação.`,
    14,
    y,
  );
  y += 8;

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    const os = group.os;
    y = ensureSpace(doc, y, 88, title);

    doc.setFillColor(...COLORS.navy);
    doc.roundedRect(14, y, pageWidth - 28, 14, 2, 2, "F");
    doc.setFillColor(...COLORS.teal);
    doc.roundedRect(14, y, 3, 14, 1.5, 1.5, "F");
    doc.setTextColor(...COLORS.white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.text(`OS ${display(os?.numero_os, "—")}`, 20, y + 6.2);
    doc.setFontSize(7.2);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(207, 220, 230);
    doc.text(originLabel(group.origem).toUpperCase(), 20, y + 10.7);
    y += 18;

    const cc = costCenterFor(group.items);
    drawCostCenterHighlight(doc, cc, 14, y, pageWidth - 28);
    y += 25;

    drawLabelValue(doc, "Descrição do chamado", display(os?.nome_os, "Sem descrição da OS"), 14, y, pageWidth - 28);
    const descriptionLines = doc.splitTextToSize(display(os?.nome_os, "Sem descrição da OS"), pageWidth - 28);
    y += Math.min(3, descriptionLines.length) * 4 + 8;

    const colW = (pageWidth - 28 - 8) / 3;
    drawLabelValue(doc, "Ativo / equipamento", assetLabel(os), 14, y, colW);
    drawLabelValue(doc, "Localização", locationLabel(os), 14 + colW + 4, y, colW);
    drawLabelValue(doc, "Solicitante", display(os?.solicitante), 14 + (colW + 4) * 2, y, colW);
    y += 17;

    drawLabelValue(doc, "Equipe", display(os?.equipe), 14, y, colW);
    drawLabelValue(doc, "Status da OS", display(os?.status).replace(/_/g, " "), 14 + colW + 4, y, colW);
    drawLabelValue(
      doc,
      "Data do chamado",
      formatDate(os?.data_criacao || os?.created_at || group.items[0]?.created_at),
      14 + (colW + 4) * 2,
      y,
      colW,
    );
    y += 16;

    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      theme: "grid",
      head: [["Peça / material solicitado", "Qtd.", "Solicitado em", "Centro de custo"]],
      body: group.items.map((item) => [
        display(item.descricao, "—"),
        String(Number(item.quantidade || 1)),
        formatDate(item.material_request_date || item.created_at),
        display(item.centro_custo, "Não mapeado"),
      ]),
      styles: {
        font: "helvetica",
        fontSize: 7.6,
        cellPadding: 2.2,
        textColor: COLORS.ink,
        lineColor: COLORS.border,
        lineWidth: 0.18,
        valign: "middle",
      },
      headStyles: {
        fillColor: COLORS.navy2,
        textColor: COLORS.white,
        fontStyle: "bold",
        fontSize: 7.2,
        halign: "left",
      },
      alternateRowStyles: { fillColor: COLORS.surface },
      columnStyles: {
        0: { cellWidth: 82 },
        1: { cellWidth: 15, halign: "center", fontStyle: "bold" },
        2: { cellWidth: 43 },
        3: { cellWidth: 42, fontStyle: "bold" },
      },
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index !== 3) return;
        const raw = String(data.cell.raw || "");
        data.cell.styles.fontStyle = "bold";
        if (raw.includes("Não mapeado")) {
          data.cell.styles.fillColor = COLORS.amberSoft;
          data.cell.styles.textColor = COLORS.red;
        } else {
          data.cell.styles.fillColor = COLORS.tealSoft;
          data.cell.styles.textColor = COLORS.teal;
        }
      },
    });

    y = ((doc as any).lastAutoTable?.finalY || y) + 7;
    y = await drawPhotos(doc, group.photos, y, title);

    if (groupIndex < groups.length - 1) {
      y = ensureSpace(doc, y, 9, title);
      doc.setDrawColor(...COLORS.border);
      doc.line(14, y + 2, pageWidth - 14, y + 2);
      y += 9;
    }
  }

  drawPageFooter(doc);
  const suffix = new Date().toISOString().slice(0, 10);
  doc.save(options.filename || `Relatorio_Materiais_GPS_Suvinil_${suffix}.pdf`);
}
