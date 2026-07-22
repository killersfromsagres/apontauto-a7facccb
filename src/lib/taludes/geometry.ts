// Geometria em coordenadas normalizadas (0..100 em % do mapa).
// Usada para snap-close, cálculo de área/perímetro e centróide.

export interface Point {
  x: number;
  y: number;
}

/** Distância euclidiana em unidades de coordenada (%). */
export function distPct(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Área do polígono em % do mapa (fórmula do sapateiro). */
export function polygonAreaPct(pts: Point[]): number {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Perímetro em unidades de coordenada (%). */
export function polygonPerimeterPct(pts: Point[]): number {
  if (pts.length < 2) return 0;
  let p = 0;
  for (let i = 0; i < pts.length; i++) p += distPct(pts[i], pts[(i + 1) % pts.length]);
  return p;
}

/** Centróide (média simples dos vértices; suficiente para posicionar labels). */
export function polygonCentroid(pts: Point[]): Point {
  if (pts.length === 0) return { x: 50, y: 50 };
  const sx = pts.reduce((a, p) => a + p.x, 0);
  const sy = pts.reduce((a, p) => a + p.y, 0);
  return { x: sx / pts.length, y: sy / pts.length };
}

export function polygonBounds(pts: Point[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  if (pts.length === 0) return { minX: 50, minY: 50, maxX: 50, maxY: 50 };
  let minX = 100;
  let minY = 100;
  let maxX = 0;
  let maxY = 0;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

const clampPct = (v: number, min = 1, max = 99) => Math.max(min, Math.min(max, v));

export function polygonLabelAnchor(pts: Point[]): {
  number: Point;
  date: Point;
  datePlacement: "above" | "below";
} {
  const b = polygonBounds(pts);
  const x = clampPct((b.minX + b.maxX) / 2, 2, 98);
  const numberY = clampPct((b.minY + b.maxY) / 2, 2, 98);
  const gap = 0.75;
  const belowY = b.maxY + gap;
  if (belowY <= 98.5) {
    return {
      number: { x, y: numberY },
      date: { x, y: belowY },
      datePlacement: "below",
    };
  }
  return {
    number: { x, y: numberY },
    date: { x, y: clampPct(b.minY - gap, 1.5, 98.5) },
    datePlacement: "above",
  };
}

/**
 * Métricas reais quando o mapa tem escala calibrada.
 * - `escala_m_por_px`: metros por pixel do bitmap original.
 * - `image_width` / `image_height`: dimensões em pixels da imagem base.
 *
 * Área em coordenadas % => converte para px² multiplicando por (W*H)/10000,
 * depois para m² multiplicando por (m_por_px)^2. Perímetro em % =>
 * aproxima cada segmento pela hipotenusa em px usando W e H reais.
 */
export function realMetrics(
  pts: Point[],
  opts: {
    imageWidthPx?: number | null;
    imageHeightPx?: number | null;
    metersPerPixel?: number | null;
  },
): { areaM2: number | null; perimetroM: number | null } {
  const W = opts.imageWidthPx ?? null;
  const H = opts.imageHeightPx ?? null;
  const mpp = opts.metersPerPixel ?? null;
  if (!W || !H || !mpp || mpp <= 0 || pts.length < 3) {
    return { areaM2: null, perimetroM: null };
  }
  const areaPct = polygonAreaPct(pts); // em (%)²
  const areaPx2 = (areaPct * W * H) / 10000;
  const areaM2 = areaPx2 * mpp * mpp;

  let perimPx = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = ((a.x - b.x) / 100) * W;
    const dy = ((a.y - b.y) / 100) * H;
    perimPx += Math.sqrt(dx * dx + dy * dy);
  }
  const perimetroM = perimPx * mpp;
  return { areaM2, perimetroM };
}

/** Formata área/perímetro para o painel do talude. */
export function formatArea(areaPct: number, areaM2: number | null): string {
  if (areaM2 != null) {
    if (areaM2 >= 10000) return `${(areaM2 / 10000).toFixed(2)} ha`;
    return `${areaM2.toFixed(1)} m²`;
  }
  return `${areaPct.toFixed(2)}% do mapa`;
}

export function formatPerimeter(perimPct: number, perimM: number | null): string {
  if (perimM != null) {
    if (perimM >= 1000) return `${(perimM / 1000).toFixed(2)} km`;
    return `${perimM.toFixed(1)} m`;
  }
  return `${perimPct.toFixed(2)}%`;
}
