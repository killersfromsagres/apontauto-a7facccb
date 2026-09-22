import { WEATHER_LOCATION, weatherCodeInfo } from "@/lib/weather/open-meteo";

export type TaludePlanningDayReason = "execucao" | "fim_de_semana" | "feriado" | "chuva";
export type TaludeRainRiskLevel = "baixo" | "atencao" | "alto" | "critico";

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

export interface TaludeRainAssessment {
  probability: number;
  precipitationMm: number;
  weatherLabel: string;
  riskScore: number;
  riskLevel: TaludeRainRiskLevel;
  blocksExecution: boolean;
  reason: string;
}

export interface TaludePlanningDay {
  date: string;
  counted: boolean;
  reason: TaludePlanningDayReason;
  reasonLabel: string;
  holiday?: TaludeHoliday;
  forecast?: TaludeForecastDay;
  rainAssessment?: TaludeRainAssessment;
  weatherKnown: boolean;
  provisional: boolean;
}

export interface TaludePlanningOptions {
  startDate: string;
  durationDays: number;
  includeSaturday?: boolean;
  includeSunday?: boolean;
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
  weatherDecisionMode: "automatic";
  location: string;
  forecastHorizonEnd: string | null;
  highestRainProbability: number;
  highestRainRiskScore: number;
  evaluatedForecastDays: number;
  generatedAt: string;
}

export interface TaludePlanningResult {
  startDate: string;
  endDate: string;
  timeline: TaludePlanningDay[];
  summary: TaludePlanningSummary;
  hasProvisionalWeather: boolean;
}

// Regras operacionais internas. O usuário não precisa informar percentuais manualmente.
export const AUTOMATIC_RAIN_PROBABILITY_BLOCK = 60;
export const AUTOMATIC_RAIN_MM_BLOCK = 0.1;
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

/** Calendário operacional da unidade Demarchi / São Bernardo do Campo. */
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function riskLevel(score: number): TaludeRainRiskLevel {
  if (score >= 75) return "critico";
  if (score >= 50) return "alto";
  if (score >= 25) return "atencao";
  return "baixo";
}

/**
 * Analisa automaticamente o risco de chuva do dia.
 * A probabilidade vem da previsão diária e é cruzada com volume e código WMO.
 * Não há percentual configurável pelo usuário: a decisão operacional é padronizada.
 */
export function calculateAutomaticRainRisk(day: TaludeForecastDay): TaludeRainAssessment {
  const probability = clamp(Math.round(Number(day.precipitationProbability || 0)), 0, 100);
  const precipitationMm = Math.max(0, Number(day.rainMm || 0), Number(day.precipitationMm || 0));
  const info = weatherCodeInfo(day.weatherCode);
  const rainCode = info.bucket === "garoa" || info.bucket === "chuva" || info.bucket === "tempestade";

  const codeScore = info.bucket === "tempestade" ? 35 : info.bucket === "chuva" ? 25 : info.bucket === "garoa" ? 15 : 0;
  const volumeScore = precipitationMm >= 10 ? 35 : precipitationMm >= 5 ? 30 : precipitationMm >= 2 ? 25 : precipitationMm >= 0.5 ? 18 : precipitationMm >= AUTOMATIC_RAIN_MM_BLOCK ? 10 : 0;
  const probabilityScore = Math.round(probability * 0.55);
  const riskScore = clamp(probabilityScore + volumeScore + codeScore, 0, 100);

  const blocksExecution =
    rainCode ||
    precipitationMm >= AUTOMATIC_RAIN_MM_BLOCK ||
    probability >= AUTOMATIC_RAIN_PROBABILITY_BLOCK;

  const reasonParts = [`${probability}% de probabilidade`];
  if (precipitationMm > 0) reasonParts.push(`${precipitationMm.toFixed(1)} mm`);
  if (rainCode) reasonParts.push(info.label);

  return {
    probability,
    precipitationMm,
    weatherLabel: info.label,
    riskScore,
    riskLevel: riskLevel(riskScore),
    blocksExecution,
    reason: reasonParts.join(" · "),
  };
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

  const timeline: TaludePlanningDay[] = [];
  let executionDays = 0;
  let skippedRainDays = 0;
  let skippedHolidayDays = 0;
  let skippedWeekendDays = 0;
  let provisionalExecutionDays = 0;
  let highestRainProbability = 0;
  let highestRainRiskScore = 0;
  let evaluatedForecastDays = 0;
  let cursor = options.startDate;

  for (let safety = 0; safety < MAX_PLANNING_DAYS && executionDays < durationDays; safety += 1) {
    const current = fromIsoDate(cursor);
    const weekDay = current.getDay();
    const holidayItem = holidayMap.get(cursor);
    const forecast = forecastMap.get(cursor);
    const rainAssessment = forecast ? calculateAutomaticRainRisk(forecast) : undefined;
    const saturdayBlocked = weekDay === 6 && !options.includeSaturday;
    const sundayBlocked = weekDay === 0 && !options.includeSunday;

    if (rainAssessment) {
      evaluatedForecastDays += 1;
      highestRainProbability = Math.max(highestRainProbability, rainAssessment.probability);
      highestRainRiskScore = Math.max(highestRainRiskScore, rainAssessment.riskScore);
    }

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
        rainAssessment,
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
        rainAssessment,
      });
    } else if (rainAssessment?.blocksExecution) {
      skippedRainDays += 1;
      timeline.push({
        date: cursor,
        counted: false,
        reason: "chuva",
        reasonLabel: `Risco automático de chuva · ${rainAssessment.reason} · risco ${rainAssessment.riskLevel}`,
        weatherKnown: true,
        provisional: false,
        forecast,
        rainAssessment,
      });
    } else {
      executionDays += 1;
      const provisional = !forecast;
      if (provisional) provisionalExecutionDays += 1;
      timeline.push({
        date: cursor,
        counted: true,
        reason: "execucao",
        reasonLabel: provisional
          ? "Execução planejada · clima fora da janela de previsão"
          : `Execução planejada · chuva ${rainAssessment?.probability ?? 0}% · risco ${rainAssessment?.riskLevel ?? "baixo"}`,
        weatherKnown: Boolean(forecast),
        provisional,
        forecast,
        rainAssessment,
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
    weatherDecisionMode: "automatic",
    location: `${WEATHER_LOCATION.bairro}, ${WEATHER_LOCATION.cidade} - ${WEATHER_LOCATION.estado}`,
    forecastHorizonEnd,
    highestRainProbability,
    highestRainRiskScore,
    evaluatedForecastDays,
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
      precipitationProbability: clamp(Number(daily.precipitation_probability_max?.[index] ?? 0), 0, 100),
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
