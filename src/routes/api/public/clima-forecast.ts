// Monitoramento meteorológico multifonte para Taludes — São Bernardo do Campo/SP.
// A condição atual cruza observação METAR, condição agregada local e modelos.
// A previsão horária/diária continua vindo de Open-Meteo, com MET Norway como fallback.
import { createFileRoute } from "@tanstack/react-router";

const DEFAULT_LAT = -23.7246;
const DEFAULT_LON = -46.5648;
const USER_AGENT = "apontauto.lovable.app clima-integracao/2.0";
const CACHE_CONTROL = "no-store, max-age=0";
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

function num(v: string | null, fallback: number): number {
  const parsed = v == null ? Number.NaN : Number(v);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function symbolToWmo(symbol: string | undefined | null): number {
  if (!symbol) return 3;
  const s = symbol.replace(/_(day|night|polartwilight)$/, "");
  const map: Record<string, number> = {
    clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45,
    lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82,
    lightrainshowersandthunder: 95, rainshowersandthunder: 95, heavyrainshowersandthunder: 96,
    lightrain: 61, rain: 63, heavyrain: 65,
    lightrainandthunder: 95, rainandthunder: 95, heavyrainandthunder: 99,
    lightsleet: 66, sleet: 66, heavysleet: 67,
    lightsnow: 71, snow: 73, heavysnow: 75,
    lightsnowshowers: 85, snowshowers: 85, heavysnowshowers: 86,
  };
  return map[s] ?? 3;
}

function descriptionToWmo(description: string): number {
  const d = description.toLowerCase();
  if (/thunder|storm/.test(d)) return 95;
  if (/heavy rain|torrential/.test(d)) return 65;
  if (/drizzle/.test(d)) return 51;
  if (/rain|shower/.test(d)) return 61;
  if (/fog|mist/.test(d)) return 45;
  if (/clear|sunny/.test(d)) return 0;
  if (/partly/.test(d)) return 2;
  return 3;
}

function isRainDescription(description: string): boolean {
  return /rain|drizzle|shower|thunder|storm/i.test(description);
}

function metarHasRain(raw: string): boolean {
  return /(^|\s)(\+|-)?(RA|DZ|SHRA|TSRA|TS)(\s|$)/i.test(raw);
}

function humidityFromDewPoint(tempC: number, dewPointC: number): number {
  const a = 17.625;
  const b = 243.04;
  const rh = 100 * Math.exp((a * dewPointC) / (b + dewPointC) - (a * tempC) / (b + tempC));
  return Math.max(0, Math.min(100, rh));
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
  const r = await fetch(url, { signal, headers: { "User-Agent": USER_AGENT, accept: "application/json" }, cache: "no-store" });
  if (!r.ok) throw new Error(`met.no ${r.status}`);
  const j = (await r.json()) as { properties: { timeseries: MetTimeseries[] } };
  const ts = j.properties.timeseries;
  if (!ts?.length) throw new Error("met.no vazio");
  const now = ts[0];
  const inst = now.data.instant?.details ?? {};
  const next = now.data.next_1_hours?.details ?? {};
  const sym = now.data.next_1_hours?.summary?.symbol_code ?? now.data.next_6_hours?.summary?.symbol_code;
  const hourly = ts.slice(0, 48);
  const toLocal = (isoUtc: string) => new Date(new Date(isoUtc).getTime() - 3 * 3600_000).toISOString().slice(0, 16);
  const hourlyRain = hourly.map((h) => h.data.next_1_hours?.details?.precipitation_amount ?? 0);
  const hourlyOut = {
    time: hourly.map((h) => toLocal(h.time)),
    temperature_2m: hourly.map((h) => h.data.instant?.details?.air_temperature ?? 0),
    apparent_temperature: hourly.map((h) => h.data.instant?.details?.air_temperature ?? 0),
    precipitation_probability: hourly.map((h) => h.data.next_1_hours?.details?.probability_of_precipitation ?? 0),
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
  const dailyRain = days.map(([, xs]) => xs.reduce((sum, x) => sum + (x.data.next_1_hours?.details?.precipitation_amount ?? 0), 0));
  return {
    current: {
      temperature_2m: inst.air_temperature ?? 0,
      apparent_temperature: inst.air_temperature ?? 0,
      relative_humidity_2m: inst.relative_humidity ?? 0,
      weather_code: symbolToWmo(sym),
      cloud_cover: inst.cloud_area_fraction ?? 0,
      wind_speed_10m: (inst.wind_speed ?? 0) * 3.6,
      wind_gusts_10m: (inst.wind_speed_of_gust ?? inst.wind_speed ?? 0) * 3.6,
      rain: next.precipitation_amount ?? 0,
      precipitation: next.precipitation_amount ?? 0,
      is_day: new Date().getUTCHours() >= 9 && new Date().getUTCHours() < 21 ? 1 : 0,
    },
    hourly: hourlyOut,
    daily: {
      time: days.map(([d]) => d),
      weather_code: days.map(([, xs]) => symbolToWmo(xs[0]?.data.next_6_hours?.summary?.symbol_code ?? xs[0]?.data.next_1_hours?.summary?.symbol_code)),
      temperature_2m_max: days.map(([, xs]) => Math.max(...xs.map((x) => x.data.instant?.details?.air_temperature ?? -99))),
      temperature_2m_min: days.map(([, xs]) => Math.min(...xs.map((x) => x.data.instant?.details?.air_temperature ?? 99))),
      apparent_temperature_max: days.map(([, xs]) => Math.max(...xs.map((x) => x.data.instant?.details?.air_temperature ?? -99))),
      apparent_temperature_min: days.map(([, xs]) => Math.min(...xs.map((x) => x.data.instant?.details?.air_temperature ?? 99))),
      precipitation_probability_max: days.map(([, xs]) => Math.max(0, ...xs.map((x) => x.data.next_1_hours?.details?.probability_of_precipitation ?? 0))),
      precipitation_sum: dailyRain,
      rain_sum: dailyRain,
      wind_speed_10m_max: days.map(([, xs]) => Math.max(0, ...xs.map((x) => (x.data.instant?.details?.wind_speed ?? 0) * 3.6))),
    },
    fetched_at: new Date().toISOString(),
    source: "met.no" as const,
  };
}

async function fromOpenMeteo(lat: number, lon: number, signal: AbortSignal) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,precipitation,rain,is_day" +
    "&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,rain,weather_code,cloud_cover,wind_speed_10m" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,rain_sum,wind_speed_10m_max" +
    "&forecast_days=7&timezone=America%2FSao_Paulo&utm_source=apontauto.lovable.app";
  const r = await fetch(url, { signal, cache: "no-store" });
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  const j = await r.json();
  return { ...j, fetched_at: new Date().toISOString(), source: "open-meteo" as const };
}

async function fromWttr(lat: number, lon: number, signal: AbortSignal) {
  const r = await fetch(`https://wttr.in/${lat.toFixed(4)},${lon.toFixed(4)}?format=j1`, {
    signal,
    cache: "no-store",
    headers: { "User-Agent": USER_AGENT, accept: "application/json" },
  });
  if (!r.ok) throw new Error(`weather aggregate ${r.status}`);
  const j = await r.json() as { current_condition?: Array<Record<string, unknown>> };
  const row = j.current_condition?.[0];
  if (!row) throw new Error("weather aggregate vazio");
  const description = String((row.weatherDesc as Array<{ value?: string }> | undefined)?.[0]?.value ?? "");
  return {
    temperature: finite(row.temp_C),
    apparent: finite(row.FeelsLikeC),
    humidity: finite(row.humidity),
    wind: finite(row.windspeedKmph),
    precipitation: finite(row.precipMM) ?? 0,
    description,
    weatherCode: descriptionToWmo(description),
    raining: isRainDescription(description) || (finite(row.precipMM) ?? 0) > 0,
  };
}

async function fromMetar(signal: AbortSignal) {
  const r = await fetch("https://aviationweather.gov/api/data/metar?ids=SBSP&format=json&taf=false", {
    signal,
    cache: "no-store",
    headers: { "User-Agent": USER_AGENT, accept: "application/json" },
  });
  if (!r.ok) throw new Error(`METAR ${r.status}`);
  const rows = await r.json() as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) throw new Error("METAR vazio");
  const reportTime = String(row.reportTime ?? "");
  const reportMs = new Date(reportTime).getTime();
  if (!Number.isFinite(reportMs) || Date.now() - reportMs > 2 * 60 * 60_000) throw new Error("METAR desatualizado");
  const temp = finite(row.temp);
  const dew = finite(row.dewp);
  const raw = String(row.rawOb ?? "");
  return {
    temperature: temp,
    humidity: temp != null && dew != null ? humidityFromDewPoint(temp, dew) : null,
    wind: finite(row.wspd) != null ? Number(row.wspd) * 1.852 : null,
    raining: metarHasRain(raw),
    weatherCode: metarHasRain(raw) ? 61 : null,
    reportTime,
    station: "SBSP · Congonhas",
    distanceKm: 13.8,
  };
}

async function withWeatherTimeout<T>(loader: (signal: AbortSignal) => Promise<T>, timeoutMs = 6000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await loader(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function fuseCurrent(base: any, wttr?: Awaited<ReturnType<typeof fromWttr>>, metar?: Awaited<ReturnType<typeof fromMetar>>) {
  const model = base.current;
  let temperature = finite(model.temperature_2m) ?? 0;
  if (metar?.temperature != null && wttr?.temperature != null) temperature = metar.temperature * 0.65 + wttr.temperature * 0.35;
  else if (metar?.temperature != null) temperature = metar.temperature;
  else if (wttr?.temperature != null) temperature = wttr.temperature;

  const observedRain = Boolean(wttr?.raining || metar?.raining);
  const modelRain = (finite(model.precipitation) ?? 0) > 0 || (finite(model.rain) ?? 0) > 0 || RAIN_CODES.has(Number(model.weather_code));
  const weatherCode = wttr?.raining ? wttr.weatherCode : metar?.raining ? (metar.weatherCode ?? 61) : Number(model.weather_code ?? 3);

  return {
    ...model,
    temperature_2m: Math.round(temperature * 10) / 10,
    apparent_temperature: wttr?.apparent ?? model.apparent_temperature ?? temperature,
    relative_humidity_2m: wttr?.humidity ?? metar?.humidity ?? model.relative_humidity_2m ?? 0,
    weather_code: weatherCode,
    wind_speed_10m: metar?.wind ?? wttr?.wind ?? model.wind_speed_10m ?? 0,
    rain: Math.max(finite(model.rain) ?? 0, wttr?.precipitation ?? 0),
    precipitation: Math.max(finite(model.precipitation) ?? 0, wttr?.precipitation ?? 0),
    rain_evidence: observedRain || modelRain,
  };
}

export const Route = createFileRoute("/api/public/clima-forecast")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lat = num(url.searchParams.get("lat"), DEFAULT_LAT);
        const lon = num(url.searchParams.get("lon"), DEFAULT_LON);

        const [openResult, metResult, wttrResult, metarResult] = await Promise.allSettled([
          withWeatherTimeout((signal) => fromOpenMeteo(lat, lon, signal)),
          withWeatherTimeout((signal) => fromMetNorway(lat, lon, signal)),
          withWeatherTimeout((signal) => fromWttr(lat, lon, signal), 5000),
          withWeatherTimeout((signal) => fromMetar(signal), 5000),
        ]);

        const base = openResult.status === "fulfilled"
          ? openResult.value
          : metResult.status === "fulfilled"
            ? metResult.value
            : null;

        if (!base) {
          return Response.json(
            { error: "all_sources_failed", details: [openResult, metResult].map((r) => r.status === "rejected" ? String(r.reason) : "") },
            { status: 502, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } },
          );
        }

        const wttr = wttrResult.status === "fulfilled" ? wttrResult.value : undefined;
        const metar = metarResult.status === "fulfilled" ? metarResult.value : undefined;
        const current = fuseCurrent(base, wttr, metar);

        return Response.json(
          {
            ...base,
            current,
            fetched_at: new Date().toISOString(),
            source: "observed-consensus",
            observation_meta: {
              method: "consenso_multifonte",
              current_sources: [
                wttr ? "São Bernardo · condição atual agregada" : null,
                metar ? `${metar.station} · observação física ~${metar.distanceKm} km` : null,
                openResult.status === "fulfilled" ? "Open-Meteo · modelo local" : null,
                metResult.status === "fulfilled" ? "MET Norway · modelo de apoio" : null,
              ].filter(Boolean),
              metar_report_time: metar?.reportTime ?? null,
              rain_evidence: Boolean(current.rain_evidence),
            },
          },
          { headers: { "Cache-Control": CACHE_CONTROL, Pragma: "no-cache", "Access-Control-Allow-Origin": "*" } },
        );
      },
      OPTIONS: async () => new Response(null, {
        status: 204,
        headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" },
      }),
    },
  },
});
