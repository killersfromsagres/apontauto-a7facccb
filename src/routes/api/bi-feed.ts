/**
 * Feed incremental para conectores de BI (Power BI, Excel, Google Sheets).
 *
 * GET /api/bi-feed?view=vw_bi_work_orders&since=2026-01-01T00:00:00Z&limit=5000
 * Requer `Authorization: Bearer <token>` e permissão de leitura em `bi-studio`.
 * A consulta roda com a RLS do próprio usuário (views SECURITY INVOKER).
 */
import { createFileRoute } from "@tanstack/react-router";

const ALLOWED = new Set([
  "vw_bi_work_orders",
  "vw_bi_backlog",
  "vw_bi_preventive_compliance",
  "vw_bi_assets",
  "vw_bi_taludes_weather_pt",
  "vw_bi_vehicle_checklists",
  "vw_bi_vehicle_fuelings",
]);

const DATE_FIELD: Record<string, string> = {
  vw_bi_work_orders: "updated_at",
  vw_bi_backlog: "atualizado_em",
  vw_bi_preventive_compliance: "created_at",
  vw_bi_assets: "updated_at",
  vw_bi_taludes_weather_pt: "solicitada_em",
  vw_bi_vehicle_checklists: "created_at",
  vw_bi_vehicle_fuelings: "created_at",
};

export const Route = createFileRoute("/api/bi-feed")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await import("@/lib/api-auth.server");

        const user = await auth.getRequestUser(request);
        if (!user) return auth.unauthorized();
        if (!(await auth.callerCanAccessModule(request, "bi-studio", "read"))) {
          return auth.forbidden();
        }

        const url = new URL(request.url);
        const view = url.searchParams.get("view") ?? "";
        if (!ALLOWED.has(view)) {
          return Response.json({ error: "View inválida", allowed: [...ALLOWED] }, { status: 400 });
        }

        const since = url.searchParams.get("since");
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 5000, 1), 20000);

        const client = auth.getRequestClient(request);
        if (!client) return auth.unauthorized();

        const field = DATE_FIELD[view];
        let query = client.from(view).select("*").order(field, { ascending: false }).limit(limit);
        if (since && !Number.isNaN(new Date(since).getTime())) {
          query = query.gte(field, new Date(since).toISOString());
        }

        const { data, error } = await query;
        if (error) return Response.json({ error: error.message }, { status: 400 });

        return Response.json(
          {
            view,
            since: since ?? null,
            count: data?.length ?? 0,
            generated_at: new Date().toISOString(),
            rows: data ?? [],
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
