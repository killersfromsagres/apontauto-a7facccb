// Detecção automática de polígonos a partir de uma imagem anotada.
// Estratégia (v2 — separação por matiz + abertura morfológica):
//   1) Reduz a imagem para trabalho.
//   2) Classifica pixels coloridos (saturação/brilho) e agrupa por matiz
//      em faixas HSV, para que áreas coloridas vizinhas de cores diferentes
//      NÃO se fundam numa única região.
//   3) Aplica abertura morfológica (erode → dilate) em cada máscara,
//      removendo ruído sem "engordar" os contornos.
//   4) Rotula componentes conexos (4-conn, BFS iterativo).
//   5) Rastreia contorno (Moore-neighbor) e simplifica com RDP.
// Retorna polígonos em coordenadas normalizadas (% de 0-100).

export type Pt = { x: number; y: number };

export interface DetectOptions {
  /** Dimensão máxima (px) do canvas de trabalho. Padrão 1600. */
  maxDim?: number;
  /** Saturação mínima (0-1). Padrão 0.30. */
  minSaturation?: number;
  /** Value/brilho mínimo (0-1). Padrão 0.22. */
  minValue?: number;
  /** Value/brilho máximo (0-1) — evita branco puro. Padrão 0.98. */
  maxValue?: number;
  /** Área mínima da região, em % da imagem (0-100). Padrão 0.05. */
  minAreaPct?: number;
  /** Tolerância de simplificação em % da maior dimensão. Padrão 0.20. */
  simplifyPct?: number;
  /** Erosão em px (limpa ruído). Padrão 1. */
  erode?: number;
  /** Dilatação em px (recupera área após erosão). Padrão 1. */
  dilate?: number;
  /** Número de faixas de matiz. Padrão 12 (30° cada). */
  hueBins?: number;
}

export interface DetectedRegion {
  polygon: Pt[]; // percentual (0-100)
  areaPct: number;
  color: string; // css rgb() médio da região
  centroid: Pt; // percentual
}

export interface DetectResult {
  regions: DetectedRegion[];
  workWidth: number;
  workHeight: number;
  previewDataUrl: string;
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const v = max;
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, v];
}

function erodeMask(mask: Uint8Array, w: number, h: number, iterations: number) {
  if (iterations <= 0) return mask;
  let src = mask;
  for (let it = 0; it < iterations; it++) {
    const dst = new Uint8Array(src.length);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (
          src[i] &&
          src[i - 1] && src[i + 1] &&
          src[i - w] && src[i + w]
        ) {
          dst[i] = 1;
        }
      }
    }
    src = dst;
  }
  return src;
}

function dilateMask(mask: Uint8Array, w: number, h: number, iterations: number) {
  if (iterations <= 0) return mask;
  let src = mask;
  for (let it = 0; it < iterations; it++) {
    const dst = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (src[i]) {
          dst[i] = 1;
          if (x > 0) dst[i - 1] = 1;
          if (x < w - 1) dst[i + 1] = 1;
          if (y > 0) dst[i - w] = 1;
          if (y < h - 1) dst[i + w] = 1;
        }
      }
    }
    src = dst;
  }
  return src;
}

function traceContour(
  mask: Uint8Array,
  w: number,
  h: number,
  startX: number,
  startY: number,
  label: number,
  labels: Int32Array,
): Pt[] {
  const dirs = [
    [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [-1, -1], [0, -1], [1, -1],
  ];
  const contour: Pt[] = [];
  const isFg = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1 && labels[y * w + x] === label;

  let cx = startX;
  let cy = startY;
  let prevDir = 6;
  contour.push({ x: cx, y: cy });
  const maxSteps = w * h * 2;
  for (let step = 0; step < maxSteps; step++) {
    let found = false;
    const startDir = (prevDir + 6) % 8;
    for (let k = 0; k < 8; k++) {
      const d = (startDir + k) % 8;
      const nx = cx + dirs[d][0];
      const ny = cy + dirs[d][1];
      if (isFg(nx, ny)) {
        cx = nx; cy = ny; prevDir = d;
        contour.push({ x: cx, y: cy });
        found = true;
        break;
      }
    }
    if (!found) break;
    if (contour.length > 3 && cx === startX && cy === startY) break;
  }
  return contour;
}

function rdp(points: Pt[], epsilon: number): Pt[] {
  if (points.length < 3) return points.slice();
  const sqEps = epsilon * epsilon;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxDist = -1;
    let idx = -1;
    const ax = points[a].x, ay = points[a].y, bx = points[b].x, by = points[b].y;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    for (let i = a + 1; i < b; i++) {
      const px = points[i].x - ax;
      const py = points[i].y - ay;
      const t = (px * dx + py * dy) / len2;
      const cx = px - t * dx;
      const cy = py - t * dy;
      const d2 = cx * cx + cy * cy;
      if (d2 > maxDist) { maxDist = d2; idx = i; }
    }
    if (maxDist > sqEps && idx !== -1) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out: Pt[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/** Componentes conexos + extração de contornos + simplificação a partir de uma máscara binária. */
export function regionsFromMask(
  mask: Uint8Array,
  w: number,
  h: number,
  opts: { minAreaPx: number; epsilon: number; colorSampler?: (px: number) => [number, number, number] },
): DetectedRegion[] {
  const labels = new Int32Array(w * h);
  let nextLabel = 0;
  const componentPixels: number[][] = [];
  const queue = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!mask[idx] || labels[idx]) continue;
      nextLabel++;
      let qHead = 0, qTail = 0;
      queue[qTail++] = idx;
      labels[idx] = nextLabel;
      const pixels: number[] = [];
      while (qHead < qTail) {
        const p = queue[qHead++];
        pixels.push(p);
        const px = p % w;
        const py = (p - px) / w;
        if (px > 0) { const n = p - 1; if (mask[n] && !labels[n]) { labels[n] = nextLabel; queue[qTail++] = n; } }
        if (px < w - 1) { const n = p + 1; if (mask[n] && !labels[n]) { labels[n] = nextLabel; queue[qTail++] = n; } }
        if (py > 0) { const n = p - w; if (mask[n] && !labels[n]) { labels[n] = nextLabel; queue[qTail++] = n; } }
        if (py < h - 1) { const n = p + w; if (mask[n] && !labels[n]) { labels[n] = nextLabel; queue[qTail++] = n; } }
      }
      componentPixels.push(pixels);
    }
  }

  const totalPx = w * h;
  const regions: DetectedRegion[] = [];
  for (let label = 1; label <= nextLabel; label++) {
    const pixels = componentPixels[label - 1];
    if (pixels.length < opts.minAreaPx) continue;
    let start = pixels[0];
    for (const p of pixels) if (p < start) start = p;
    const sx = start % w;
    const sy = (start - sx) / w;
    const contour = traceContour(mask, w, h, sx, sy, label, labels);
    if (contour.length < 4) continue;
    const simplified = rdp(contour, opts.epsilon);
    if (simplified.length < 3) continue;

    let rSum = 0, gSum = 0, bSum = 0, n = 0;
    const sample = Math.max(1, Math.floor(pixels.length / 500));
    if (opts.colorSampler) {
      for (let k = 0; k < pixels.length; k += sample) {
        const [r, g, b] = opts.colorSampler(pixels[k]);
        rSum += r; gSum += g; bSum += b; n++;
      }
    }
    const color = n > 0
      ? `rgb(${Math.round(rSum / n)}, ${Math.round(gSum / n)}, ${Math.round(bSum / n)})`
      : "rgb(59,130,246)";

    let cx = 0, cy = 0;
    for (const pt of simplified) { cx += pt.x; cy += pt.y; }
    cx /= simplified.length; cy /= simplified.length;

    const polygon: Pt[] = simplified.map((pt) => ({
      x: +((pt.x / w) * 100).toFixed(3),
      y: +((pt.y / h) * 100).toFixed(3),
    }));
    regions.push({
      polygon,
      areaPct: +((pixels.length / totalPx) * 100).toFixed(3),
      color,
      centroid: { x: +((cx / w) * 100).toFixed(3), y: +((cy / h) * 100).toFixed(3) },
    });
  }
  return regions;
}

export async function detectPolygonsFromImage(
  input: Blob | HTMLImageElement | ImageBitmap,
  opts: DetectOptions = {},
): Promise<DetectResult> {
  const maxDim = opts.maxDim ?? 1600;
  const minSat = opts.minSaturation ?? 0.30;
  const minVal = opts.minValue ?? 0.22;
  const maxVal = opts.maxValue ?? 0.98;
  const minAreaPct = opts.minAreaPct ?? 0.05;
  const simplifyPct = opts.simplifyPct ?? 0.20;
  const erode = opts.erode ?? 1;
  const dilate = opts.dilate ?? 1;
  const hueBins = Math.max(3, opts.hueBins ?? 12);

  let bmp: ImageBitmap | HTMLImageElement;
  if (input instanceof Blob) bmp = await createImageBitmap(input);
  else bmp = input;
  const srcW = "width" in bmp && typeof bmp.width === "number" ? bmp.width : (bmp as HTMLImageElement).naturalWidth;
  const srcH = "height" in bmp && typeof bmp.height === "number" ? bmp.height : (bmp as HTMLImageElement).naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(bmp as CanvasImageSource, 0, 0, w, h);
  const previewDataUrl = canvas.toDataURL("image/jpeg", 0.85);
  const img = ctx.getImageData(0, 0, w, h).data;

  // 1) Máscaras por faixa de matiz. Pixels acromáticos (baixa saturação) são descartados.
  const buckets: Uint8Array[] = Array.from({ length: hueBins }, () => new Uint8Array(w * h));
  const binSize = 360 / hueBins;
  for (let i = 0, p = 0; p < w * h; i += 4, p++) {
    const r = img[i], g = img[i + 1], b = img[i + 2];
    const [hVal, s, v] = rgbToHsv(r, g, b);
    if (s < minSat || v < minVal || v > maxVal) continue;
    const bin = Math.min(hueBins - 1, Math.floor(hVal / binSize));
    buckets[bin][p] = 1;
  }

  const totalPx = w * h;
  const minAreaPx = Math.max(80, Math.floor((minAreaPct / 100) * totalPx));
  const epsilon = Math.max(0.5, (simplifyPct / 100) * Math.max(w, h));

  const colorSampler = (p: number): [number, number, number] => {
    const off = p * 4;
    return [img[off], img[off + 1], img[off + 2]];
  };

  const all: DetectedRegion[] = [];
  for (let bin = 0; bin < hueBins; bin++) {
    let mask = buckets[bin];
    // opening: erode then dilate — remove ruído sem inflar o contorno
    mask = erodeMask(mask, w, h, erode);
    mask = dilateMask(mask, w, h, dilate);
    const regs = regionsFromMask(mask, w, h, { minAreaPx, epsilon, colorSampler });
    all.push(...regs);
  }

  all.sort((a, b) => a.centroid.y - b.centroid.y || a.centroid.x - b.centroid.x);
  return { regions: all, workWidth: w, workHeight: h, previewDataUrl };
}
