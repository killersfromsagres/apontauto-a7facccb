import { supabase } from "@/integrations/supabase/client";
import type { ControleItem, Origem } from "./data";
import { STATUS_COMPRA_LABEL } from "./data";

type PhotoRow = {
  id: string;
  os_id: string;
  image_url: string | null;
  storage_path: string | null;
  legenda: string | null;
  created_at: string;
};

type ResolvedPhoto = PhotoRow & { url: string | null };

type ImageData = {
  dataUrl: string;
  width: number;
  height: number;
};

const PAGE = { width: 210, height: 297, margin: 12, contentWidth: 186 };
const MAX_PHOTOS_PER_OS = 4;

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function fmtMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function photoScore(photo: PhotoRow) {
  const text = normalize(photo.legenda);
  if (/material|pedido|peca|solicit/.test(text)) return 3;
  if (/evidenc|antes|depois/.test(text)) return 2;
  return 1;
}

async function resolveStorageUrl(photo: PhotoRow, origem: Origem): Promise<string | null> {
  if (photo.image_url) return photo.image_url;
  if (!photo.storage_path) return null;

  const bucket = origem === "refrigeracao" ? "refrigeracao-fotos" : "corretiva-fotos";
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(photo.storage_path, 60 * 60);
  if (error) {
    console.warn(`[CentralMateriaisPDF] Falha ao assinar ${bucket}/${photo.storage_path}:`, error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

async function fetchPhotos(items: ControleItem[]) {
  const byOrigin = new Map<Origem, Set<string>>([
    ["corretiva", new Set()],
    ["refrigeracao", new Set()],
  ]);

  for (const item of items) {
    if (item.osId) byOrigin.get(item.origem)?.add(item.osId);
  }

  const result = new Map<string, ResolvedPhoto[]>();

  for (const origem of ["corretiva", "refrigeracao"] as const) {
    const ids = [...(byOrigin.get(origem) ?? [])];
    if (!ids.length) continue;

    const table = origem === "refrigeracao" ? "refrigeracao_fotos" : "corretiva_fotos";
    const { data, error } = await (supabase.from(table) as any)
      .select("id, os_id, image_url, storage_path, legenda, created_at")
      .in("os_id", ids)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn(`[CentralMateriaisPDF] Não foi possível carregar fotos de ${origem}:`, error.message);
      continue;
    }

    const grouped = new Map<string, PhotoRow[]>();
    for (const row of (data ?? []) as PhotoRow[]) {
      const key = `${origem}:${row.os_id}`;
      const rows = grouped.get(key) ?? [];
      rows.push(row);
      grouped.set(key, rows);
    }

    for (const [key, rows] of grouped) {
      const selected = [...rows]
        .sort((a, b) => photoScore(b) - photoScore(a) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, MAX_PHOTOS_PER_OS);

      const resolved = await Promise.all(
        selected.map(async (photo) => ({ ...photo, url: await resolveStorageUrl(photo, origem) })),
      );
      result.set(key, resolved);
    }
  }

  return result;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler imagem"));
    reader.readAsDataURL(blob);
  });
}

function readImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
    image.onerror = () => reject(new Error("Imagem inválida"));
    image.src = dataUrl;
  });
}

async function loadImage(url: string | null): Promise<ImageData | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { mode: "cors", cache: "force-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const dataUrl = await readAsDataUrl(blob);
    const size = await readImageSize(dataUrl);
    return { dataUrl, ...size };
  } catch (error) {
    console.warn("[CentralMateriaisPDF] Imagem indisponível:", error);
    return null;
  }
}

function addPdfHeader(
  doc: any,
  exportedCount: number,
  corretivaCount: number,
  refrigeracaoCount: number,
  fieldCount: number,
  urgentCount: number,
) {
  doc.setFillColor(8, 20, 38);
  doc.rect(0, 0, PAGE.width, 34, "F");
  doc.setFillColor(22, 101, 216);
  doc.rect(0, 34, PAGE.width, 2, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("CENTRAL DE MATERIAIS", PAGE.margin, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("APONT AUTO · Relatório operacional unificado", PAGE.margin, 20);
  doc.setTextColor(190, 204, 223);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, PAGE.margin, 26);

  const right = PAGE.width - PAGE.margin;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(`${exportedCount} registro(s)`, right, 12, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(190, 204, 223);
  doc.text(`Corretiva ${corretivaCount}  ·  Refrigeração ${refrigeracaoCount}`, right, 19, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(125, 211, 252);
  doc.text(`Campo ${fieldCount}  ·  Urgentes ${urgentCount}`, right, 26, { align: "right" });
}

function addPageFooter(doc: any, page: number, total: number) {
  const y = PAGE.height - 7;
  doc.setDrawColor(220, 226, 234);
  doc.line(PAGE.margin, y - 4, PAGE.width - PAGE.margin, y - 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(105, 117, 132);
  doc.text("Apont Auto · Central de Materiais", PAGE.margin, y);
  doc.text(`Página ${page} de ${total}`, PAGE.width - PAGE.margin, y, { align: "right" });
}

function pill(doc: any, text: string, x: number, y: number, bg: [number, number, number], fg: [number, number, number]) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.3);
  const width = Math.min(48, doc.getTextWidth(text) + 7);
  doc.setFillColor(...bg);
  doc.roundedRect(x, y - 4, width, 6.5, 2, 2, "F");
  doc.setTextColor(...fg);
  doc.text(text, x + 3.5, y);
  return width;
}

function detailLine(doc: any, label: string, value: string, x: number, y: number, width: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.4);
  doc.setTextColor(91, 103, 118);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.4);
  doc.setTextColor(24, 35, 50);
  const lines = doc.splitTextToSize(value || "—", width);
  doc.text(lines.slice(0, 2), x, y + 4.1);
  return Math.max(8, Math.min(2, lines.length) * 4.1 + 4);
}

function ensureSpace(doc: any, y: number, needed: number, header: () => void) {
  if (y + needed <= PAGE.height - 16) return y;
  doc.addPage();
  header();
  return 43;
}

function imageFormat(dataUrl: string) {
  if (/^data:image\/png/i.test(dataUrl)) return "PNG";
  if (/^data:image\/(webp)/i.test(dataUrl)) return "WEBP";
  return "JPEG";
}

async function renderPhotoGrid(doc: any, photos: ResolvedPhoto[], y: number, header: () => void) {
  if (!photos.length) return y;

  y = ensureSpace(doc, y, 13, header);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(75, 88, 105);
  doc.text("EVIDÊNCIAS FOTOGRÁFICAS", PAGE.margin + 5, y);
  y += 5;

  const gap = 4;
  const photoW = (PAGE.contentWidth - 10 - gap) / 2;
  const photoH = 40;

  for (let index = 0; index < photos.length; index += 2) {
    y = ensureSpace(doc, y, photoH + 10, header);
    const pair = photos.slice(index, index + 2);

    for (let col = 0; col < pair.length; col++) {
      const photo = pair[col];
      const x = PAGE.margin + 5 + col * (photoW + gap);
      doc.setFillColor(246, 248, 251);
      doc.setDrawColor(219, 226, 235);
      doc.roundedRect(x, y, photoW, photoH + 7, 2, 2, "FD");

      const image = await loadImage(photo.url);
      if (image) {
        const maxW = photoW - 4;
        const maxH = photoH - 4;
        const ratio = Math.min(maxW / image.width, maxH / image.height);
        const drawW = image.width * ratio;
        const drawH = image.height * ratio;
        const imageX = x + (photoW - drawW) / 2;
        const imageY = y + 2 + (photoH - drawH) / 2;
        try {
          doc.addImage(image.dataUrl, imageFormat(image.dataUrl), imageX, imageY, drawW, drawH, undefined, "FAST");
        } catch (error) {
          console.warn("[CentralMateriaisPDF] Falha ao inserir imagem:", error);
          doc.setTextColor(130, 141, 155);
          doc.setFontSize(8);
          doc.text("Imagem indisponível", x + photoW / 2, y + photoH / 2, { align: "center" });
        }
      } else {
        doc.setTextColor(130, 141, 155);
        doc.setFontSize(8);
        doc.text("Imagem indisponível", x + photoW / 2, y + photoH / 2, { align: "center" });
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.setTextColor(92, 103, 118);
      const caption = String(photo.legenda || "Evidência da OS").replace(/\s+/g, " ");
      doc.text(doc.splitTextToSize(caption, photoW - 5).slice(0, 1), x + 2.5, y + photoH + 4.5);
    }
    y += photoH + 11;
  }

  return y;
}

export async function exportControleMateriaisPdf(itens: ControleItem[]): Promise<Blob> {
  if (!itens.length) throw new Error("Não há registros para gerar o PDF.");

  const [{ jsPDF }, photoMap] = await Promise.all([import("jspdf"), fetchPhotos(itens)]);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const corretivaCount = itens.filter((item) => item.origem === "corretiva").length;
  const refrigeracaoCount = itens.filter((item) => item.origem === "refrigeracao").length;
  const fieldCount = itens.filter((item) => item.fonte === "execucao_campo").length;
  const urgentCount = itens.filter((item) =>
    /alta|urgente|crit/i.test(String(item.urgencia ?? item.gravidade ?? "")),
  ).length;
  const renderHeader = () =>
    addPdfHeader(doc, itens.length, corretivaCount, refrigeracaoCount, fieldCount, urgentCount);

  renderHeader();
  let y = 43;

  for (const [index, item] of itens.entries()) {
    const photos = photoMap.get(`${item.origem}:${item.osId}`) ?? [];
    y = ensureSpace(doc, y, 78, renderHeader);

    const cardX = PAGE.margin;
    const cardW = PAGE.contentWidth;
    const cardTop = y;

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(215, 223, 233);
    doc.roundedRect(cardX, cardTop, cardW, 70, 3, 3, "FD");
    doc.setFillColor(item.origem === "refrigeracao" ? 14 : 234, item.origem === "refrigeracao" ? 116 : 88, item.origem === "refrigeracao" ? 144 : 12);
    doc.roundedRect(cardX, cardTop, 2.2, 70, 1, 1, "F");

    let px = cardX + 6;
    const py = cardTop + 8;
    px += pill(
      doc,
      item.origem === "refrigeracao" ? "REFRIGERAÇÃO" : "CORRETIVA",
      px,
      py,
      item.origem === "refrigeracao" ? [224, 247, 250] : [255, 237, 213],
      item.origem === "refrigeracao" ? [14, 116, 144] : [194, 65, 12],
    ) + 2;
    px += pill(doc, `OS ${item.numeroOs}`, px, py, [238, 242, 247], [28, 43, 61]) + 2;
    const status = item.meta?.status_compra ?? "aguardando";
    px += pill(doc, STATUS_COMPRA_LABEL[status], px, py, status === "recebido" ? [220, 252, 231] : [239, 246, 255], status === "recebido" ? [22, 101, 52] : [30, 86, 160]) + 2;
    if (item.fonte === "execucao_campo") {
      pill(doc, "CAMPO", px, py, [219, 234, 254], [30, 64, 175]);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.4);
    doc.setTextColor(17, 27, 41);
    const title = `${item.tipo === "peca" ? "Material" : "Defeito"}: ${item.descricao}`;
    doc.text(doc.splitTextToSize(title, cardW - 12).slice(0, 2), cardX + 6, cardTop + 16);

    const firstY = cardTop + 30;
    const colGap = 4;
    const colW = (cardW - 12 - colGap * 2) / 3;
    detailLine(doc, "Quantidade", item.quantidade != null ? String(item.quantidade) : "—", cardX + 6, firstY, colW);
    detailLine(doc, "Modelo / referência", item.modelo || "—", cardX + 6 + colW + colGap, firstY, colW);
    detailLine(doc, item.tipo === "peca" ? "Urgência" : "Gravidade", item.urgencia || item.gravidade || "—", cardX + 6 + (colW + colGap) * 2, firstY, colW);

    const secondY = firstY + 13;
    detailLine(doc, "Local", [item.predio, item.andar, item.local].filter(Boolean).join(" · ") || "—", cardX + 6, secondY, colW);
    detailLine(doc, "Equipe / solicitante", [item.equipe, item.solicitante].filter(Boolean).join(" · ") || "—", cardX + 6 + colW + colGap, secondY, colW);
    detailLine(doc, "Centro de custo", item.meta?.centro_custo || "Pendente", cardX + 6 + (colW + colGap) * 2, secondY, colW);

    const thirdY = secondY + 13;
    detailLine(doc, "Requisição / fornecedor", [item.meta?.numero_requisicao, item.meta?.fornecedor].filter(Boolean).join(" · ") || "—", cardX + 6, thirdY, colW);
    detailLine(doc, "Facilities", [fmtDate(item.meta?.data_solicitacao_facilities), item.meta?.solicitado_por].filter((value) => value !== "—" && Boolean(value)).join(" · ") || "—", cardX + 6 + colW + colGap, thirdY, colW);
    detailLine(doc, "Valor estimado", fmtMoney(item.meta?.valor_estimado), cardX + 6 + (colW + colGap) * 2, thirdY, colW);

    y = cardTop + 75;

    const longBlocks = [
      ["ATIVIDADE / OS", item.descricaoOs],
      ["OBSERVAÇÕES", item.meta?.observacao],
      ["RASTREABILIDADE", `${item.fonte === "execucao_campo" ? "Execução de Campo" : "Apontamento técnico"} · Status gestor: ${item.statusGestor || "—"} · Entrada: ${fmtDate(item.criadoEm)}${item.solicitacaoNumero ? ` · Solicitação ${item.solicitacaoNumero}` : ""}`],
    ] as const;

    for (const [label, raw] of longBlocks) {
      const value = String(raw || "").trim();
      if (!value) continue;
      const lines = doc.splitTextToSize(value, PAGE.contentWidth - 12).slice(0, 5);
      const height = 10 + lines.length * 4;
      y = ensureSpace(doc, y, height, renderHeader);
      doc.setFillColor(247, 249, 252);
      doc.setDrawColor(228, 233, 240);
      doc.roundedRect(PAGE.margin, y, PAGE.contentWidth, height, 2, 2, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.4);
      doc.setTextColor(89, 101, 117);
      doc.text(label, PAGE.margin + 5, y + 5.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.4);
      doc.setTextColor(28, 39, 54);
      doc.text(lines, PAGE.margin + 5, y + 10);
      y += height + 3;
    }

    y = await renderPhotoGrid(doc, photos, y, renderHeader);

    if (index < itens.length - 1) {
      y = ensureSpace(doc, y, 8, renderHeader);
      doc.setDrawColor(222, 228, 236);
      doc.line(PAGE.margin, y + 1, PAGE.width - PAGE.margin, y + 1);
      y += 7;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    addPageFooter(doc, page, pages);
  }

  return doc.output("blob");
}
