// Detecção automática de polígonos a partir de uma imagem anotada.
// Estratégia: reduz a imagem, classifica pixels coloridos (alta saturação),
// aplica connected-components (4-conexo, iterativo), rastreia contorno
// (Moore-neighbor) e simplifica com Ramer-Douglas-Peucker.
// Retorna polígonos em coordenadas normalizadas (% de 0-100), compatíveis
// com o modelo `taludes.polygon` existente.

export type Pt = { x: number; y: number };

export interface DetectOptions {
  /** Dimensão máxima (px) do canvas de trabalho. Padrão 1400. */
  maxDim?: number;
  /** Saturação mínima (0-1) para considerar um pixel "colorido". Padrão 0.30. */
  minSaturation?: number;
  /** Value/brilho mínimo (0-1). Padrão 0.25. */
  minValue?: number;
  /** Value/brilho máximo (0-1) — evita branco puro. Padrão 0.98. */
  maxValue?: number;
  /** Área mínima da região, em % da imagem (0-100). Padrão 0.05. */
  minAreaPct?: number;
  /** Tolerância de simplificação em % da maior dimensão. Padrão 0.35. */
  simplifyPct?: number;
  /** Dilatação em píxeis para fechar contornos finos. Padrão 1. */
  dilate?: number;
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
  previewDataUrl: string; // imagem reduzida usada na detecção
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255,
    G = g / 255,
    B = b / 255;
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

function dilateMask(mask: Uint8Array, w: number, h: number, iterations: number) {
  if (iterations <= 0) return mask;
  let src = mask;
  const dst = new Uint8Array(mask.length);
  for (let it = 0; it < iterations; it++) {
    dst.fill(0);
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
    // swap
    const tmp = src === mask ? new Uint8Array(mask.length) : src;
    tmp.set(dst);
    src = tmp;
  }
  return src;
}

// Rastreamento de contorno Moore-neighbor a partir de um pixel de fronteira.
// Retorna sequência (fechada) de pontos (x, y) em píxeis.
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
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  const contour: Pt[] = [];
  const isFg = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1 && labels[y * w + x] === label;

  let cx = startX;
  let cy = startY;
  let prevDir = 6; // veio "de cima"
  contour.push({ x: cx, y: cy });
  const maxSteps = w * h * 2;
  for (let step = 0; step < maxSteps; step++) {
    let found = false;
    const startDir = (prevDir + 6) % 8; // volta 2 direções
    for (let k = 0; k < 8; k++) {
      const d = (startDir + k) % 8;
      const nx = cx + dirs[d][0];
      const ny = cy + dirs[d][1];
      if (isFg(nx, ny)) {
        cx = nx;
        cy = ny;
        prevDir = d;
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

// Ramer-Douglas-Peucker
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
    const ax = points[a].x,
      ay = points[a].y,
      bx = points[b].x,
      by = points[b].y;
    const dx = bx - ax,
      dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    for (let i = a + 1; i < b; i++) {
      const px = points[i].x - ax;
      const py = points[i].y - ay;
      const t = (px * dx + py * dy) / len2;
      const cx = px - t * dx;
      const cy = py - t * dy;
      const d2 = cx * cx + cy * cy;
      if (d2 > maxDist) {
        maxDist = d2;
        idx = i;
      }
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

export async function detectPolygonsFromImage(
  input: Blob | HTMLImageElement | ImageBitmap,
  opts: DetectOptions = {},
): Promise<DetectResult> {
  const maxDim = opts.maxDim ?? 1400;
  const minSat = opts.minSaturation ?? 0.3;
  const minVal = opts.minValue ?? 0.25;
  const maxVal = opts.maxValue ?? 0.98;
  const minAreaPct = opts.minAreaPct ?? 0.05;
  const simplifyPct = opts.simplifyPct ?? 0.35;
  const dilate = opts.dilate ?? 1;

  let bmp: ImageBitmap | HTMLImageElement;
  if (input instanceof Blob) {
    bmp = await createImageBitmap(input);
  } else {
    bmp = input;
  }
  const srcW =
    "width" in bmp && typeof bmp.width === "number" ? bmp.width : (bmp as HTMLImageElement).naturalWidth;
  const srcH =
    "height" in bmp && typeof bmp.height === "number"
      ? bmp.height
      : (bmp as HTMLImageElement).naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.drawImage(bmp as CanvasImageSource, 0, 0, w, h);
  const previewDataUrl = canvas.toDataURL("image/jpeg", 0.8);
  const img = ctx.getImageData(0, 0, w, h).data;

  // 1) máscara de cor
  const mask = new Uint8Array(w * h);
  for (let i = 0, p = 0; p < mask.length; i += 4, p++) {
    const r = img[i],
      g = img[i + 1],
      b = img[i + 2];
    const [, s, v] = rgbToHsv(r, g, b);
    if (s >= minSat && v >= minVal && v <= maxVal) mask[p] = 1;
  }
  const dilated = dilateMask(mask, w, h, dilate);

  // 2) connected components (4-conn, BFS iterativo)
  const labels = new Int32Array(w * h);
  let nextLabel = 0;
  const componentPixels: number[][] = [];
  const queue = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!dilated[idx] || labels[idx]) continue;
      nextLabel++;
      let qHead = 0,
        qTail = 0;
      queue[qTail++] = idx;
      labels[idx] = nextLabel;
      const pixels: number[] = [];
      while (qHead < qTail) {
        const p = queue[qHead++];
        pixels.push(p);
        const px = p % w;
        const py = (p - px) / w;
        // vizinhos
        if (px > 0) {
          const n = p - 1;
          if (dilated[n] && !labels[n]) {
            labels[n] = nextLabel;
            queue[qTail++] = n;
          }
        }
        if (px < w - 1) {
          const n = p + 1;
          if (dilated[n] && !labels[n]) {
            labels[n] = nextLabel;
            queue[qTail++] = n;
          }
        }
        if (py > 0) {
          const n = p - w;
          if (dilated[n] && !labels[n]) {
            labels[n] = nextLabel;
            queue[qTail++] = n;
          }
        }
        if (py < h - 1) {
          const n = p + w;
          if (dilated[n] && !labels[n]) {
            labels[n] = nextLabel;
            queue[qTail++] = n;
          }
        }
      }
      componentPixels.push(pixels);
    }
  }

  // 3) filtrar por área, extrair contornos e simplificar
  const totalPx = w * h;
  const minAreaPx = Math.max(80, Math.floor((minAreaPct / 100) * totalPx));
  const epsilon = Math.max(1, (simplifyPct / 100) * Math.max(w, h));

  const regions: DetectedRegion[] = [];
  for (let label = 1; label <= nextLabel; label++) {
    const pixels = componentPixels[label - 1];
    if (pixels.length < minAreaPx) continue;
    // encontra ponto de partida = topmost-leftmost
    let start = pixels[0];
    for (const p of pixels) if (p < start) start = p;
    const sx = start % w;
    const sy = (start - sx) / w;
    const contour = traceContour(dilated, w, h, sx, sy, label, labels);
    if (contour.length < 4) continue;
    const simplified = rdp(contour, epsilon);
    if (simplified.length < 3) continue;

    // cor média (amostragem por pixels originais)
    let rSum = 0,
      gSum = 0,
      bSum = 0;
    const sample = Math.max(1, Math.floor(pixels.length / 500));
    let n = 0;
    for (let k = 0; k < pixels.length; k += sample) {
      const p = pixels[k];
      const px = p % w;
      const py = (p - px) / w;
      const off = (py * w + px) * 4;
      rSum += img[off];
      gSum += img[off + 1];
      bSum += img[off + 2];
      n++;
    }
    const color = `rgb(${Math.round(rSum / n)}, ${Math.round(gSum / n)}, ${Math.round(bSum / n)})`;

    // centroid (percentual)
    let cx = 0,
      cy = 0;
    for (const pt of simplified) {
      cx += pt.x;
      cy += pt.y;
    }
    cx /= simplified.length;
    cy /= simplified.length;

    // converte para % (0-100)
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

  // ordena por posição (top→bottom, left→right)
  regions.sort((a, b) => a.centroid.y - b.centroid.y || a.centroid.x - b.centroid.x);

  return { regions, workWidth: w, workHeight: h, previewDataUrl };
}
