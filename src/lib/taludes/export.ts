export { STATUS_META, type TaludeStatus } from "./constants";
import { STATUS_META, type TaludeStatus } from "./constants";
import { polygonLabelAnchor } from "./geometry";



interface ExportTalude {
  numero: number;
  nome: string | null;
  status: TaludeStatus;
  polygon: Array<{ x: number; y: number }>;
  data_programada: string | null;
  data_execucao: string | null;
  data_conclusao: string | null;
  proxima_data: string | null;
}

function fmtBr(iso: string | null): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Export na dimensão nativa do mapa, mantendo coordenadas 1:1 com a demarcação.
 * Sem legenda, sem marca d'água e sem data de geração no PNG.
 */
export async function exportMapPNG(opts: {
  imageUrl: string;
  mapName: string;
  taludes: ExportTalude[];
}): Promise<Blob> {
  const img = await loadImage(opts.imageUrl);
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  const uiScale = Math.max(0.75, Math.max(W, H) / 1600);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível");

  // Suavização máxima
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // background branco
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // mapa base
  ctx.drawImage(img, 0, 0, W, H);

  // polígonos vibrantes. O preenchimento usa coordenadas exatas; o contorno é
  // desenhado com proteção nas bordas para não ser cortado pelo limite do canvas.
  for (const t of opts.taludes) {
    if (t.polygon.length < 3) continue;
    const meta = STATUS_META[t.status];
    const strokeWidth = Math.max(2, uiScale * 2.2);

    ctx.beginPath();
    tracePolygon(ctx, t.polygon, W, H);

    // preenchimento vibrante translúcido
    ctx.fillStyle = meta.fill + "80"; // ~50% alpha
    ctx.fill();

    // contorno grosso e nítido
    ctx.beginPath();
    tracePolygon(ctx, t.polygon, W, H, strokeWidth / 2 + 0.5);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = meta.stroke;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }

  // labels (número + data) em passe separado para ficarem no topo
  for (const t of opts.taludes) {
    if (t.polygon.length < 3) continue;

    const anchor = polygonLabelAnchor(t.polygon);
    const cx = (anchor.number.x / 100) * W;
    const cy = (anchor.number.y / 100) * H;

    const dateStr =
      t.status === "finalizado"
        ? `Próx: ${fmtBr(t.proxima_data)}`
        : t.status === "em_execucao"
          ? `Exec: ${fmtBr(t.data_execucao)}`
          : `Prog: ${fmtBr(t.data_programada)}`;

    // Número gigante amarelo com contorno escuro
    const numSize = Math.max(24, Math.round(uiScale * 42));
    ctx.font = `900 ${numSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = Math.max(4, uiScale * 5);
    ctx.strokeText(String(t.numero), cx, cy);
    ctx.fillStyle = "#fde047";
    ctx.fillText(String(t.numero), cx, cy);

    // Etiqueta de data — ancorada no limite do polígono, próxima à área marcada.
    const dateSize = Math.max(10, Math.round(uiScale * 14));
    ctx.font = `600 ${dateSize}px system-ui, -apple-system, sans-serif`;
    const dm = ctx.measureText(dateStr);
    const padX = dateSize * 0.7;
    const padY = dateSize * 0.35;
    const pillW = dm.width + padX * 2;
    const pillH = dateSize + padY * 2;
    const dateX = (anchor.date.x / 100) * W;
    const dateY = (anchor.date.y / 100) * H;
    const pillX = Math.max(3, Math.min(W - pillW - 3, dateX - pillW / 2));
    const pillY = anchor.datePlacement === "below" ? dateY : dateY - pillH;

    // sombra suave
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = Math.max(4, uiScale * 4);
    ctx.shadowOffsetY = Math.max(1, uiScale * 1.5);
    ctx.fillStyle = "rgba(15,23,42,0.92)";
    roundRect(ctx, pillX, pillY, pillW, pillH, Math.max(6, dateSize * 0.35));
    ctx.fill();
    ctx.restore();

    // texto da data
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(dateStr, pillX + pillW / 2, pillY + pillH / 2);

    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  // Rodapé removido: nenhum texto de marca ou data é adicionado à imagem exportada.

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar PNG"))),
      "image/png",
      1.0,
    );
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function tracePolygon(
  ctx: CanvasRenderingContext2D,
  polygon: Array<{ x: number; y: number }>,
  W: number,
  H: number,
  insetPx = 0,
) {
  const minX = insetPx;
  const minY = insetPx;
  const maxX = Math.max(minX, W - insetPx);
  const maxY = Math.max(minY, H - insetPx);

  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const rawX = (Math.max(0, Math.min(100, p.x)) / 100) * W;
    const rawY = (Math.max(0, Math.min(100, p.y)) / 100) * H;
    const px = Math.max(minX, Math.min(maxX, rawX));
    const py = Math.max(minY, Math.min(maxY, rawY));
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// cache de imagens já carregadas para o export não refazer o download
const imgCache = new Map<string, HTMLImageElement>();

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imgCache.get(src);
  if (cached && cached.complete && cached.naturalWidth > 0) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      imgCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error("Não foi possível carregar a imagem do mapa"));
    img.src = src;
  });
}
