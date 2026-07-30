import type { Point } from "./api";

/** Área do polígono em unidades normalizadas (%²), via fórmula do shoelace. */
export function polygonAreaNorm(pts: Point[]): number {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function polygonPerimeterNorm(pts: Point[]): number {
  if (pts.length < 2) return 0;
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    p += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return p;
}

export function centroid(pts: Point[]): Point {
  const n = pts.length || 1;
  return {
    x: pts.reduce((a, p) => a + p.x, 0) / n,
    y: pts.reduce((a, p) => a + p.y, 0) / n,
  };
}

/** Distância normalizada corrigida pelo aspecto da imagem (px reais). */
export function segmentLengthPx(a: Point, b: Point, w: number, h: number): number {
  return Math.hypot(((b.x - a.x) / 100) * w, ((b.y - a.y) / 100) * h);
}

export function perimeterPx(pts: Point[], w: number, h: number): number {
  let p = 0;
  for (let i = 0; i < pts.length; i++) {
    p += segmentLengthPx(pts[i], pts[(i + 1) % pts.length], w, h);
  }
  return p;
}

export function areaPx(pts: Point[], w: number, h: number): number {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const ax = (a.x / 100) * w;
    const ay = (a.y / 100) * h;
    const bx = (b.x / 100) * w;
    const by = (b.y / 100) * h;
    s += ax * by - bx * ay;
  }
  return Math.abs(s) / 2;
}

function segIntersects(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Detecta auto-interseção (polígono "amarrado"). */
export function hasSelfIntersection(pts: Point[]): boolean {
  const n = pts.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // ignora arestas adjacentes
      if (j === i || (i === 0 && j === n - 1) || j === i + 1) continue;
      if (segIntersects(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

export function pointInPolygon(pt: Point, pts: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    const hit =
      yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/** Índice da aresta mais próxima e ponto projetado. */
export function nearestEdge(
  pt: Point,
  pts: Point[],
): { index: number; point: Point; dist: number } | null {
  if (pts.length < 2) return null;
  let best: { index: number; point: Point; dist: number } | null = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len2 = vx * vx + vy * vy || 1e-9;
    let t = ((pt.x - a.x) * vx + (pt.y - a.y) * vy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * vx;
    const py = a.y + t * vy;
    const dist = Math.hypot(pt.x - px, pt.y - py);
    if (!best || dist < best.dist) best = { index: i, point: { x: px, y: py }, dist };
  }
  return best;
}

export function validatePolygon(pts: Point[]): { ok: boolean; message?: string } {
  if (pts.length < 3) return { ok: false, message: "O polígono precisa de pelo menos 3 pontos." };
  if (polygonAreaNorm(pts) < 0.002)
    return { ok: false, message: "Área muito pequena — o polígono é inválido." };
  if (hasSelfIntersection(pts))
    return { ok: false, message: "O contorno cruza a si mesmo (auto-interseção)." };
  return { ok: true };
}

export function clampPoint(p: Point): Point {
  return { x: Math.max(0, Math.min(100, p.x)), y: Math.max(0, Math.min(100, p.y)) };
}

export function snapToGrid(p: Point, step: number): Point {
  return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
}

export interface Calibration {
  a: Point;
  b: Point;
  meters: number;
}

/** metros por pixel da imagem original. */
export function metersPerPixel(cal: Calibration, w: number, h: number): number {
  const px = segmentLengthPx(cal.a, cal.b, w, h);
  if (px <= 0) return 0;
  return cal.meters / px;
}

export function formatArea(m2: number): string {
  if (m2 >= 10000)
    return `${(m2 / 10000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha`;
  return `${m2.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m²`;
}

export function formatLength(m: number): string {
  return `${m.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m`;
}
