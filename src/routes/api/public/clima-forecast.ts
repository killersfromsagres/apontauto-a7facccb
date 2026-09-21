// Fonte primária de clima — MET Norway (api.met.no / Locationforecast 2.0 complete).
// Fallback automático: Open-Meteo. O payload segue o contrato WeatherResponse.
import { createFileRoute } from "@tanstack/react-router";

const DEFAULT_LAT = -23.7246;
const DEFAULT_LON = -46.5648;
const USER_AGENT = "apontauto.lovable.app clima-integracao/1.1 (github.com/lovable)";
const CACHE_CONTROL = "public, max-age=300, s-maxage=300, stale-while-revalidate=900";

function symbolToWmo(symbol: string | undefined | null): number {
  if (!symbol) return 3;
  const s = symbol.replace(/_(day|night|polartwilight)$/, "");
  const map: Record<string, number> = {
    clearsky: 0,
    fair: 1,
    partlycloudy: 2,
    cloudy: 3,
    fog: 45,
    lightrainshowers: 80,
    rainshowers: 81,
    heavyrainshowers: 82,
    lightrainshowersandthunder: 95,
    rainshowersandthunder: 95,
    heavyrainshowersandthunder: 96,
    lightrain: 61,
    rain: 63,
    heavyrain: 65,
    lightrainandthunder: 95,
    rainandthunder: 95,
    heavyrainandthunder: 99,
    lightsleet: 66,
    sleet: 66,
    heavysleet: 67,
    lightsleetshowers: 66,
    sleetshowers: 66,
    heavysleetshowers: 67,
    lightsleetshowersandthunder: 95,
    sleetshowersandthunder: 95,
    heavysleetshowersandthunder: 96,
    lightsleetandthunder: 95,
    sleetandthunder: 95,
    heavysleetandthunder: 96,
    lightsnow: 71,
    snow: 73,
    heavysnow: 75,
    lightsnowshowers: 85,
    snowshowers: 85,
    heavysnowshowers: 86,
    lightsnowandthunder: 95,
    snowandthunder: 95,
    heavysnowandthunder: 96,
    lightsnowshowersandthunder: 95,
    snowshowersandthunder: 95,
    heavysnowshowersandthunder: 96,
  };
  return map[s] ?? 3;
}

type MetTimeseries = {
  time: string;
  data: {
    instant?: { details?: Record<string, number> };
    next_1_hours?: { summary?: { symbol_code?: string }; details?: Record<string, number> };
    next_6_hours?: { summary?: { symbol_code?: string }; details?: Record<string, number> };
  };
};

async function fromMetNorway(lat: number, lon: number, signal: AbortSignal) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
  const r = await fetch(url, {
    signal,
    headers: { "User-Agent": USER_AGENT, accept: "application/json" },
  });
  if (!r.ok) throw new Error(`met.no ${r.status}`);
  const j = (await r.json()) as { properties: { timeseries: MetTimeseries[] } };
  const ts = j.properties.timeseries;
  if (!ts?.length) throw new Error("met.no vazio");

  const now = ts[0];
  const nowInst = now.data.instant?.details ?? {};
  const nowNext = now.data.next_1_hours?.details ?? {};
  const nowSym =
    now.data.next_1_hours?.summary?.symbol_code ?? now.data.next_6_hours?.summary?.symbol_code;

  const hourly = ts.slice(0, 48);
  const toLocal = (isoUtc: string) => {
    const d = new Date(isoUtc);
    const local = new Date(d.getTime() - 3 * 3600_000);
    return local.toISOString().slice(0, 16);
  };

  const hourlyRain = hourly.map((h) => h.data.next_1_hours?.details?.precipitation_amount ?? 0);
  const hourlyOut = {
    time: hourly.map((h) => toLocal(h.time)),
    temperature_2m: hourly.map((h) => h.data.instant?.details?.air_temperature ?? 0),
    apparent_temperature: hourly.map((h) => h.data.instant?.details?.air_temperature ?? 0),
    precipitation_probability: hourly.map(
      (h) => h.data.next_1_hours?.details?.probability_of_precipitation ?? 0,
    ),
    precipitation: hourlyRain,
    rain: hourlyRain,
    weather_code: hourly.map((h) => symbolToWmo(h.data.next_1_hours?.summary?.symbol_code)),
    cloud_cover: hourly.map((h) => h.data.instant?.details?.cloud_area_fraction ?? 0),
    wind_speed_10m: hourly.map((h) => (h.data.instant?.details?.wind_speed ?? 0) * 3.6),
  };

  const byDay = new Map<string, MetTimeseries[]>();
  for (const t of ts) {
    const day = toLocal(t.time).slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(t);
  }
  const days = Array.from(byDay.entries()).slice(0, 7);
  const dailyRain = days.map(([, xs]) =>
    xs.reduce((sum, x) => sum + (x.data.next_1_hours?.details?.precipitation_amount ?? 0), 0),
  );
  const dailyOut = {
    time: days.map(([d]) => d),
    weather_code: days.map(([, xs]) =>
      symbolToWmo(
        xs[0]?.data.next_6_hours?.summary?.symbol_code ??
          xs[0]?.data.next_1_hours?.summary?.symbol_code,
      ),
    ),
    temperature_2m_max: days.map(([, xs]) =>
      Math.max(...xs.map((x) => x.data.instant?.details?.air_temperature ?? -99)),
    ),
    temperature_2m_min: days.map(([, xs]) =>
      Math.min(...xs.map((x) => x.data.instant?.details?.air_temperature ?? 99)),
    ),
    apparent_temperature_max: days.map(([, xs]) =>
      Math.max(...xs.map((x) => x.data.instant?.details?.air_temperature ?? -99)),
    ),
    apparent_temperature_min: days.map(([, xs]) =>
      Math.min(...xs.map((x) => x.data.instant?.details?.air_temperature ?? 99)),
    ),
    precipitation_probability_max: days.map(([, xs]) =>
      Math.max(0, ...xs.map((x) => x.data.next_1_hours?.details?.probability_of_precipitation ?? 0)),
    ),
    precipitation_sum: dailyRain,
    rain_sum: dailyRain,
    wind_speed_10m_max: days.map(([, xs]) =>
      Math.max(0, ...xs.map((x) => (x.data.instant?.details?.wind_speed ?? 0) * 3.6)),
    ),
  };

  const hourNow = new Date().getUTCHours();
  const isDay = hourNow >= 9 && hourNow < 21 ? 1 : 0;
  const currentRain = nowNext.precipitation_amount ?? 0;

  return {
    current: {
      temperature_2m: nowInst.air_temperature ?? 0,
      apparent_temperature: nowInst.air_temperature ?? 0,
      relative_humidity_2m: nowInst.relative_humidity ?? 0,
      weather_code: symbolToWmo(nowSym),
      cloud_cover: nowInst.cloud_area_fraction ?? 0,
      wind_speed_10m: (nowInst.wind_speed ?? 0) * 3.6,
      wind_gusts_10m: (nowInst.wind_speed_of_gust ?? nowInst.wind_speed ?? 0) * 3.6,
      rain: currentRain,
      precipitation: currentRain,
      is_day: isDay,
    },
    hourly: hourlyOut,
    daily: dailyOut,
    fetched_at: new Date().toISOString(),
    source: "met.no" as const,
  };
}

async function fromOpenMeteo(lat: number, lon: number, signal: AbortSignal) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,precipitation,rain,is_day" +
    "&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,rain,weather_code,cloud_cover,wind_speed_10m" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,rain_sum,wind_speed_10m_max" +
    "&forecast_days=7&timezone=America%2FSao_Paulo&utm_source=apontauto.lovable.app";
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  const j = await r.json();
  return { ...j, fetched_at: new Date().toISOString(), source: "open-meteo" as const };
}

function num(v: string | null, fallback: number): number {
  const parsed = v == null ? Number.NaN : Number(v);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function withWeatherTimeout<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await loader(controller.signal);
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new Error(`timeout após ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/public/clima-forecast")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lat = num(url.searchParams.get("lat"), DEFAULT_LAT);
        const lon = num(url.searchParams.get("lon"), DEFAULT_LON);
        const errors: string[] = [];

        try {
          const data = await withWeatherTimeout(
            (signal) => fromMetNorway(lat, lon, signal),
            6500,
          );
          return Response.json(data, {
            headers: { "Cache-Control": CACHE_CONTROL, "Access-Control-Allow-Origin": "*" },
          });
        } catch (error) {
          errors.push(`met.no: ${(error as Error).message}`);
        }

        const tryOpenMeteo = async (retryCount = 0): Promise<Response | null> => {
          try {
            const data = await withWeatherTimeout(
              (signal) => fromOpenMeteo(lat, lon, signal),
              6500,
            );
            return Response.json(data, {
              headers: {
                "Cache-Control": CACHE_CONTROL,
                "Access-Control-Allow-Origin": "*",
                "X-Weather-Fallback": "open-meteo",
              },
            });
          } catch (error) {
            const message = (error as Error).message;
            if (message.includes("429") && retryCount < 1) {
              await new Promise((resolve) => setTimeout(resolve, 750));
              return tryOpenMeteo(retryCount + 1);
            }
            errors.push(`open-meteo: ${message}`);
            return null;
          }
        };

        const fallback = await tryOpenMeteo();
        if (fallback) return fallback;

        return Response.json(
          { error: "all_sources_failed", details: errors },
          { status: 502, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } },
        );
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
          },
        }),
    },
  },
});