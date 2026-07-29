import { describe, expect, it } from "vitest";

import { aggregateByDay, aggregateByHour, type WeatherObservation } from "@/lib/weather/history";

const obs = (over: Partial<WeatherObservation>): WeatherObservation =>
  ({
    id: crypto.randomUUID(),
    source: "open_meteo",
    source_station_id: null,
    data_type: "previsao",
    observed_at: "2026-07-29T10:00:00",
    distance_km: null,
    precipitation_mm: 0,
    rain_rate_mm_h: null,
    precipitation_probability: null,
    weather_code: 0,
    confidence: 0.8,
    ...over,
  }) as WeatherObservation;

describe("agrupamento de evento de chuva", () => {
  it("soma a precipitação por dia e marca o dia chuvoso", () => {
    const days = aggregateByDay([
      obs({ observed_at: "2026-07-29T08:00:00", precipitation_mm: 2, weather_code: 63 }),
      obs({ observed_at: "2026-07-29T14:00:00", precipitation_mm: 3, weather_code: 63 }),
      obs({ observed_at: "2026-07-30T09:00:00", precipitation_mm: 0, weather_code: 0 }),
    ]);
    expect(days).toHaveLength(2);
    expect(days[0].mm).toBeCloseTo(5, 5);
    expect(days[0].rainy).toBe(true);
    expect(days[1].rainy).toBe(false);
  });

  it("mantém a maior intensidade observada no dia", () => {
    const [day] = aggregateByDay([
      obs({ observed_at: "2026-07-29T08:00:00", precipitation_mm: 0.2, weather_code: 51 }),
      obs({ observed_at: "2026-07-29T09:00:00", precipitation_mm: 15, weather_code: 65 }),
    ]);
    expect(day.maxIntensity).toBe("forte");
  });

  it("consolida as fontes sem duplicar e ordena por data", () => {
    const days = aggregateByDay([
      obs({ observed_at: "2026-07-30T08:00:00", source: "open_meteo" }),
      obs({ observed_at: "2026-07-29T08:00:00", source: "open_meteo" }),
      obs({ observed_at: "2026-07-29T09:00:00", source: "met_norway" }),
    ]);
    expect(days.map((d) => d.date)).toEqual(["2026-07-29", "2026-07-30"]);
    expect(days[0].sources.sort()).toEqual(["met_norway", "open_meteo"]);
  });

  it("agrupa por hora comparando previsto e observado", () => {
    const hours = aggregateByHour([
      obs({ observed_at: "2026-07-29T10:00:00", precipitation_mm: 4 }),
      obs({ observed_at: "2026-07-29T10:30:00", precipitation_mm: 1 }),
    ]);
    expect(hours).toHaveLength(1);
    expect(hours[0].mm).toBeCloseTo(4, 5);
  });
});
