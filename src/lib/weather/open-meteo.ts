// Cliente Open-Meteo — API pública, sem chave.
// Localização fixa: São Bernardo do Campo — SP (bairro Demarchi).

export const WEATHER_LOCATION = {
  cidade: "São Bernardo do Campo",
  estado: "SP",
  bairro: "Demarchi",
  latitude: -23.7246,
  longitude: -46.5648,
  timezone: "America/Sao_Paulo",
};

// Fonte primária: MET Norway (via server route) com fallback automático para Open-Meteo.
const PRIMARY_ENDPOINT = `/api/public/clima-forecast?lat=${WEATHER_LOCATION.latitude}&lon=${WEATHER_LOCATION.longitude}`;
const FALLBACK_ENDPOINT =
  "https://api.open-meteo.com/v1/forecast" +
  `?latitude=${WEATHER_LOCATION.latitude}` +
  `&longitude=${WEATHER_LOCATION.longitude}` +
  `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,precipitation,rain,is_day` +
  `&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,rain,weather_code,cloud_cover,wind_speed_10m` +
  `&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,rain_sum,wind_speed_10m_max` +
  "&forecast_days=7" +
  `&timezone=${encodeURIComponent(WEATHER_LOCATION.timezone)}` +
  "&utm_source=apontauto.lovable.app";

export type WeatherCurrent = {
  temperature_2m: number;
  apparent_temperature: number;
  relative_humidity_2m: number;
  weather_code: number;
  cloud_cover: number;
  wind_speed_10m: number;
  wind_gusts_10m: number;
  rain: number;
  precipitation: number;
  is_day: number;
};

export type WeatherHourly = {
  time: string[];
  temperature_2m: number[];
  apparent_temperature: number[];
  precipitation_probability: number[];
  precipitation: number[];
  rain: number[];
  weather_code: number[];
  cloud_cover: number[];
  wind_speed_10m: number[];
};

export type WeatherDaily = {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  apparent_temperature_max: number[];
  apparent_temperature_min: number[];
  precipitation_probability_max: number[];
  precipitation_sum: number[];
  rain_sum: number[];
  wind_speed_10m_max: number[];
};

export type WeatherSource = "met.no" | "open-meteo";

export type WeatherResponse = {
  current: WeatherCurrent;
  hourly: WeatherHourly;
  daily: WeatherDaily;
  fetched_at: string;
  source?: WeatherSource;
};

/**
 * Localiza o timestep horário correspondente ao momento atual.
 * A série pode iniciar à meia-noite (Open-Meteo) ou na hora atual (MET Norway).
 */
export function currentHourIndex(times: string[] | undefined | null): number {
  if (!times?.length) return -1;
  const now = Date.now();
  let best = -1;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let index = 0; index < times.length; index += 1) {
    const timestamp = new Date(times[index]).getTime();
    if (!Number.isFinite(timestamp)) continue;
    // Não considera um timestep claramente futuro como a "hora atual".
    if (timestamp > now + 30 * 60_000) break;
    const delta = Math.abs(now - timestamp);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = index;
    }
  }
  return best;
}

async function fetchFrom(endpoint: string, signal?: AbortSignal): Promise<WeatherResponse> {
  const res = await fetch(endpoint, { signal, cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${endpoint.startsWith("/") ? "clima-forecast" : "open-meteo"} respondeu ${res.status}${body ? ` — ${body.slice(0, 120)}` : ""}`,
    );
  }
  const json = (await res.json()) as Omit<WeatherResponse, "fetched_at"> & { fetched_at?: string };
  if (!json?.current || !json?.hourly?.temperature_2m) {
    throw new Error("Resposta de clima inválida (campos ausentes).");
  }
  return { ...json, fetched_at: json.fetched_at ?? new Date().toISOString() };
}

export async function fetchWeather(signal?: AbortSignal): Promise<WeatherResponse> {
  try {
    return await fetchFrom(PRIMARY_ENDPOINT, signal);
  } catch (primaryErr) {
    try {
      const fallback = await fetchFrom(FALLBACK_ENDPOINT, signal);
      return { ...fallback, source: "open-meteo" };
    } catch (fallbackErr) {
      throw new Error(
        `Falha em todas as fontes de clima. Primária: ${(primaryErr as Error).message}. Fallback: ${(fallbackErr as Error).message}`,
      );
    }
  }
}

export type WeatherCodeInfo = {
  emoji: string;
  label: string;
  bucket: "sol" | "nublado" | "neblina" | "garoa" | "chuva" | "neve" | "tempestade";
};

const WEATHER_CODES: Record<number, WeatherCodeInfo> = {
  0: { emoji: "☀", label: "Céu limpo", bucket: "sol" },
  1: { emoji: "🌤", label: "Predominantemente limpo", bucket: "sol" },
  2: { emoji: "⛅", label: "Parcialmente nublado", bucket: "nublado" },
  3: { emoji: "☁", label: "Nublado", bucket: "nublado" },
  45: { emoji: "🌫", label: "Neblina", bucket: "neblina" },
  48: { emoji: "🌫", label: "Neblina intensa", bucket: "neblina" },
  51: { emoji: "🌦", label: "Garoa fraca", bucket: "garoa" },
  53: { emoji: "🌦", label: "Garoa moderada", bucket: "garoa" },
  55: { emoji: "🌧", label: "Garoa intensa", bucket: "garoa" },
  56: { emoji: "🌧", label: "Garoa congelante fraca", bucket: "garoa" },
  57: { emoji: "🌧", label: "Garoa congelante intensa", bucket: "garoa" },
  61: { emoji: "🌧", label: "Chuva fraca", bucket: "chuva" },
  63: { emoji: "🌧", label: "Chuva moderada", bucket: "chuva" },
  65: { emoji: "🌧", label: "Chuva forte", bucket: "chuva" },
  66: { emoji: "🌧", label: "Chuva congelante fraca", bucket: "chuva" },
  67: { emoji: "🌧", label: "Chuva congelante forte", bucket: "chuva" },
  71: { emoji: "❄", label: "Neve fraca", bucket: "neve" },
  73: { emoji: "❄", label: "Neve moderada", bucket: "neve" },
  75: { emoji: "❄", label: "Neve intensa", bucket: "neve" },
  77: { emoji: "❄", label: "Grãos de neve", bucket: "neve" },
  80: { emoji: "🌦", label: "Pancadas fracas", bucket: "chuva" },
  81: { emoji: "🌧", label: "Pancadas moderadas", bucket: "chuva" },
  82: { emoji: "⛈", label: "Pancadas intensas", bucket: "chuva" },
  85: { emoji: "❄", label: "Pancadas de neve fracas", bucket: "neve" },
  86: { emoji: "❄", label: "Pancadas de neve intensas", bucket: "neve" },
  95: { emoji: "⛈", label: "Tempestade", bucket: "tempestade" },
  96: { emoji: "⛈", label: "Tempestade com granizo fraco", bucket: "tempestade" },
  99: { emoji: "⛈", label: "Tempestade com granizo forte", bucket: "tempestade" },
};

export function weatherCodeInfo(code: number | null | undefined): WeatherCodeInfo {
  if (code == null) return { emoji: "❓", label: "—", bucket: "nublado" };
  return WEATHER_CODES[code] ?? { emoji: "🌡", label: "Condição desconhecida", bucket: "nublado" };
}

export type OperationalStatus = {
  nivel: "normal" | "atencao" | "alto" | "reprogramar" | "suspenso";
  cor: string;
  emoji: string;
  titulo: string;
  descricao: string;
};

export function situationStatus(probability: number | null | undefined): OperationalStatus {
  const p = Math.max(0, Math.min(100, Math.round(probability ?? 0)));
  if (p < 20)
    return { nivel: "normal", cor: "emerald", emoji: "🟢", titulo: "Operação Normal", descricao: "Condições favoráveis para atividades externas." };
  if (p < 60)
    return { nivel: "atencao", cor: "amber", emoji: "🟡", titulo: "Atenção", descricao: "Possibilidade moderada de chuva — monitore." };
  if (p <= 80)
    return { nivel: "alto", cor: "orange", emoji: "🟠", titulo: "Alto risco de chuva", descricao: "Considere antecipar tarefas críticas e proteger áreas expostas." };
  return { nivel: "reprogramar", cor: "red", emoji: "🔴", titulo: "Recomenda-se reprogramação", descricao: "Alta probabilidade de chuva — serviços externos devem ser reprogramados." };
}

export function effectiveTaludeStatus(
  probability: number | null | undefined,
  rain: { detected: boolean; intensity: RainIntensity | null; label: string; mm_atual: number } | null | undefined,
): OperationalStatus {
  if (rain?.detected) {
    const isDrizzle = rain.intensity === "garoa" || (rain.mm_atual > 0 && rain.mm_atual < 0.5);
    return {
      nivel: "suspenso",
      cor: "red",
      emoji: "⛈",
      titulo: isDrizzle ? "ATIVIDADE PARALISADA — Garoa/Chuva em curso" : `ATIVIDADE PARALISADA — ${rain.label} em curso`,
      descricao: "Qualquer precipitação interrompe as atividades de talude por segurança. Aguarde a liberação formal.",
    };
  }
  return situationStatus(probability);
}

export const EXTERNAL_ACTIVITIES = [
  "Civil",
  "Pintura",
  "Taludes",
  "Cobertura",
  "Impermeabilização",
  "Demarcação",
  "Trabalho em altura",
] as const;

export const EXTERNAL_ACTIVITY_ALERT_THRESHOLD = 60;
export const ANY_RAIN_RISK_THRESHOLD = 20;

export function shouldAlertExternalActivities(probability: number | null | undefined): boolean {
  return (probability ?? 0) >= EXTERNAL_ACTIVITY_ALERT_THRESHOLD;
}

export function hasAnyRainRisk(probability: number | null | undefined): boolean {
  return (probability ?? 0) >= ANY_RAIN_RISK_THRESHOLD;
}

export type RiskLevel = "safe" | "watch" | "warning" | "danger";
export function riskLevelForProbability(probability: number | null | undefined): RiskLevel {
  const p = probability ?? 0;
  if (p >= 60) return "danger";
  if (p >= 40) return "warning";
  if (p >= ANY_RAIN_RISK_THRESHOLD) return "watch";
  return "safe";
}

export type RainIntensity = "garoa" | "fraca" | "moderada" | "forte" | "tempestade";

export type RainDetection = {
  detected: boolean;
  intensity: RainIntensity | null;
  label: string;
  emoji: string;
  mm_atual: number;
  mm_dia: number;
  mm_acumulado_3h: number;
  weather_code: number | null;
};

const RAIN_BUCKETS = new Set(["garoa", "chuva", "tempestade"]);

function intensityFromMm(mm: number): RainIntensity {
  if (mm >= 8) return "forte";
  if (mm >= 2.5) return "moderada";
  return "fraca";
}

function intensityFromCode(code: number | null | undefined): RainIntensity | null {
  if (code == null) return null;
  if ([95, 96, 99].includes(code)) return "tempestade";
  if ([65, 67, 82].includes(code)) return "forte";
  if ([63, 66, 81].includes(code)) return "moderada";
  if ([61, 80].includes(code)) return "fraca";
  if ([51, 53, 55, 56, 57].includes(code)) return "garoa";
  return null;
}

const INTENSITY_LABEL: Record<RainIntensity, { label: string; emoji: string }> = {
  garoa: { label: "Garoa", emoji: "🌦" },
  fraca: { label: "Chuva fraca", emoji: "🌧" },
  moderada: { label: "Chuva moderada", emoji: "🌧" },
  forte: { label: "Chuva forte", emoji: "⛈" },
  tempestade: { label: "Tempestade", emoji: "⛈" },
};

export const RAIN_INTENSITY_ORDER: RainIntensity[] = ["garoa", "fraca", "moderada", "forte", "tempestade"];

/**
 * Detecta qualquer precipitação em curso. O acumulado recente usa a posição
 * temporal real em hourly.time; nunca o número da hora como índice do array.
 */
export function detectRain(data: WeatherResponse | undefined | null): RainDetection {
  if (!data) {
    return {
      detected: false,
      intensity: null,
      label: "Sem dados",
      emoji: "—",
      mm_atual: 0,
      mm_dia: 0,
      mm_acumulado_3h: 0,
      weather_code: null,
    };
  }

  const code = data.current?.weather_code ?? null;
  const bucket = weatherCodeInfo(code).bucket;
  const mmAtual = Math.max(0, Number(data.current?.precipitation ?? data.current?.rain ?? 0));
  const mmDia = Math.max(0, Number(data.daily?.precipitation_sum?.[0] ?? data.daily?.rain_sum?.[0] ?? 0));
  const hourlyPrecip = data.hourly?.precipitation?.length ? data.hourly.precipitation : data.hourly?.rain ?? [];
  const index = currentHourIndex(data.hourly?.time);

  // Soma a hora atual e, quando a fonte fornece histórico no mesmo array,
  // até duas horas imediatamente anteriores. Não soma horas futuras.
  const mm3h = index >= 0
    ? hourlyPrecip
        .slice(Math.max(0, index - 2), index + 1)
        .reduce((total, value) => total + Math.max(0, Number(value || 0)), 0)
    : mmAtual;

  const hourlyRain = index >= 0 ? Math.max(0, Number(hourlyPrecip[index] ?? 0)) : 0;
  const mmReferencia = Math.max(mmAtual, hourlyRain);
  const chuvaAtiva = RAIN_BUCKETS.has(bucket) || mmReferencia > 0.01;

  if (!chuvaAtiva) {
    return {
      detected: false,
      intensity: null,
      label: "Sem chuva",
      emoji: "☀",
      mm_atual: mmAtual,
      mm_dia: mmDia,
      mm_acumulado_3h: mm3h,
      weather_code: code,
    };
  }

  const intensity = intensityFromCode(code) ?? (mmReferencia > 0 ? intensityFromMm(mmReferencia) : "garoa");
  const meta = INTENSITY_LABEL[intensity];
  return {
    detected: true,
    intensity,
    label: meta.label,
    emoji: meta.emoji,
    mm_atual: mmAtual,
    mm_dia: mmDia,
    mm_acumulado_3h: mm3h,
    weather_code: code,
  };
}
