import { describe, expect, it } from "vitest";

import {
  detectRain,
  effectiveTaludeStatus,
  hasAnyRainRisk,
  riskLevelForProbability,
  shouldAlertExternalActivities,
  situationStatus,
  type WeatherResponse,
} from "@/lib/weather/open-meteo";

const base = (over: Record<string, unknown> = {}) =>
  ({
    current: { weather_code: 0, rain: 0, ...(over.current as object) },
    hourly: { rain: Array(24).fill(0), ...(over.hourly as object) },
    daily: { rain_sum: [0], ...(over.daily as object) },
  }) as unknown as WeatherResponse;

describe("detecção de chuva", () => {
  it("sem dados não detecta chuva", () => {
    expect(detectRain(undefined).detected).toBe(false);
    expect(detectRain(null).intensity).toBeNull();
  });

  it("céu limpo não detecta chuva", () => {
    expect(detectRain(base()).detected).toBe(false);
  });

  it("garoa (código 51) é detectada mesmo sem milímetros", () => {
    const r = detectRain(base({ current: { weather_code: 51, rain: 0 } }));
    expect(r.detected).toBe(true);
    expect(r.intensity).toBe("garoa");
  });

  it("chuva forte é classificada pelo código", () => {
    const r = detectRain(base({ current: { weather_code: 65, rain: 12 } }));
    expect(r.detected).toBe(true);
    expect(r.intensity).toBe("forte");
  });

  it("tempestade tem prioridade máxima", () => {
    expect(detectRain(base({ current: { weather_code: 95, rain: 20 } })).intensity).toBe(
      "tempestade",
    );
  });
});

describe("regra de suspensão e retomada", () => {
  it("qualquer chuva suspende a operação de talude", () => {
    const s = effectiveTaludeStatus(5, { detected: true, intensity: "garoa", label: "Garoa" });
    expect(s.nivel).toBe("suspenso");
  });

  it("chuva forte também suspende, com cor de perigo", () => {
    const s = effectiveTaludeStatus(90, {
      detected: true,
      intensity: "forte",
      label: "Chuva forte",
    });
    expect(s.nivel).toBe("suspenso");
    expect(s.cor).toBe("red");
  });

  it("sem chuva retoma o status previsto pela probabilidade", () => {
    expect(effectiveTaludeStatus(5, { detected: false, intensity: null, label: "" }).nivel).toBe(
      "normal",
    );
    expect(effectiveTaludeStatus(95, null).nivel).toBe("reprogramar");
  });

  it("escalona a situação conforme a probabilidade", () => {
    expect(situationStatus(0).nivel).toBe("normal");
    expect(situationStatus(35).nivel).toBe("atencao");
    expect(situationStatus(75).nivel).toBe("alto");
    expect(situationStatus(95).nivel).toBe("reprogramar");
  });

  it("alertas de atividades externas respeitam os limiares", () => {
    expect(hasAnyRainRisk(10)).toBe(false);
    expect(hasAnyRainRisk(25)).toBe(true);
    expect(shouldAlertExternalActivities(50)).toBe(false);
    expect(shouldAlertExternalActivities(70)).toBe(true);
    expect(riskLevelForProbability(0)).toBe("safe");
    expect(riskLevelForProbability(100)).toBe("danger");
  });
});
