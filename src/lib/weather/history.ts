import { supabase } from "@/integrations/supabase/client";
import {
  SOURCE_META,
  isRaining,
  intensityFromReading,
  type RainIntensityKey,
  type WeatherSourceKey,
} from "@/lib/weather/sources";

export interface WeatherObservation {
  id: string;
  source: string;
  source_station_id: string | null;
  data_type: string;
  observed_at: string;
  distance_km: number | null;
  precipitation_mm: number;
  rain_rate_mm_h: number | null;
  precipitation_probability: number | null;
  weather_code: number | null;
  temperature_c: number | null;
  humidity_pct: number | null;
  wind_kmh: number | null;
  confidence: number;
}

export interface WeatherEvent {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: "aberto" | "encerrado" | "descartado";
  max_intensity: RainIntensityKey | null;
  accumulated_mm: number;
  sources: string[];
  confidence: number;
  confirmation_type: "automatica" | "manual" | "pluviometro";
  wait_minutes: number;
  release_required: boolean;
  affected_scope: Record<string, unknown>;
  notes: string | null;
}

export interface SourceHealth {
  source: string;
  last_run_at: string | null;
  last_success_at: string | null;
  latency_ms: number | null;
  consecutive_errors: number;
  state: string;
  last_error: string | null;
}

const OBS_COLS =
  "id, source, source_station_id, data_type, observed_at, distance_km, precipitation_mm, rain_rate_mm_h, precipitation_probability, weather_code, temperature_c, humidity_pct, wind_kmh, confidence";

export async function listObservations(fromISO: string, toISO: string) {
  const { data, error } = await supabase
    .from("weather_observations")
    .select(OBS_COLS)
    .gte("observed_at", fromISO)
    .lte("observed_at", toISO)
    .order("observed_at", { ascending: true })
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as unknown as WeatherObservation[];
}

export async function listEvents(fromISO: string, toISO: string) {
  const { data, error } = await supabase
    .from("weather_events")
    .select("*")
    .gte("started_at", fromISO)
    .lte("started_at", toISO)
    .order("started_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as WeatherEvent[];
}

export async function getOpenEvent() {
  const { data, error } = await supabase
    .from("weather_events")
    .select("*")
    .eq("status", "aberto")
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as WeatherEvent | null;
}

export async function listSourceHealth() {
  const { data, error } = await supabase
    .from("weather_source_health")
    .select("*")
    .order("source");
  if (error) throw error;
  return (data ?? []) as unknown as SourceHealth[];
}

/** Registro manual de chuva feito por colaborador em campo. */
export async function registrarChuvaManual(input: {
  intensidade: RainIntensityKey;
  mm?: number;
  observacao?: string;
}) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id ?? null;
  const meta = SOURCE_META.manual;
  const mm = input.mm ?? { garoa: 0.2, fraca: 1, moderada: 4, forte: 10, tempestade: 20 }[input.intensidade];

  const { error } = await supabase.from("weather_observations").insert({
    source: "manual",
    data_type: meta.type,
    observed_at: new Date().toISOString(),
    precipitation_mm: mm,
    rain_rate_mm_h: mm,
    confidence: meta.confidence,
    created_by: uid,
    raw_payload: { intensidade: input.intensidade, observacao: input.observacao ?? null } as never,
  });
  if (error) throw error;

  const open = await getOpenEvent();
  if (open) {
    await supabase
      .from("weather_events")
      .update({
        accumulated_mm: Number(open.accumulated_mm ?? 0) + mm,
        sources: Array.from(new Set([...(open.sources ?? []), "manual"])),
        confirmed_by: uid,
        confirmation_type: "manual",
      })
      .eq("id", open.id);
    return open.id;
  }

  const { data, error: insErr } = await supabase
    .from("weather_events")
    .insert({
      started_at: new Date().toISOString(),
      status: "aberto",
      max_intensity: input.intensidade,
      accumulated_mm: mm,
      sources: ["manual"],
      confidence: meta.confidence,
      confirmed_by: uid,
      confirmation_type: "manual",
      notes: input.observacao ?? null,
    })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return data.id as string;
}

export async function encerrarEventoManual(eventId: string, notes?: string) {
  const { error } = await supabase
    .from("weather_events")
    .update({ status: "encerrado", ended_at: new Date().toISOString(), notes: notes ?? null })
    .eq("id", eventId);
  if (error) throw error;
}

export async function descartarEvento(eventId: string, notes: string) {
  const { error } = await supabase
    .from("weather_events")
    .update({ status: "descartado", ended_at: new Date().toISOString(), notes })
    .eq("id", eventId);
  if (error) throw error;
}

// ── Agregações para o histórico visual ─────────────────────────
export type DayAggregate = {
  date: string; // YYYY-MM-DD
  mm: number;
  rainy: boolean;
  maxIntensity: RainIntensityKey | null;
  sources: string[];
  bestConfidence: number;
};

export function aggregateByDay(obs: WeatherObservation[]): DayAggregate[] {
  const map = new Map<string, DayAggregate>();
  for (const o of obs) {
    const date = new Date(o.observed_at).toLocaleDateString("sv-SE"); // YYYY-MM-DD local
    const cur =
      map.get(date) ??
      { date, mm: 0, rainy: false, maxIntensity: null, sources: [], bestConfidence: 0 };
    const wet = isRaining(o);
    if (wet) {
      cur.rainy = true;
      const i = intensityFromReading(Number(o.precipitation_mm ?? 0), o.weather_code);
      const order: RainIntensityKey[] = ["garoa", "fraca", "moderada", "forte", "tempestade"];
      if (!cur.maxIntensity || order.indexOf(i) > order.indexOf(cur.maxIntensity)) cur.maxIntensity = i;
    }
    cur.mm += Number(o.precipitation_mm ?? 0);
    if (!cur.sources.includes(o.source)) cur.sources.push(o.source);
    cur.bestConfidence = Math.max(cur.bestConfidence, Number(o.confidence ?? 0));
    map.set(date, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export type HourAggregate = { hour: string; mm: number; previsto: number; observado: number };

/** Timeline por hora com comparativo previsão × observado. */
export function aggregateByHour(obs: WeatherObservation[]): HourAggregate[] {
  const map = new Map<string, HourAggregate>();
  for (const o of obs) {
    const d = new Date(o.observed_at);
    const hour = `${d.toLocaleDateString("sv-SE")} ${String(d.getHours()).padStart(2, "0")}h`;
    const cur = map.get(hour) ?? { hour, mm: 0, previsto: 0, observado: 0 };
    const mm = Number(o.precipitation_mm ?? 0);
    const type = SOURCE_META[o.source as WeatherSourceKey]?.type ?? "previsao";
    if (type === "previsao") cur.previsto = Math.max(cur.previsto, mm);
    else cur.observado = Math.max(cur.observado, mm);
    cur.mm = Math.max(cur.previsto, cur.observado);
    map.set(hour, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.hour.localeCompare(b.hour));
}
