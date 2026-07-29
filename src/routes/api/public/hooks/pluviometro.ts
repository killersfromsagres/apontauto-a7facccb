// Endpoint opcional para pluviômetro local / IoT.
// Requer o cabeçalho x-pluviometro-token igual ao secret PLUVIOMETRO_TOKEN.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { TALUDE_SITE, SOURCE_META } from "@/lib/weather/sources";

const bodySchema = z.object({
  device_id: z.string().min(1).max(80),
  precipitation_mm: z.number().min(0).max(500).optional(),
  pulses: z.number().int().min(0).max(100000).optional(),
  mm_per_pulse: z.number().min(0.01).max(10).optional(),
  rain_rate_mm_h: z.number().min(0).max(500).optional(),
  observed_at: z.string().datetime().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export const Route = createFileRoute("/api/public/hooks/pluviometro")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.PLUVIOMETRO_TOKEN;
        if (!expected) {
          return Response.json({ error: "Endpoint desabilitado" }, { status: 503 });
        }
        if (request.headers.get("x-pluviometro-token") !== expected) {
          return Response.json({ error: "Não autorizado" }, { status: 401 });
        }

        let parsed;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return Response.json({ error: "Payload inválido" }, { status: 400 });
        }

        const mm =
          parsed.precipitation_mm ??
          (parsed.pulses != null ? parsed.pulses * (parsed.mm_per_pulse ?? 0.2) : 0);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const meta = SOURCE_META.pluviometro;

        const { error } = await supabaseAdmin.from("weather_observations").insert({
          source: "pluviometro",
          source_station_id: parsed.device_id,
          data_type: meta.type,
          observed_at: parsed.observed_at ?? new Date().toISOString(),
          latitude: parsed.latitude ?? TALUDE_SITE.latitude,
          longitude: parsed.longitude ?? TALUDE_SITE.longitude,
          distance_km: 0,
          precipitation_mm: mm,
          rain_rate_mm_h: parsed.rain_rate_mm_h ?? mm,
          confidence: meta.confidence,
          raw_payload: parsed as never,
        });
        if (error) return Response.json({ error: "Falha ao registrar" }, { status: 500 });

        return Response.json({ ok: true, precipitation_mm: mm });
      },
    },
  },
});
