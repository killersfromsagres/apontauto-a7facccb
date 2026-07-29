// Geração automática das rotas de água — chamado pelo cron do banco.
// Idempotente: a rotina no banco não duplica rotas nem paradas.
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
  const conf = ((settings?.data ?? {}) as Record<string, any>).aguaGeracao ?? {};
  const horaAlvo = Number.isFinite(Number(conf.hora)) ? Number(conf.hora) : 5;

  if (!body.forcar && horaSP() !== horaAlvo) {
    return Response.json({ skipped: true, reason: "fora do horário configurado", horaAlvo });
  }

  const alvo = body.data ?? hojeSP();
  const { data, error } = await (supabaseAdmin as any).rpc("agua_gerar_rotas", {
    p_data: alvo,
    p_origem: body.forcar ? "manual-api" : "cron",
  });

  if (error) {
    console.error("[agua-gerar-rotas]", error.message);
    return Response.json({ error: "falha ao gerar rotas" }, { status: 500 });
  }
  return Response.json({ ok: true, resultado: data });
}

export const Route = createFileRoute("/api/public/hooks/agua-gerar-rotas")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
