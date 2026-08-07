// API pública de clima — Open-Meteo (São Bernardo do Campo por padrão).
// Uso: GET /api/public/clima?lat=-23.69&lon=-46.56
// Sem autenticação, com cache de 10 minutos.
import { createFileRoute } from "@tanstack/react-router";

const DEFAULT_LAT = -23.6939;
const DEFAULT_LON = -46.565;

function wmoTexto(code: number | null | undefined): string {
  if (code == null) return "—";
  if (code === 0) return "Ensolarado";
  if ([1, 2].includes(code)) return "Parcialmente nublado";
  if (code === 3) return "Nublado";
  if ([45, 48].includes(code)) return "Névoa";
  if ([51, 53, 55, 56, 57].includes(code)) return "Garoa";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Chuva";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Neve";
  if ([95, 96, 99].includes(code)) return "Tempestade";
  return "Instável";
}

function num(v: string | null, fallback: number): number {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const Route = createFileRoute("/api/public/clima")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lat = num(url.searchParams.get("lat"), DEFAULT_LAT);
        const lon = num(url.searchParams.get("lon"), DEFAULT_LON);

        const upstream =
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&current=temperature_2m,precipitation,weather_code,relative_humidity_2m,wind_speed_10m` +
          `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max` +
          `&forecast_days=7&timezone=America%2FSao_Paulo`;

        try {
          const fetchWithRetry = async (retries = 1): Promise<Response> => {
            const r = await fetch(upstream, {
              headers: { accept: "application/json" },
            });
            if (r.status === 429 && retries > 0) {
              await new Promise(res => setTimeout(res, 1000));
              return fetchWithRetry(retries - 1);
            }
            return r;
          };

          const r = await fetchWithRetry();
          if (!r.ok) {
            return Response.json(
              { error: "upstream_unavailable", status: r.status },
              { status: 502, headers: { "Cache-Control": "no-store" } },
            );
          }
          const j = (await r.json()) as {
            current: {
              time: string;
              temperature_2m: number;
              precipitation: number;
              weather_code: number;
              relative_humidity_2m?: number;
              wind_speed_10m?: number;
            };
            daily: {
              time: string[];
              weather_code: number[];
              temperature_2m_max: number[];
              temperature_2m_min: number[];
              precipitation_sum: number[];
              precipitation_probability_max: (number | null)[];
            };
          };

          const today = new Date().toISOString().slice(0, 10);
          const idxHoje = j.daily.time.indexOf(today);
          const probHoje = idxHoje >= 0 ? j.daily.precipitation_probability_max[idxHoje] : null;

          const payload = {
            fonte: "open-meteo",
            atualizado_em: new Date().toISOString(),
            local: { latitude: lat, longitude: lon, timezone: "America/Sao_Paulo" },
            agora: {
              temperatura: j.current.temperature_2m,
              condicao: wmoTexto(j.current.weather_code),
              weather_code: j.current.weather_code,
              precipitacao_mm: j.current.precipitation,
              umidade: j.current.relative_humidity_2m ?? null,
              vento_kmh: j.current.wind_speed_10m ?? null,
              prob_chuva_hoje: probHoje,
              chovendo:
                j.current.precipitation > 0 ||
                [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(j.current.weather_code),
            },
            previsao: j.daily.time.map((data, i) => ({
              data,
              temp_max: j.daily.temperature_2m_max[i] ?? null,
              temp_min: j.daily.temperature_2m_min[i] ?? null,
              precipitacao_mm: j.daily.precipitation_sum[i] ?? 0,
              prob_chuva: j.daily.precipitation_probability_max[i] ?? null,
              condicao: wmoTexto(j.daily.weather_code[i]),
              weather_code: j.daily.weather_code[i] ?? null,
            })),
          };

          return Response.json(payload, {
            headers: {
              // Cache no edge por 10 min, revalida em background por mais 30 min
              "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=1800",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, OPTIONS",
            },
          });
        } catch (e) {
          return Response.json(
            { error: "fetch_failed", detail: (e as Error).message },
            { status: 502, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "content-type",
          },
        }),
    },
  },
});
