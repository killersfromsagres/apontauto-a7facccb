import { describe, expect, it } from "vitest";

import type { Row, WidgetSpec } from "@/features/bi/catalog";
import { applyFilters, buildSeries, distinctValues, DEFAULT_FILTERS } from "@/features/bi/data";

const rows: Row[] = [
  {
    id: "1",
    equipe: "Elétrica",
    status: "aberta",
    predio: "A",
    horas_execucao: 4,
    created_at: "2026-07-01T10:00:00Z",
  },
  {
    id: "2",
    equipe: "Elétrica",
    status: "concluida",
    predio: "A",
    horas_execucao: 2,
    created_at: "2026-07-01T12:00:00Z",
  },
  {
    id: "3",
    equipe: "Civil",
    status: "aberta",
    predio: "B",
    horas_execucao: 6,
    created_at: "2026-07-02T09:00:00Z",
  },
] as unknown as Row[];

const widget = (over: Partial<WidgetSpec>): WidgetSpec =>
  ({
    id: "w",
    title: "Teste",
    chart: "bar",
    dataset: "work_orders",
    dimension: "equipe",
    aggregation: "count",
    size: "md",
    ...over,
  }) as WidgetSpec;

describe("indicadores de BI", () => {
  it("conta registros por dimensão, do maior para o menor", () => {
    const pts = buildSeries(widget({}), rows);
    expect(pts[0]).toEqual({ label: "Elétrica", value: 2 });
    expect(pts[1]).toEqual({ label: "Civil", value: 1 });
  });

  it("soma e calcula média de um campo numérico", () => {
    const soma = buildSeries(widget({ aggregation: "sum", field: "horas_execucao" }), rows);
    expect(soma.find((p) => p.label === "Elétrica")?.value).toBe(6);
    const media = buildSeries(widget({ aggregation: "avg", field: "horas_execucao" }), rows);
    expect(media.find((p) => p.label === "Elétrica")?.value).toBe(3);
  });

  it("agrupa por período (bucket diário) em ordem cronológica", () => {
    const pts = buildSeries(widget({ bucket: "day", dimension: undefined }), rows);
    expect(pts.map((p) => p.label)).toEqual(["2026-07-01", "2026-07-02"]);
    expect(pts[0].value).toBe(2);
  });

  it("pareto acumula até 100%", () => {
    const pts = buildSeries(widget({ chart: "pareto" }), rows);
    expect(pts[pts.length - 1].acumulado).toBeCloseTo(100, 1);
  });

  it("filtro global restringe as linhas do dataset", () => {
    const filtered = applyFilters("work_orders", rows, { ...DEFAULT_FILTERS, equipe: "civil" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("3");
  });

  it("valores distintos alimentam os seletores de filtro", () => {
    expect(distinctValues({ work_orders: rows }, "equipe")).toEqual(["Civil", "Elétrica"]);
  });

  it("dataset vazio não quebra o gráfico", () => {
    expect(buildSeries(widget({}), [])).toEqual([]);
  });
});
