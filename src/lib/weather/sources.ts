// Estratégia multi-fonte de clima/chuva para taludes.
// IMPORTANTE: previsão NUNCA é apresentada como medição física local.
// Cada leitura registra fonte, horário, distância da estação, confiança e tipo de dado.

export const TALUDE_SITE = {
  cidade: "São Bernardo do Campo",
  estado: "SP",
  bairro: "Demarchi",
  latitude: -23.7246,
  longitude: -46.5648,
};

export type WeatherSourceKey =
  | "cemaden"
  | "inmet"
  | "open-meteo"
  | "met-norway"
  | "pluviometro"
  | "manual";

export type WeatherDataType = "observacao" | "previsao" | "medicao_local" | "manual";

export const SOURCE_META: Record<
  WeatherSourceKey,
  { label: string; type: WeatherDataType; confidence: number; description: string }
> = {
  cemaden: {
    label: "CEMADEN",
    type: "observacao",
    confidence: 0.95,
    description: "Estação pluviométrica observacional (quando configurada).",
  },
  inmet: {
    label: "INMET",
    type: "observacao",
    confidence: 0.9,
    description: "Estação automática do INMET (quando configurada).",
  },
  "open-meteo": {
    label: "Open-Meteo",
    type: "previsao",
    confidence: 0.6,
    description: "Modelo numérico — condição atual estimada e previsão, não medição local.",
  },
  "met-norway": {
    label: "MET Norway",
    type: "previsao",
    confidence: 0.55,
    description: "Modelo numérico de fallback — previsão, não medição local.",
  },
  pluviometro: {
    label: "Pluviômetro local",
    type: "medicao_local",
    confidence: 1,
    description: "Medição física no local (pulso/volume do dispositivo IoT).",
  },
  manual: {
    label: "Registro manual",
    type: "manual",
    confidence: 0.85,
    description: "Confirmação visual registrada por colaborador em campo.",
  },
};

export const SOURCE_LABEL = (source: string) =>
  SOURCE_META[source as WeatherSourceKey]?.label ?? source;

export const SOURCE_TYPE_LABEL: Record<WeatherDataType, string> = {
  observacao: "Observação de estação",
  previsao: "Previsão (modelo)",
  medicao_local: "Medição local",
  manual: "Registro manual",
};

/** Códigos WMO que caracterizam garoa, chuva, pancada ou tempestade. */
export const RAIN_CODES = new Set([
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99,
]);

export type RainIntensityKey = "garoa" | "fraca" | "moderada" | "forte" | "tempestade";

export const INTENSITY_ORDER: RainIntensityKey[] = [
  "garoa",
  "fraca",
  "moderada",
  "forte",
  "tempestade",
];

export function intensityFromReading(
  mm: number,
  code: number | null | undefined,
): RainIntensityKey {
  if (code != null && [95, 96, 99].includes(code)) return "tempestade";
  if (mm >= 8) return "forte";
  if (code != null && [65, 67, 82].includes(code)) return "forte";
  if (mm >= 2.5) return "moderada";
  if (code != null && [63, 66, 81].includes(code)) return "moderada";
  if (mm >= 0.4) return "fraca";
  if (code != null && [61, 80].includes(code)) return "fraca";
  return "garoa";
}

/** Regra mínima de chuva: qualquer evidência dispara alerta. */
export function isRaining(input: {
  precipitation_mm?: number | null;
  weather_code?: number | null;
  source?: string | null;
}): boolean {
  const mm = Number(input.precipitation_mm ?? 0);
  if (mm > 0) return true;
  if (input.weather_code != null && RAIN_CODES.has(input.weather_code)) return true;
  if (input.source === "pluviometro" && mm >= 0) return false;
  return false;
}

/** Distância aproximada (km) entre dois pontos — Haversine. */
export function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 100) / 100;
}

/** Janela (minutos) para agrupar leituras próximas no mesmo evento de chuva. */
export const EVENT_GROUP_MINUTES = 45;
/** Tempo de espera padrão (minutos) após o fim da chuva antes de liberar retomada. */
export const DEFAULT_WAIT_MINUTES = 60;
