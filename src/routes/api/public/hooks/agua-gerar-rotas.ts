// Geração automática das rotas de água (item 21: generate-water-delivery-runs).
// Idempotente em dois níveis: `job_runs` (chave por data) e a rotina do banco,
// que não duplica rotas nem paradas. Executa com trava, timeout, retry e log.
import { createFileRoute } from "@tanstack/react-router";

const TZ = "America/Sao_Paulo";

function horaSP(): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(
      new Date(),
    ),
  );
}

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

async function handle(request: Request) {
  const { runJob, jobResponse, PermanentJobError } = await import("@/lib/jobs/runner.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let body: { data?: string; forcar?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  // Horário de execução configurável pelo administrador (Configurações → Água).
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("data")
    .limit(1)
    .maybeSingle();
  const raw = (settings?.data ?? {}) as Record<string, any>;
  // Nova chave (item 22): aguaAdmin.operacao.horaGeracao; mantém a antiga por compatibilidade.
  const horaConfig = raw.aguaAdmin?.operacao?.horaGeracao ?? raw.aguaGeracao?.hora;
  const horaAlvo = Number.isFinite(Number(horaConfig)) ? Number(horaConfig) : 5;

  if (!body.forcar && horaSP() !== horaAlvo) {
    return Response.json({ skipped: true, reason: "fora do horário configurado", horaAlvo });
  }

  const alvo = body.data ?? hojeSP();

  const outcome = await runJob(
    {
      key: "generate-water-delivery-runs",
      idempotencyKey: body.forcar ? null : `rotas:${alvo}`,
      timeoutMs: 90_000,
      maxAttempts: 3,
      maxConcurrent: 1,
      moduleKey: "abastecimento-agua",
    },
    async () => {
      const { data, error } = await (supabaseAdmin as any).rpc("agua_gerar_rotas", {
        p_data: alvo,
        p_origem: body.forcar ? "manual-api" : "cron",
      });
      if (error) {
        if (/permission|sem permissao|does not exist/i.test(error.message)) {
          throw new PermanentJobError(error.message);
        }
        throw new Error(error.message);
      }
      return { data: alvo, resultado: data };
    },
  );

  return jobResponse(outcome);
}

export const Route = createFileRoute("/api/public/hooks/agua-gerar-rotas")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
