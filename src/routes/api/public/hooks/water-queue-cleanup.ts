// Item 21 — limpeza segura de filas temporárias.
// Remove apenas histórico técnico antigo (execuções, disparos encerrados,
// jobs de geração e logs de erro). NUNCA apaga fotos, evidências,
// visitas, rotas, solicitações ou registros operacionais.
// Cron sugerido: 20 3 * * 0 (domingo, 03:20 SP).
import { createFileRoute } from "@tanstack/react-router";

const TZ = "America/Sao_Paulo";

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

async function handle(request: Request) {
  const { runJob, jobResponse, PermanentJobError } = await import("@/lib/jobs/runner.server");

  let body: { dias?: number; forcar?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const dias = Math.min(Math.max(Number(body.dias) || 90, 30), 720);

  const outcome = await runJob(
    {
      key: "water-queue-cleanup",
      idempotencyKey: body.forcar ? null : `limpeza:${hojeSP()}`,
      timeoutMs: 90_000,
      maxAttempts: 2,
      maxConcurrent: 1,
    },
    async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await (supabaseAdmin as any).rpc("jobs_limpeza_filas", {
        p_dias: dias,
      });
      if (error) {
        // Erro de permissão/definição não melhora com retry.
        if (/permission|does not exist/i.test(error.message)) {
          throw new PermanentJobError(error.message);
        }
        throw new Error(error.message);
      }
      return data;
    },
  );

  return jobResponse(outcome);
}

export const Route = createFileRoute("/api/public/hooks/water-queue-cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
