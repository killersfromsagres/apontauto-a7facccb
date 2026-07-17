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

const ENDPOINT =
  "https://api.open-meteo.com/v1/forecast" +
  `?latitude=${WEATHER_LOCATION.latitude}` +
  `&longitude=${WEATHER_LOCATION.longitude}` +
  "&current=temperature_2m,relative_humidity_2m,weather_code,cloud_cover,wind_speed_10m,rain,is_day" +
  "&hourly=temperature_2m,precipitation_probability,rain,weather_code,cloud_cover,wind_speed_10m" +
  "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,rain_sum" +
  "&forecast_days=2" +
  `&timezone=${encodeURIComponent(WEATHER_LOCATION.timezone)}` +
  "&utm_source=apontauto.lovable.app";

export type WeatherCurrent = {
  temperature_2m: number;
  relative_humidity_2m: number;
  weather_code: number;
  cloud_cover: number;
  wind_speed_10m: number;
  rain: number;
  is_day: number;
};

export type WeatherHourly = {
  time: string[];
  temperature_2m: number[];
  precipitation_probability: number[];
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
  precipitation_probability_max: number[];
  rain_sum: number[];
};

export type WeatherResponse = {
  current: WeatherCurrent;
  hourly: WeatherHourly;
  daily: WeatherDaily;
  fetched_at: string;
};

export async function fetchWeather(signal?: AbortSignal): Promise<WeatherResponse> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, { signal, cache: "no-store" });
  } catch (e) {
    throw new Error(`Sem conexão com a Open-Meteo: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Open-Meteo respondeu ${res.status}${body ? ` — ${body.slice(0, 120)}` : ""}`);
  }
  const json = (await res.json()) as Omit<WeatherResponse, "fetched_at">;
  if (!json?.current || !json?.hourly?.temperature_2m) {
    throw new Error("Resposta inválida do Open-Meteo (campos ausentes).");
  }
  return { ...json, fetched_at: new Date().toISOString() };
}

// ────────────────────────────────────────────────────────────
// Tradução dos códigos WMO (Open-Meteo)
// ────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────
// Situação operacional baseada na probabilidade de chuva
// ────────────────────────────────────────────────────────────
export type OperationalStatus = {
  nivel: "normal" | "atencao" | "alto" | "reprogramar";
  cor: string; // token color hint
  emoji: string;
  titulo: string;
  descricao: string;
};

export function situationStatus(probability: number | null | undefined): OperationalStatus {
  const p = Math.max(0, Math.min(100, Math.round(probability ?? 0)));
  if (p < 20) {
    return {
      nivel: "normal",
      cor: "emerald",
      emoji: "🟢",
      titulo: "Operação Normal",
      descricao: "Condições favoráveis para atividades externas.",
    };
  }
  if (p < 60) {
    return {
      nivel: "atencao",
      cor: "amber",
      emoji: "🟡",
      titulo: "Atenção",
      descricao: "Possibilidade moderada de chuva — monitore.",
    };
  }
  if (p <= 80) {
    return {
      nivel: "alto",
      cor: "orange",
      emoji: "🟠",
      titulo: "Alto risco de chuva",
      descricao: "Considere antecipar tarefas críticas e proteger áreas expostas.",
    };
  }
  return {
    nivel: "reprogramar",
    cor: "red",
    emoji: "🔴",
    titulo: "Recomenda-se reprogramação",
    descricao: "Alta probabilidade de chuva — serviços externos devem ser reprogramados.",
  };
}

/** Atividades externas que sofrem impacto direto de chuva. */
export const EXTERNAL_ACTIVITIES = [
  "Civil",
  "Pintura",
  "Taludes",
  "Cobertura",
  "Impermeabilização",
  "Demarcação",
  "Trabalho em altura",
] as const;

/** Limite acima do qual atividades externas recebem alerta visual. */
export const EXTERNAL_ACTIVITY_ALERT_THRESHOLD = 70;

export function shouldAlertExternalActivities(probability: number | null | undefined): boolean {
  return (probability ?? 0) >= EXTERNAL_ACTIVITY_ALERT_THRESHOLD;
}
