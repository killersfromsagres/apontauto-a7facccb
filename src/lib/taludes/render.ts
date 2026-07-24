import type { Point, TaludeMarcacao } from "./api";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar imagem do mapa"));
    img.src = src;
  });
}

function fmtBr(iso: string): string {
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}

function polyCentroid(pts: Point[]): Point {
  const sx = pts.reduce((a, p) => a + p.x, 0);
  const sy = pts.reduce((a, p) => a + p.y, 0);
  return { x: sx / pts.length, y: sy / pts.length };
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

/**
 * Renderiza o mapa + marcações em um canvas no tamanho nativo da imagem,
 * para exportação PNG 1:1 (sem distorção).
 */
export async function renderMapToBlob(
  imageUrl: string,
  marcacoes: TaludeMarcacao[],
): Promise<Blob> {
  const img = await loadImage(imageUrl);
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);

  const scale = Math.max(1, Math.max(W, H) / 1400);

  for (const m of marcacoes) {
    if (!m.polygon || m.polygon.length < 3) continue;
    ctx.beginPath();
    m.polygon.forEach((p, i) => {
      const x = (p.x / 100) * W;
      const y = (p.y / 100) * H;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = hexToRgba(m.cor, 0.32);
    ctx.fill();
    ctx.strokeStyle = m.cor;
    ctx.lineWidth = Math.max(2, 2.4 * scale);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }

  // Labels em segundo passe (ficam por cima)
  for (const m of marcacoes) {
    if (!m.polygon || m.polygon.length < 3) continue;
    const c = polyCentroid(m.polygon);
    const cx = (c.x / 100) * W;
    const cy = (c.y / 100) * H;

    const numSize = Math.round(32 * scale);
    const dateSize = Math.round(16 * scale);
    const label = m.rotulo ? `${m.numero} · ${m.rotulo}` : String(m.numero);
    const dateStr = fmtBr(m.data);

    ctx.font = `800 ${numSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(15,23,42,0.95)";
    ctx.lineWidth = Math.max(4, 5 * scale);
    ctx.strokeText(label, cx, cy - numSize * 0.15);
    ctx.fillStyle = "#fde047";
    ctx.fillText(label, cx, cy - numSize * 0.15);

    ctx.font = `600 ${dateSize}px system-ui, -apple-system, sans-serif`;
    const dm = ctx.measureText(dateStr);
    const padX = dateSize * 0.7;
    const padY = dateSize * 0.35;
    const pillW = dm.width + padX * 2;
    const pillH = dateSize + padY * 2;
    const pillX = Math.max(4, Math.min(W - pillW - 4, cx - pillW / 2));
    const pillY = Math.min(H - pillH - 4, cy + numSize * 0.55);

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = Math.max(3, 4 * scale);
    ctx.shadowOffsetY = Math.max(1, 1.5 * scale);
    ctx.fillStyle = "rgba(15,23,42,0.92)";
    roundRect(ctx, pillX, pillY, pillW, pillH, Math.max(6, dateSize * 0.4));
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(dateStr, pillX + pillW / 2, pillY + pillH / 2);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar PNG"))),
      "image/png",
      1.0,
    );
  });
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const bigint = parseInt(
    h.length === 3
      ? h.split("").map((c) => c + c).join("")
      : h,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
