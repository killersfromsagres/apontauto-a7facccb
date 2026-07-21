export { STATUS_META, type TaludeStatus } from "./constants";
import { STATUS_META, type TaludeStatus } from "./constants";



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

function centroid(pts: Array<{ x: number; y: number }>) {
  if (pts.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

/**
 * Export de altíssima resolução, adequado para impressão (300 DPI equivalente).
 * Sem legenda, sem marca d'água e sem data de geração no PNG.
 */
export async function exportMapPNG(opts: {
  imageUrl: string;
  mapName: string;
  taludes: ExportTalude[];
}): Promise<Blob> {
  const img = await loadImage(opts.imageUrl);
  // Alta resolução: alvo ~4800px na maior dimensão (equivalente a >300 DPI para A3)
  const scale = Math.min(3, 4800 / Math.max(img.width, 1));
  const W = Math.round(img.width * scale);
  const H = Math.round(img.height * scale);
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

  // polígonos vibrantes
  for (const t of opts.taludes) {
    if (t.polygon.length < 3) continue;
    const meta = STATUS_META[t.status];

    ctx.beginPath();
    for (let i = 0; i < t.polygon.length; i++) {
      const p = t.polygon[i];
      const px = (p.x / 100) * W;
      const py = (p.y / 100) * H;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    // preenchimento vibrante translúcido
    ctx.fillStyle = meta.fill + "80"; // ~50% alpha
    ctx.fill();

    // contorno grosso e nítido
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = meta.stroke;
    ctx.lineWidth = Math.max(3, scale * 2.2);
    ctx.stroke();
  }

  // labels (número + data) em passe separado para ficarem no topo
  for (const t of opts.taludes) {
    if (t.polygon.length < 3) continue;

    const c = centroid(t.polygon);
    const cx = (c.x / 100) * W;
    const cy = (c.y / 100) * H;

    const dateStr =
      t.status === "finalizado"
        ? `Próx: ${fmtBr(t.proxima_data)}`
        : t.status === "em_execucao"
          ? `Exec: ${fmtBr(t.data_execucao)}`
          : `Prog: ${fmtBr(t.data_programada)}`;

    // Número gigante amarelo com contorno escuro
    const numSize = Math.max(48, Math.round(scale * 44));
    ctx.font = `900 ${numSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = Math.max(6, scale * 5);
    ctx.strokeText(String(t.numero), cx, cy - numSize * 0.2);
    ctx.fillStyle = "#fde047";
    ctx.fillText(String(t.numero), cx, cy - numSize * 0.2);

    // Etiqueta de data — cartão arredondado escuro semi-transparente
    const dateSize = Math.max(16, Math.round(scale * 15));
    ctx.font = `600 ${dateSize}px system-ui, -apple-system, sans-serif`;
    const dm = ctx.measureText(dateStr);
    const padX = dateSize * 0.7;
    const padY = dateSize * 0.35;
    const pillW = dm.width + padX * 2;
    const pillH = dateSize + padY * 2;
    const pillX = cx - pillW / 2;
    const pillY = cy + numSize * 0.35;

    // sombra suave
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = Math.max(6, scale * 4);
    ctx.shadowOffsetY = Math.max(2, scale * 1.5);
    ctx.fillStyle = "rgba(15,23,42,0.92)";
    roundRect(ctx, pillX, pillY, pillW, pillH, Math.max(6, dateSize * 0.35));
    ctx.fill();
    ctx.restore();

    // texto da data
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(dateStr, cx, pillY + pillH / 2);

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
