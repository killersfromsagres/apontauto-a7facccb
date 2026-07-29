// Monitor meteorológico automático — executado pelo cron do banco a cada 5 minutos.
// Coleta multi-fonte, grava observações, agrupa em eventos de chuva e dispara
// alertas operacionais (suspensão preventiva) para taludes.
import { createFileRoute } from "@tanstack/react-router";
import {
  TALUDE_SITE,
  SOURCE_META,
  isRaining,
  intensityFromReading,
  INTENSITY_ORDER,
  EVENT_GROUP_MINUTES,
  DEFAULT_WAIT_MINUTES,
  distanceKm,
  type WeatherSourceKey,
} from "@/lib/weather/sources";

type Reading = {
  source: WeatherSourceKey;
  source_station_id: string | null;
  data_type: string;
  observed_at: string;
  latitude: number | null;
  longitude: number | null;
  distance_km: number | null;
  precipitation_mm: number;
  rain_rate_mm_h: number | null;
  precipitation_probability: number | null;
  weather_code: number | null;
  temperature_c: number | null;
  humidity_pct: number | null;
  wind_kmh: number | null;
  confidence: number;
  raw_payload: unknown;
};

const UA = "apontauto.lovable.app clima-monitor/1.0";

async function withTiming<T>(fn: () => Promise<T>) {
  const t0 = Date.now();
  try {
    const value = await fn();
    return { ok: true as const, value, latency: Date.now() - t0, error: null as string | null };
  } catch (e) {
    return {
      ok: false as const,
      value: null,
      latency: Date.now() - t0,
      error: (e as Error).message?.slice(0, 300) ?? "erro",
    };
  }
}

async function readOpenMeteo(): Promise<Reading> {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${TALUDE_SITE.latitude}&longitude=${TALUDE_SITE.longitude}` +
    "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,rain,precipitation" +
    "&hourly=precipitation_probability&forecast_days=1&timezone=UTC";
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  const j = (await r.json()) as {
    current: Record<string, number> & { time: string };
    hourly?: { precipitation_probability?: number[] };
  };
  const c = j.current ?? {};
  const mm = Math.max(Number(c.precipitation ?? 0), Number(c.rain ?? 0));
  const meta = SOURCE_META["open-meteo"];
  return {
    source: "open-meteo",
    source_station_id: null,
    data_type: meta.type,
    observed_at: c.time ? new Date(`${c.time}Z`).toISOString() : new Date().toISOString(),
    latitude: TALUDE_SITE.latitude,
    longitude: TALUDE_SITE.longitude,
    distance_km: 0,
    precipitation_mm: mm,
    rain_rate_mm_h: mm,
    precipitation_probability: j.hourly?.precipitation_probability?.[new Date().getUTCHours()] ?? null,
    weather_code: Number(c.weather_code ?? 0),
    temperature_c: Number(c.temperature_2m ?? 0),
    humidity_pct: Number(c.relative_humidity_2m ?? 0),
    wind_kmh: Number(c.wind_speed_10m ?? 0),
    confidence: meta.confidence,
    raw_payload: j.current,
  };
}

function symbolToCode(symbol?: string | null): number {
  if (!symbol) return 3;
  const s = symbol.replace(/_(day|night|polartwilight)$/, "");
  if (s.includes("thunder")) return 95;
  if (s.includes("heavyrain")) return 65;
  if (s.includes("lightrain")) return 61;
  if (s.includes("rain")) return 63;
  if (s.includes("sleet") || s.includes("snow")) return 71;
  if (s.includes("fog")) return 45;
  if (s === "cloudy") return 3;
  if (s === "partlycloudy") return 2;
  if (s === "fair") return 1;
  if (s === "clearsky") return 0;
  return 3;
}

async function readMetNorway(): Promise<Reading> {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${TALUDE_SITE.latitude.toFixed(4)}&lon=${TALUDE_SITE.longitude.toFixed(4)}`;
  const r = await fetch(url, { headers: { "User-Agent": UA, accept: "application/json" } });
  if (!r.ok) throw new Error(`met.no ${r.status}`);
  const j = (await r.json()) as {
    properties: {
      timeseries: {
        time: string;
        data: {
          instant?: { details?: Record<string, number> };
          next_1_hours?: { summary?: { symbol_code?: string }; details?: Record<string, number> };
        };
      }[];
    };
  };
  const now = j.properties?.timeseries?.[0];
  if (!now) throw new Error("met.no vazio");
  const inst = now.data.instant?.details ?? {};
  const nxt = now.data.next_1_hours?.details ?? {};
  const meta = SOURCE_META["met-norway"];
  const mm = Number(nxt.precipitation_amount ?? 0);
  return {
    source: "met-norway",
    source_station_id: null,
    data_type: meta.type,
    observed_at: new Date(now.time).toISOString(),
    latitude: TALUDE_SITE.latitude,
    longitude: TALUDE_SITE.longitude,
    distance_km: 0,
    precipitation_mm: mm,
    rain_rate_mm_h: mm,
    precipitation_probability: nxt.probability_of_precipitation ?? null,
    weather_code: symbolToCode(now.data.next_1_hours?.summary?.symbol_code),
    temperature_c: inst.air_temperature ?? null,
    humidity_pct: inst.relative_humidity ?? null,
    wind_kmh: inst.wind_speed != null ? Math.round(inst.wind_speed * 3.6) : null,
    confidence: meta.confidence,
    raw_payload: now,
  };
}

/**
 * Fonte observacional (CEMADEN/INMET) — habilitada apenas quando a estação for
 * configurada por secret. Sem configuração, o sistema declara ausência da fonte
 * em vez de fingir medição local.
 */
async function readObservational(): Promise<Reading | null> {
  const endpoint = process.env.CEMADEN_STATION_URL || process.env.INMET_STATION_URL;
  if (!endpoint) return null;
  const source: WeatherSourceKey = process.env.CEMADEN_STATION_URL ? "cemaden" : "inmet";
  const r = await fetch(endpoint, { headers: { accept: "application/json", "User-Agent": UA } });
  if (!r.ok) throw new Error(`${source} ${r.status}`);
  const j = (await r.json()) as Record<string, unknown>;
  const mm = Number(
    (j.precipitation ?? j.chuva ?? j.valorMedida ?? (j as { CHUVA?: number }).CHUVA ?? 0) as number,
  );
  const lat = Number((j.latitude ?? (j as { VL_LATITUDE?: number }).VL_LATITUDE ?? TALUDE_SITE.latitude) as number);
  const lon = Number((j.longitude ?? (j as { VL_LONGITUDE?: number }).VL_LONGITUDE ?? TALUDE_SITE.longitude) as number);
  const meta = SOURCE_META[source];
  return {
    source,
    source_station_id: String(j.codEstacao ?? j.station ?? j.CD_ESTACAO ?? "estacao"),
    data_type: meta.type,
    observed_at: new Date().toISOString(),
    latitude: lat,
    longitude: lon,
    distance_km: distanceKm(TALUDE_SITE.latitude, TALUDE_SITE.longitude, lat, lon),
    precipitation_mm: Number.isFinite(mm) ? mm : 0,
    rain_rate_mm_h: Number.isFinite(mm) ? mm : 0,
    precipitation_probability: null,
    weather_code: null,
    temperature_c: null,
    humidity_pct: null,
    wind_kmh: null,
    confidence: meta.confidence,
    raw_payload: j,
  };
}

export const Route = createFileRoute("/api/public/hooks/weather-monitor")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date();

        const results = await Promise.all([
          withTiming(readObservational),
          withTiming(readOpenMeteo),
          withTiming(readMetNorway),
        ]);

        const readings: Reading[] = [];
        const healthRows: Record<string, unknown>[] = [];
        const sourceOrder: WeatherSourceKey[] = ["cemaden", "open-meteo", "met-norway"];

        results.forEach((res, idx) => {
          const fallbackName = sourceOrder[idx];
          const reading = (res.value ?? null) as Reading | null;
          const name = reading?.source ?? fallbackName;
          if (reading) readings.push(reading);
          if (res.ok && !reading && idx === 0) return; // fonte observacional não configurada
          healthRows.push({
            source: name,
            last_run_at: now.toISOString(),
            last_success_at: res.ok ? now.toISOString() : undefined,
            latency_ms: res.latency,
            consecutive_errors: res.ok ? 0 : 1,
            state: res.ok ? "ok" : "falha",
            last_error: res.error,
            updated_at: now.toISOString(),
          });
        });

        if (readings.length) {
          await supabaseAdmin.from("weather_observations").insert(
            readings.map((r) => ({ ...r, raw_payload: r.raw_payload as never })),
          );
        }
        for (const row of healthRows) {
          await supabaseAdmin.from("weather_source_health").upsert(row as never, { onConflict: "source" });
        }

        // ── Regra mínima de chuva ────────────────────────────────
        const raining = readings.filter((r) => isRaining(r));
        const bestSources = raining.map((r) => r.source);
        const maxMm = raining.reduce((acc, r) => Math.max(acc, r.precipitation_mm), 0);
        const bestConfidence = raining.reduce((acc, r) => Math.max(acc, r.confidence), 0);
        const intensity = raining.length
          ? raining
              .map((r) => intensityFromReading(r.precipitation_mm, r.weather_code))
              .sort((a, b) => INTENSITY_ORDER.indexOf(b) - INTENSITY_ORDER.indexOf(a))[0]
          : null;

        const { data: openEvent } = await supabaseAdmin
          .from("weather_events")
          .select("*")
          .eq("status", "aberto")
          .maybeSingle();

        let action: string = "sem-chuva";

        if (raining.length) {
          if (openEvent) {
            // Agrupa leituras próximas no mesmo evento — sem alerta duplicado.
            const prevIdx = INTENSITY_ORDER.indexOf(
              (openEvent.max_intensity as (typeof INTENSITY_ORDER)[number]) ?? "garoa",
            );
            const newIdx = INTENSITY_ORDER.indexOf(intensity!);
            await supabaseAdmin
              .from("weather_events")
              .update({
                accumulated_mm: Number(openEvent.accumulated_mm ?? 0) + maxMm,
                max_intensity: newIdx > prevIdx ? intensity : openEvent.max_intensity,
                sources: Array.from(new Set([...(openEvent.sources ?? []), ...bestSources])),
                confidence: Math.max(Number(openEvent.confidence ?? 0), bestConfidence),
              })
              .eq("id", openEvent.id);
            action = "evento-atualizado";
          } else {
            const { data: created } = await supabaseAdmin
              .from("weather_events")
              .insert({
                started_at: now.toISOString(),
                status: "aberto",
                max_intensity: intensity,
                accumulated_mm: maxMm,
                sources: bestSources,
                confidence: bestConfidence,
                confirmation_type: bestSources.includes("pluviometro") ? "pluviometro" : "automatica",
                wait_minutes: DEFAULT_WAIT_MINUTES,
                affected_scope: {
                  local: `${TALUDE_SITE.bairro}, ${TALUDE_SITE.cidade}-${TALUDE_SITE.estado}`,
                  fontes: readings.map((r) => ({
                    fonte: r.source,
                    tipo: r.data_type,
                    distancia_km: r.distance_km,
                    confianca: r.confidence,
                    mm: r.precipitation_mm,
                  })),
                },
              })
              .select("id")
              .single();

            // Suspensão preventiva das PT liberadas (programação NÃO é apagada).
            const { data: suspensas } = await supabaseAdmin
              .from("talude_pt_releases")
              .update({
                status: "suspensa_chuva",
                suspensa_em: now.toISOString(),
                weather_event_id: created?.id ?? null,
              })
              .eq("status", "liberada")
              .select("id, numero_pt, taludes_label, status");

            if (suspensas?.length) {
              await supabaseAdmin.from("talude_pt_events").insert(
                suspensas.map((pt) => ({
                  pt_id: pt.id,
                  from_status: "liberada",
                  to_status: "suspensa_chuva",
                  motivo: `Suspensão preventiva automática — ${intensity} detectada`,
                  weather_event_id: created?.id ?? null,
                  weather_snapshot: { mm: maxMm, fontes: bestSources, intensidade: intensity },
                  actor_nome: "Monitor automático",
                  origem: "cron",
                })),
              );
              await supabaseAdmin
                .from("weather_events")
                .update({
                  affected_scope: {
                    pt_suspensas: suspensas.map((p) => p.numero_pt),
                    taludes: suspensas.map((p) => p.taludes_label).filter(Boolean),
                  },
                })
                .eq("id", created!.id);
            }

            // Notificação crítica segmentada.
            const { data: notif } = await supabaseAdmin
              .from("notifications")
              .insert({
                title: `Chuva detectada — atividades de talude suspensas`,
                body:
                  `Intensidade: ${intensity}. Acumulado imediato: ${maxMm.toFixed(1)} mm. ` +
                  `Fontes: ${bestSources.join(", ")}. ` +
                  `${suspensas?.length ?? 0} PT em suspensão preventiva. ` +
                  `Nova liberação de PT é obrigatória antes da retomada.`,
                category: "clima",
                severity: "critical",
                module_key: "taludes",
                target_mode: "roles",
                status: "published",
                requires_ack: true,
                deep_link: "/taludes-pt",
                metadata: { weather_event_id: created?.id, intensidade: intensity },
              })
              .select("id")
              .single();

            if (notif) {
              await supabaseAdmin.from("notification_targets").insert(
                ["gestor_taludes", "operador_taludes", "bombeiros_pt"].map((role_key) => ({
                  notification_id: notif.id,
                  role_key,
                })),
              );
            }
            action = "evento-aberto";
          }
        } else if (openEvent) {
          // Sem chuva: encerra o evento se passou a janela de agrupamento.
          const { data: lastRain } = await supabaseAdmin
            .from("weather_observations")
            .select("observed_at, precipitation_mm, weather_code")
            .gte("observed_at", openEvent.started_at)
            .order("observed_at", { ascending: false })
            .limit(20);
          const lastWet = (lastRain ?? []).find((o) =>
            isRaining({ precipitation_mm: o.precipitation_mm as number, weather_code: o.weather_code }),
          );
          const lastWetAt = new Date(lastWet?.observed_at ?? openEvent.started_at).getTime();
          if (now.getTime() - lastWetAt > EVENT_GROUP_MINUTES * 60_000) {
            await supabaseAdmin
              .from("weather_events")
              .update({ status: "encerrado", ended_at: new Date(lastWetAt).toISOString() })
              .eq("id", openEvent.id);

            const { data: notif } = await supabaseAdmin
              .from("notifications")
              .insert({
                title: "Chuva encerrada — inspeção e liberação necessárias",
                body:
                  `Fim da chuva registrado. Aguarde ${openEvent.wait_minutes ?? DEFAULT_WAIT_MINUTES} min de espera, ` +
                  "realize a inspeção dos taludes e solicite nova liberação de PT. " +
                  "A retomada não é automática.",
                category: "clima",
                severity: "warning",
                module_key: "taludes",
                target_mode: "roles",
                status: "published",
                requires_ack: true,
                deep_link: "/taludes-pt",
                metadata: { weather_event_id: openEvent.id },
              })
              .select("id")
              .single();
            if (notif) {
              await supabaseAdmin.from("notification_targets").insert(
                ["gestor_taludes", "operador_taludes", "bombeiros_pt"].map((role_key) => ({
                  notification_id: notif.id,
                  role_key,
                })),
              );
            }
            action = "evento-encerrado";
          } else {
            action = "aguardando-janela";
          }
        }

        // Retenção do payload bruto.
        await supabaseAdmin
          .from("weather_observations")
          .update({ raw_payload: null })
          .lt("raw_expires_at", now.toISOString())
          .not("raw_payload", "is", null);

        return Response.json({
          ok: true,
          at: now.toISOString(),
          readings: readings.length,
          raining: raining.length > 0,
          intensity,
          action,
        });
      },
    },
  },
});
