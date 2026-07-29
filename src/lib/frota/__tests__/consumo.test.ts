import { describe, expect, it } from "vitest";

import { computeConsumption } from "@/lib/frota/api";

type F = Parameters<typeof computeConsumption>[0][number];

const fueling = (over: Partial<F>): F =>
  ({
    id: crypto.randomUUID(),
    vehicle_id: "v1",
    fueled_at: "2026-01-01T10:00:00Z",
    odometer_km: 1000,
    liters: 40,
    price_per_liter: 6,
    total_value: 240,
    full_tank: true,
    ...over,
  }) as F;

describe("consumo e custo por km", () => {
  it("calcula km/l e custo por km entre tanques cheios", () => {
    const rows = computeConsumption([
      fueling({ fueled_at: "2026-01-01T10:00:00Z", odometer_km: 1000, liters: 30, total_value: 180 }),
      fueling({ fueled_at: "2026-01-10T10:00:00Z", odometer_km: 1400, liters: 40, total_value: 240 }),
    ]);
    const v = rows.get("v1")!;
    expect(v.km).toBe(400);
    expect(v.liters).toBe(70);
    expect(v.cost).toBe(420);
    expect(v.kmPerLiter).toBeCloseTo(10, 5);
    expect(v.costPerKm).toBeCloseTo(420 / 400, 5);
  });

  it("ignora leituras de odômetro inconsistentes", () => {
    const rows = computeConsumption([
      fueling({ odometer_km: 5000, fueled_at: "2026-01-01T10:00:00Z" }),
      fueling({ odometer_km: 4000, fueled_at: "2026-01-05T10:00:00Z" }),
      fueling({ odometer_km: 99000, fueled_at: "2026-01-09T10:00:00Z" }),
    ]);
    const v = rows.get("v1")!;
    expect(v.km).toBe(0);
    expect(v.kmPerLiter).toBeNull();
    expect(v.costPerKm).toBeNull();
  });

  it("não mistura veículos diferentes", () => {
    const rows = computeConsumption([
      fueling({ vehicle_id: "a", odometer_km: 100, fueled_at: "2026-01-01T10:00:00Z" }),
      fueling({ vehicle_id: "a", odometer_km: 300, fueled_at: "2026-01-02T10:00:00Z" }),
      fueling({ vehicle_id: "b", odometer_km: 900, fueled_at: "2026-01-03T10:00:00Z" }),
    ]);
    expect(rows.get("a")!.km).toBe(200);
    expect(rows.get("b")!.km).toBe(0);
    expect(rows.size).toBe(2);
  });

  it("abastecimento parcial não conta como intervalo medido", () => {
    const rows = computeConsumption([
      fueling({ odometer_km: 100, fueled_at: "2026-01-01T10:00:00Z" }),
      fueling({ odometer_km: 300, fueled_at: "2026-01-02T10:00:00Z", full_tank: false }),
    ]);
    expect(rows.get("v1")!.km).toBe(0);
  });
});
