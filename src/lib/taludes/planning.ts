import { WEATHER_LOCATION, weatherCodeInfo } from "@/lib/weather/open-meteo";

export type TaludePlanningDayReason = "execucao" | "fim_de_semana" | "feriado" | "chuva";

export interface TaludeForecastDay {
  date: string;
  weatherCode: number | null;
  precipitationProbability: number;
  precipitationMm: number;
  rainMm: number;
}

export interface TaludeHoliday {
  date: string;
  name: string;
  scope: "nacional" | "estadual" | "municipal";
}

export interface TaludePlanningDay {
  date: string;
  counted: boolean;
  reason: TaludePlanningDayReason;
  reasonLabel: string;
  holiday?: TaludeHoliday;
  forecast?: TaludeForecastDay;
  weatherKnown: boolean;
  provisional: boolean;
}

export interface TaludePlanningOptions {
  startDate: string;
  durationDays: number;
  includeSaturday?: boolean;
  includeSunday?: boolean;
  rainProbabilityThreshold?: number;
  rainMmThreshold?: number;
  forecastDays?: TaludeForecastDay[];
}

export interface TaludePlanningSummary {
  durationDays: number;
  executionDays: number;
  skippedRainDays: number;
  skippedHolidayDays: number;
  skippedWeekendDays: number;
  provisionalExecutionDays: number;
  weatherSource: "open-meteo";
  location: string;
  forecastHorizonEnd: string | null;
  generatedAt: string;
}

export interface TaludePlanningResult {
  startDate: string;
  endDate: string;
  timeline: TaludePlanningDay[];
  summary: TaludePlanningSummary;
  hasProvisionalWeather: boolean;
}

const DEFAULT_RAIN_PROBABILITY_THRESHOLD = 60;
const DEFAULT_RAIN_MM_THRESHOLD = 0.1;
const MAX_PLANNING_DAYS = 730;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Data de início inválida.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error("Data de início inválida.");
  }
  return date;
}

function addDays(value: string, days: number) {
  const date = fromIsoDate(value);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

function easterSunday(year: number) {
  // Algoritmo gregoriano de Meeus/Jones/Butcher.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function holiday(date: string, name: string, scope: TaludeHoliday["scope"]): TaludeHoliday {
  return { date, name, scope };
}

/**
 * Calendário operacional da unidade Demarchi / São Bernardo do Campo.
 * Inclui feriados nacionais, 9 de Julho (SP), aniversário municipal,
 * Sexta-feira da Paixão e Corpus Christi. Carnaval não é tratado como feriado
 * automaticamente porque é ponto facultativo e pode haver expediente na planta.
 */
export function getTaludeOperationalHolidays(year: number): TaludeHoliday[] {
  const easter = easterSunday(year);
  return [
    holiday(`${year}-01-01`, "Confraternização Universal", "nacional"),
    holiday(addDays(easter, -2), "Sexta-feira da Paixão", "municipal"),
    holiday(`${year}-04-21`, "Tiradentes", "nacional"),
    holiday(`${year}-05-01`, "Dia do Trabalho", "nacional"),
    holiday(addDays(easter, 60), "Corpus Christi", "municipal"),
    holiday(`${year}-07-09`, "Revolução Constitucionalista", "estadual"),
    holiday(`${year}-08-20`, "Aniversário de São Bernardo do Campo", "municipal"),
    holiday(`${year}-09-07`, "Independência do Brasil", "nacional"),
    holiday(`${year}-10-12`, "Nossa Senhora Aparecida", "nacional"),
    holiday(`${year}-11-02`, "Finados", "nacional"),
    holiday(`${year}-11-15`, "Proclamação da República", "nacional"),
    holiday(`${year}-11-20`, "Dia Nacional de Zumbi e da Consciência Negra", "nacional"),
    holiday(`${year}-12-25`, "Natal", "nacional"),
  ];
}

function holidayMapForRange(startYear: number, endYear: number) {
  const entries = new Map<string, TaludeHoliday>();
  for (let year = startYear; year <= endYear; year += 1) {
    for (const item of getTaludeOperationalHolidays(year)) entries.set(item.date, item);
  }
  return entries;
}

function isRainForecast(day: TaludeForecastDay, probabilityThreshold: number, mmThreshold: number) {
  const info = weatherCodeInfo(day.weatherCode);
  const rainCode = info.bucket === "garoa" || info.bucket === "chuva" || info.bucket === "tempestade";
  return (
    day.rainMm >= mmThreshold ||
    day.precipitationMm >= mmThreshold ||
    day.precipitationProbability >= probabilityThreshold ||
    rainCode
  );
}

export function buildTaludeSchedule(options: TaludePlanningOptions): TaludePlanningResult {
  const durationDays = Math.trunc(Number(options.durationDays));
  if (!Number.isFinite(durationDays) || durationDays < 1 || durationDays > 365) {
    throw new Error("Informe uma duração entre 1 e 365 dias de execução.");
  }

  const start = fromIsoDate(options.startDate);
  const startYear = start.getFullYear();
  const holidayMap = holidayMapForRange(startYear, startYear + 2);
  const forecastMap = new Map((options.forecastDays ?? []).map((day) => [day.date, day]));
  const forecastDates = [...forecastMap.keys()].sort();
  const forecastHorizonEnd = forecastDates.at(-1) ?? null;
  const probabilityThreshold = Math.max(
    0,
    Math.min(100, Math.round(options.rainProbabilityThreshold ?? DEFAULT_RAIN_PROBABILITY_THRESHOLD)),
  );
  const mmThreshold = Math.max(0, Number(options.rainMmThreshold ?? DEFAULT_RAIN_MM_THRESHOLD));

  const timeline: TaludePlanningDay[] = [];
  let executionDays = 0;
  let skippedRainDays = 0;
  let skippedHolidayDays = 0;
  let skippedWeekendDays = 0;
  let provisionalExecutionDays = 0;
  let cursor = options.startDate;

  for (let safety = 0; safety < MAX_PLANNING_DAYS && executionDays < durationDays; safety += 1) {
    const current = fromIsoDate(cursor);
    const weekDay = current.getDay();
    const holidayItem = holidayMap.get(cursor);
    const forecast = forecastMap.get(cursor);
    const saturdayBlocked = weekDay === 6 && !options.includeSaturday;
    const sundayBlocked = weekDay === 0 && !options.includeSunday;

    if (saturdayBlocked || sundayBlocked) {
      skippedWeekendDays += 1;
      timeline.push({
        date: cursor,
        counted: false,
        reason: "fim_de_semana",
        reasonLabel: weekDay === 6 ? "Sábado não produtivo" : "Domingo não produtivo",
        weatherKnown: Boolean(forecast),
        provisional: false,
        forecast,
      });
    } else if (holidayItem) {
      skippedHolidayDays += 1;
      timeline.push({
        date: cursor,
        counted: false,
        reason: "feriado",
        reasonLabel: holidayItem.name,
        holiday: holidayItem,
        weatherKnown: Boolean(forecast),
        provisional: false,
        forecast,
      });
    } else if (forecast && isRainForecast(forecast, probabilityThreshold, mmThreshold)) {
      skippedRainDays += 1;
      timeline.push({
        date: cursor,
        counted: false,
        reason: "chuva",
        reasonLabel: `Chuva prevista (${forecast.precipitationProbability}% · ${Math.max(forecast.rainMm, forecast.precipitationMm).toFixed(1)} mm)`,
        weatherKnown: true,
        provisional: false,
        forecast,
      });
    } else {
      executionDays += 1;
      const provisional = !forecast;
      if (provisional) provisionalExecutionDays += 1;
      timeline.push({
        date: cursor,
        counted: true,
        reason: "execucao",
        reasonLabel: provisional ? "Execução planejada · clima fora da janela de previsão" : "Execução planejada",
        weatherKnown: Boolean(forecast),
        provisional,
        forecast,
      });
    }

    if (executionDays < durationDays) cursor = addDays(cursor, 1);
  }

  if (executionDays < durationDays) {
    throw new Error("Não foi possível calcular o término dentro do limite operacional de planejamento.");
  }

  const generatedAt = new Date().toISOString();
  const summary: TaludePlanningSummary = {
    durationDays,
    executionDays,
    skippedRainDays,
    skippedHolidayDays,
    skippedWeekendDays,
    provisionalExecutionDays,
    weatherSource: "open-meteo",
    location: `${WEATHER_LOCATION.bairro}, ${WEATHER_LOCATION.cidade} - ${WEATHER_LOCATION.estado}`,
    forecastHorizonEnd,
    generatedAt,
  };

  return {
    startDate: options.startDate,
    endDate: cursor,
    timeline,
    summary,
    hasProvisionalWeather: provisionalExecutionDays > 0,
  };
}

export async function fetchTaludePlanningForecast(signal?: AbortSignal): Promise<TaludeForecastDay[]> {
  const params = new URLSearchParams({
    latitude: String(WEATHER_LOCATION.latitude),
    longitude: String(WEATHER_LOCATION.longitude),
    daily: "weather_code,precipitation_probability_max,precipitation_sum,rain_sum",
    forecast_days: "16",
    timezone: WEATHER_LOCATION.timezone,
  });

  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", forwardAbort, { once: true });
  const timer = window.setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Open-Meteo respondeu ${response.status}.`);
    const json = await response.json() as {
      daily?: {
        time?: string[];
        weather_code?: number[];
        precipitation_probability_max?: number[];
        precipitation_sum?: number[];
        rain_sum?: number[];
      };
    };
    const daily = json.daily;
    if (!daily?.time?.length) throw new Error("A previsão não retornou dados diários.");

    return daily.time.map((date, index) => ({
      date,
      weatherCode: daily.weather_code?.[index] ?? null,
      precipitationProbability: Math.max(0, Math.min(100, Number(daily.precipitation_probability_max?.[index] ?? 0))),
      precipitationMm: Math.max(0, Number(daily.precipitation_sum?.[index] ?? 0)),
      rainMm: Math.max(0, Number(daily.rain_sum?.[index] ?? 0)),
    }));
  } catch (error) {
    if ((error as Error)?.name === "AbortError" && !signal?.aborted) {
      throw new Error("A previsão meteorológica excedeu 10 segundos de resposta.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

export function formatPlanningDate(value?: string | null) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}
