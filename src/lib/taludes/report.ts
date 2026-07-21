// Relatório PDF profissional dos taludes de um mapa.
// - Página 1: capa com o mapa base + todos os polígonos numerados.
// - Página 2..N: tabela de taludes com nº, status, datas, área, perímetro.
// Gerado 100% client-side; não toca no backend.

import jsPDF from "jspdf";
import { exportMapPNG } from "./export";
import {
  polygonAreaPct,
  polygonPerimeterPct,
  realMetrics,
  formatArea,
  formatPerimeter,
  type Point,
} from "./geometry";
import { STATUS_META, type TaludeStatus } from "./constants";

interface ReportTalude {
  numero: number;
  nome: string | null;
  status: TaludeStatus;
  polygon: Point[];
  data_programada: string | null;
  data_execucao: string | null;
  data_conclusao: string | null;
  proxima_data: string | null;
  periodicidade_dias: number | null;
}

interface ReportMap {
  nome: string;
  imageUrl: string;
  imageWidthPx?: number | null;
  imageHeightPx?: number | null;
  metersPerPixel?: number | null;
}

function fmtBr(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}

async function blobToDataURL(b: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

export async function buildSlopeReport(map: ReportMap, taludes: ReportTalude[]): Promise<Blob> {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 12;

  // ── Cabeçalho da capa ──
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(`Programação de Taludes — ${map.nome}`, margin, margin + 4);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(90);
  const gerado = new Date().toLocaleString("pt-BR");
  pdf.text(`Emitido em ${gerado}`, margin, margin + 10);
  pdf.text(`Total de taludes: ${taludes.length}`, pageW - margin, margin + 10, { align: "right" });
  pdf.setTextColor(0);

  // ── Mapa base com polígonos ──
  const png = await exportMapPNG({
    imageUrl: map.imageUrl,
    mapName: map.nome,
    taludes: taludes.map((t) => ({
      numero: t.numero,
      nome: t.nome,
      status: t.status,
      polygon: t.polygon,
      data_programada: t.data_programada,
      data_execucao: t.data_execucao,
      data_conclusao: t.data_conclusao,
      proxima_data: t.proxima_data,
    })),
  });
  const pngData = await blobToDataURL(png);
  // Área utilizável do mapa na capa
  const imgTop = margin + 14;
  const imgH = pageH - imgTop - margin - 6;
  const imgW = pageW - margin * 2;
  // Preserva aspecto ao inserir (jsPDF respeita w/h explícitos)
  pdf.addImage(pngData, "PNG", margin, imgTop, imgW, imgH, undefined, "FAST");
  pdf.setFontSize(8);
  pdf.setTextColor(120);
  pdf.text("Sherwin Williams · Demarchi", pageW / 2, pageH - margin + 2, { align: "center" });
  pdf.setTextColor(0);

  // ── Tabela de taludes ──
  pdf.addPage("a4", "landscape");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("Detalhamento dos taludes", margin, margin + 4);

  const rows = taludes
    .slice()
    .sort((a, b) => a.numero - b.numero)
    .map((t) => {
      const areaPct = polygonAreaPct(t.polygon);
      const perimPct = polygonPerimeterPct(t.polygon);
      const { areaM2, perimetroM } = realMetrics(t.polygon, {
        imageWidthPx: map.imageWidthPx,
        imageHeightPx: map.imageHeightPx,
        metersPerPixel: map.metersPerPixel,
      });
      return {
        numero: t.numero,
        nome: t.nome ?? `Talude ${String(t.numero).padStart(2, "0")}`,
        status: STATUS_META[t.status].label,
        prog: fmtBr(t.data_programada),
        exec: fmtBr(t.data_execucao),
        conc: fmtBr(t.data_conclusao),
        prox: fmtBr(t.proxima_data),
        area: formatArea(areaPct, areaM2),
        perim: formatPerimeter(perimPct, perimetroM),
      };
    });

  const headers = ["Nº", "Nome", "Status", "Prog.", "Execução", "Conclusão", "Próxima", "Área", "Perímetro"];
  const widths = [10, 55, 26, 22, 22, 22, 22, 32, 30]; // soma ≈ 241 mm

  const startY = margin + 10;
  const rowH = 7;

  const drawHeader = (y: number) => {
    pdf.setFillColor(30, 41, 59);
    pdf.setTextColor(255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.rect(margin, y, widths.reduce((a, b) => a + b, 0), rowH, "F");
    let x = margin;
    headers.forEach((h, i) => {
      pdf.text(h, x + 1.5, y + rowH - 2);
      x += widths[i];
    });
    pdf.setTextColor(0);
    pdf.setFont("helvetica", "normal");
  };

  drawHeader(startY);
  let y = startY + rowH;
  pdf.setFontSize(9);
  for (const r of rows) {
    if (y + rowH > pageH - margin) {
      pdf.addPage("a4", "landscape");
      drawHeader(margin);
      y = margin + rowH;
    }
    // zebra
    if ((rows.indexOf(r) & 1) === 1) {
      pdf.setFillColor(245, 247, 250);
      pdf.rect(margin, y, widths.reduce((a, b) => a + b, 0), rowH, "F");
    }
    const cells = [
      String(r.numero),
      r.nome,
      r.status,
      r.prog,
      r.exec,
      r.conc,
      r.prox,
      r.area,
      r.perim,
    ];
    let x = margin;
    cells.forEach((c, i) => {
      const text = pdf.splitTextToSize(c, widths[i] - 2)[0] ?? "";
      pdf.text(text, x + 1.5, y + rowH - 2);
      x += widths[i];
    });
    y += rowH;
  }

  // Rodapé com paginação
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(140);
    pdf.text(`${i} / ${pageCount}`, pageW - margin, pageH - margin + 2, { align: "right" });
    pdf.setTextColor(0);
  }

  return pdf.output("blob");
}
