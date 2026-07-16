import type { Talude, TaludeMap } from "./taludes";
import { STATUS_META, formatDateBR, polygonCentroid } from "./taludes";
import { downloadBlob } from "./download";

export async function exportMapPNG(params: {
  map: TaludeMap;
  imageUrl: string;
  taludes: Talude[];
}): Promise<void> {
  const { map, imageUrl, taludes } = params;

  const img = await loadImage(imageUrl);
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  const HEADER_H = Math.round(ih * 0.06 + 40);
  const FOOTER_H = Math.round(ih * 0.09 + 60);

  const scale = Math.min(2, Math.max(1, 1600 / iw));
  const W = Math.round(iw * scale);
  const H = Math.round((ih + HEADER_H + FOOTER_H) * scale);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // fundo
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, W, H);

  // header
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, W, HEADER_H * scale);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(28 * scale)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(`Programação de Taludes — ${map.nome}`, 24 * scale, (HEADER_H * scale) / 2 - 8 * scale);
  ctx.fillStyle = "#94a3b8";
  ctx.font = `${Math.round(16 * scale)}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillText(
    `Gerado em ${new Date().toLocaleString("pt-BR")}`,
    24 * scale,
    (HEADER_H * scale) / 2 + 18 * scale,
  );

  // imagem base
  const imgY = HEADER_H * scale;
  ctx.drawImage(img, 0, imgY, iw * scale, ih * scale);

  // polígonos
  for (const t of taludes) {
    if (!t.polygon || t.polygon.length < 3) continue;
    const meta = STATUS_META[t.status];
    ctx.beginPath();
    t.polygon.forEach((p, i) => {
      const x = (p.x / 100) * iw * scale;
      const y = imgY + (p.y / 100) * ih * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = meta.hexSoft;
    ctx.fill();
    ctx.lineWidth = 3 * scale;
    ctx.strokeStyle = meta.hex;
    ctx.stroke();

    // label
    const c = polygonCentroid(t.polygon);
    const cx = (c.x / 100) * iw * scale;
    const cy = imgY + (c.y / 100) * ih * scale;
    const label = `T${String(t.numero).padStart(2, "0")}`;
    const sub = meta.label;
    const dateRel =
      t.status === "finalizado"
        ? `Próxima: ${formatDateBR(t.proxima_data)}`
        : t.status === "em_execucao"
          ? `Início: ${formatDateBR(t.data_execucao)}`
          : `Prog.: ${formatDateBR(t.data_programada)}`;

    // caixa
    ctx.font = `bold ${Math.round(18 * scale)}px system-ui, sans-serif`;
    const w1 = ctx.measureText(label).width;
    ctx.font = `${Math.round(13 * scale)}px system-ui, sans-serif`;
    const w2 = ctx.measureText(sub).width;
    const w3 = ctx.measureText(dateRel).width;
    const boxW = Math.max(w1, w2, w3) + 20 * scale;
    const boxH = 62 * scale;
    const bx = cx - boxW / 2;
    const by = cy - boxH / 2;

    ctx.fillStyle = "rgba(15,23,42,0.88)";
    roundRect(ctx, bx, by, boxW, boxH, 8 * scale);
    ctx.fill();
    ctx.strokeStyle = meta.hex;
    ctx.lineWidth = 2 * scale;
    roundRect(ctx, bx, by, boxW, boxH, 8 * scale);
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.round(18 * scale)}px system-ui, sans-serif`;
    ctx.fillText(label, cx, by + 18 * scale);
    ctx.fillStyle = meta.hex;
    ctx.font = `bold ${Math.round(13 * scale)}px system-ui, sans-serif`;
    ctx.fillText(sub, cx, by + 36 * scale);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = `${Math.round(12 * scale)}px system-ui, sans-serif`;
    ctx.fillText(dateRel, cx, by + 52 * scale);
    ctx.textAlign = "start";
  }

  // footer / legenda
  const fy = imgY + ih * scale;
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, fy, W, FOOTER_H * scale);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = `bold ${Math.round(16 * scale)}px system-ui, sans-serif`;
  ctx.fillText("Legenda", 24 * scale, fy + 24 * scale);

  const statuses: Array<keyof typeof STATUS_META> = ["programado", "em_execucao", "finalizado"];
  let lx = 24 * scale;
  const ly = fy + 52 * scale;
  ctx.font = `${Math.round(14 * scale)}px system-ui, sans-serif`;
  for (const s of statuses) {
    const m = STATUS_META[s];
    ctx.fillStyle = m.hexSoft;
    ctx.fillRect(lx, ly - 12 * scale, 24 * scale, 16 * scale);
    ctx.strokeStyle = m.hex;
    ctx.lineWidth = 2 * scale;
    ctx.strokeRect(lx, ly - 12 * scale, 24 * scale, 16 * scale);
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(m.label, lx + 32 * scale, ly);
    lx += ctx.measureText(m.label).width + 80 * scale;
  }

  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b!), "image/png", 0.95),
  );
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `taludes-${map.nome.replace(/\s+/g, "_")}-${stamp}.png`);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
