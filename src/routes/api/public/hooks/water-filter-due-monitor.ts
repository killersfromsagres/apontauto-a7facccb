// Item 21 — water-filter-due-monitor.
// Monitora filtros vencidos / a vencer e publica avisos idempotentes.
// Cron sugerido: 0 7 * * * (07:00 SP).
import { createFileRoute } from "@tanstack/react-router";

const TZ = "America/Sao_Paulo";
const MODULO = "abastecimento-agua";

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

async function handle(request: Request) {
  const { runJob, jobResponse } = await import("@/lib/jobs/runner.server");

  let body: { dias?: number; forcar?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const hoje = hojeSP();
  const janela = Math.min(Math.max(Number(body.dias) || 15, 1), 90);

  const outcome = await runJob(
    {
      key: "water-filter-due-monitor",
      // Uma execução efetiva por dia — reexecuções no mesmo dia são ignoradas.
      idempotencyKey: body.forcar ? null : `filtros:${hoje}`,
      timeoutMs: 45_000,
      maxAttempts: 3,
      moduleKey: MODULO,
    },
    async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as any;

      const limite = new Date(Date.now() + janela * 86_400_000).toISOString().slice(0, 10);

      const { data: ativos, error } = await admin
        .from("agua_filtro_ativos")
        .select("id, codigo, predio, espaco, proxima_troca, situacao, ponto_id")
        .not("proxima_troca", "is", null)
        .lte("proxima_troca", limite)
        .neq("situacao", "inativo")
        .order("proxima_troca", { ascending: true })
        .limit(500);
      if (error) throw new Error(error.message);

      const lista = ativos ?? [];
      const vencidos = lista.filter((f: any) => String(f.proxima_troca) < hoje);
      const proximos = lista.filter((f: any) => String(f.proxima_troca) >= hoje);

      const avisos: string[] = [];

      if (vencidos.length) {
        await admin.rpc("notificar_evento", {
          p_evento: "filtro_troca_atrasada",
          p_titulo: `${vencidos.length} filtro(s) com troca atrasada`,
          p_corpo: vencidos
            .slice(0, 8)
            .map((f: any) => `${f.codigo ?? f.id.slice(0, 8)} — venceu em ${f.proxima_troca}`)
            .join("\n"),
          p_categoria: "alerta",
          p_severidade: "erro",
          p_deep_link: "/agua/filtros",
          p_modulo: MODULO,
          p_requires_ack: true,
          p_dedupe_key: `filtro_atrasado:${hoje}`,
          p_alvos: [{ module_key: MODULO }],
          p_metadata: { total: vencidos.length },
        });
        avisos.push("atrasados");
      }

      if (proximos.length) {
        await admin.rpc("notificar_evento", {
          p_evento: "filtro_proximo_vencimento",
          p_titulo: `${proximos.length} filtro(s) vencem nos próximos ${janela} dias`,
          p_corpo: proximos
            .slice(0, 8)
            .map((f: any) => `${f.codigo ?? f.id.slice(0, 8)} — ${f.proxima_troca}`)
            .join("\n"),
          p_categoria: "informacao",
          p_severidade: "alerta",
          p_deep_link: "/agua/filtros",
          p_modulo: MODULO,
          p_requires_ack: false,
          p_dedupe_key: `filtro_vencendo:${hoje}`,
          p_alvos: [{ module_key: MODULO }],
          p_metadata: { total: proximos.length, janela },
        });
        avisos.push("proximos");
      }

      return { data: hoje, janela, vencidos: vencidos.length, proximos: proximos.length, avisos };
    },
  );

  return jobResponse(outcome);
}

export const Route = createFileRoute("/api/public/hooks/water-filter-due-monitor")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
