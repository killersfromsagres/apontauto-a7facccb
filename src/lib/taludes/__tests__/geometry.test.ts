import { describe, expect, it } from "vitest";

import {
  areaPx,
  formatArea,
  formatLength,
  hasSelfIntersection,
  metersPerPixel,
  perimeterPx,
  polygonAreaNorm,
  pointInPolygon,
  validatePolygon,
} from "@/lib/taludes/geometry";

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe("cálculos de área calibrada", () => {
  it("calcula a área normalizada de um quadrado", () => {
    expect(polygonAreaNorm(square)).toBeCloseTo(100, 5);
  });

  it("converte a escala com metros por pixel", () => {
    // Régua horizontal de 0% a 50% em imagem de 1000px = 500px para 100 m.
    const mpp = metersPerPixel(
      { a: { x: 0, y: 0 }, b: { x: 50, y: 0 }, meters: 100 },
      1000,
      1000,
    );
    expect(mpp).toBeCloseTo(0.2, 6);
  });

  it("área em metros quadrados = áreaPx × (m/px)²", () => {
    const mpp = metersPerPixel({ a: { x: 0, y: 0 }, b: { x: 50, y: 0 }, meters: 100 }, 1000, 1000);
    const px2 = areaPx(square, 1000, 1000); // 100px × 100px
    expect(px2).toBeCloseTo(10000, 3);
    expect(px2 * mpp * mpp).toBeCloseTo(400, 3);
  });

  it("perímetro acompanha a calibração", () => {
    expect(perimeterPx(square, 1000, 1000)).toBeCloseTo(400, 3);
  });

  it("calibração degenerada não divide por zero", () => {
    expect(metersPerPixel({ a: { x: 5, y: 5 }, b: { x: 5, y: 5 }, meters: 10 }, 1000, 1000)).toBe(0);
  });

  it("formata área e comprimento em pt-BR", () => {
    expect(formatArea(2500)).toContain("m²");
    expect(formatArea(25000)).toContain("ha");
    expect(formatLength(12.34)).toContain("m");
  });
});

describe("validação do polígono", () => {
  it("aceita polígono simples com 3+ vértices", () => {
    expect(validatePolygon(square).ok).toBe(true);
    expect(hasSelfIntersection(square)).toBe(false);
  });

  it("recusa polígono com menos de 3 vértices", () => {
    expect(validatePolygon([{ x: 0, y: 0 }, { x: 1, y: 1 }]).ok).toBe(false);
  });

  it("detecta auto-interseção (gravata)", () => {
    const bow = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(hasSelfIntersection(bow)).toBe(true);
    expect(validatePolygon(bow).ok).toBe(false);
  });

  it("testa ponto dentro e fora", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 50, y: 5 }, square)).toBe(false);
  });
});
