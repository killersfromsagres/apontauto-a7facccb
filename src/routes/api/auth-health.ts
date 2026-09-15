import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth-health")({
  server: {
    handlers: {
      GET: async () => {
        const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
        const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

        if (!url) {
          return Response.json(
            { ok: false, stage: "config", error: "SUPABASE_URL ausente" },
            { status: 500, headers: { "cache-control": "no-store" } },
          );
        }

        const startedAt = Date.now();
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/health`, {
            method: "GET",
            headers: key ? { apikey: key } : undefined,
            signal: controller.signal,
          });
          clearTimeout(timer);

          const body = await response.text().catch(() => "");
          return Response.json(
            {
              ok: response.ok,
              stage: "auth-health",
              status: response.status,
              latency_ms: Date.now() - startedAt,
              supabase_host: new URL(url).host,
              response: body.slice(0, 300),
            },
            {
              status: response.ok ? 200 : 502,
              headers: { "cache-control": "no-store" },
            },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return Response.json(
            {
              ok: false,
              stage: "network",
              latency_ms: Date.now() - startedAt,
              supabase_host: (() => {
                try {
                  return new URL(url).host;
                } catch {
                  return "invalid-url";
                }
              })(),
              error: message,
            },
            { status: 502, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
