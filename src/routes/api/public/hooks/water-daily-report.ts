// Item 21 — geração de relatório consolidado do dia (quando necessário).
// Produz um resumo auditável da operação de água e o registra em `job_runs`,
// notificando os gestores. Não apaga nem altera dados operacionais.
// Cron sugerido: 0 20 * * * (20:00 SP, após o fim das rotas).
import { createFileRoute } from "@tanstack/react-router";

const TZ = "America/Sao_Paulo";
const MODULO = "abastecimento-agua";

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

async function handle(request: Request) {
  const { runJob, jobResponse } = await import("@/lib/jobs/runner.server");

  let body: { data?: string; forcar?: boolean; notificar?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const alvo = body.data ?? hojeSP();

  const outcome = await runJob(
    {
      key: "water-daily-report",
      idempotencyKey: body.forcar ? null : `relatorio:${alvo}`,
      timeoutMs: 60_000,
      maxAttempts: 3,
      moduleKey: MODULO,
    },
    async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as any;

      const [{ data: rotas, error: e1 }, { data: visitas, error: e2 }] = await Promise.all([
        admin.from("agua_rotas").select("id, status, turno, equipe, divergencia_bags").eq("data", alvo),
        admin
          .from("agua_visitas")
          .select("id, status, bags_previstas, bags_entregues, fotos, foto_url")
          .eq("data", alvo),
      ]);
      if (e1) throw new Error(e1.message);
      if (e2) throw new Error(e2.message);

      const listaRotas = rotas ?? [];
      const listaVisitas = visitas ?? [];
      const concluidas = listaVisitas.filter((v: any) =>
        ["concluida", "parcial", "sem_necessidade"].includes(String(v.status)),
      );
      const previstas = listaVisitas.reduce((s: number, v: any) => s + (v.bags_previstas ?? 0), 0);
      const entregues = listaVisitas.reduce((s: number, v: any) => s + (v.bags_entregues ?? 0), 0);
      const semEvidencia = concluidas.filter(
        (v: any) => !(v.foto_url || (Array.isArray(v.fotos) && v.fotos.length > 0)),
      ).length;

      const resumo = {
        data: alvo,
        rotas: listaRotas.length,
        rotas_concluidas: listaRotas.filter((r: any) =>
          String(r.status).startsWith("concluida"),
        ).length,
        rotas_com_divergencia: listaRotas.filter((r: any) => r.divergencia_bags).length,
        paradas: listaVisitas.length,
        paradas_concluidas: concluidas.length,
        taxa_conclusao: listaVisitas.length
          ? Math.round((concluidas.length / listaVisitas.length) * 1000) / 10
          : 0,
        bags_previstas: previstas,
        bags_entregues: entregues,
        paradas_sem_evidencia: semEvidencia,
        gerado_em: new Date().toISOString(),
      };

      if (body.notificar !== false && listaVisitas.length > 0) {
        await admin.rpc("notificar_evento", {
          p_evento: "relatorio_diario_agua",
          p_titulo: `Resumo do dia — Abastecimento de Água (${alvo})`,
          p_corpo:
            `Paradas: ${resumo.paradas_concluidas}/${resumo.paradas} (${resumo.taxa_conclusao}%)\n` +
            `Bags: ${resumo.bags_entregues}/${resumo.bags_previstas}\n` +
            `Sem evidência: ${resumo.paradas_sem_evidencia}`,
          p_categoria: "informacao",
          p_severidade: resumo.paradas_sem_evidencia > 0 ? "alerta" : "info",
          p_deep_link: "/abastecimento/agua/indicadores",
          p_modulo: MODULO,
          p_requires_ack: false,
          p_dedupe_key: `relatorio_diario_agua:${alvo}`,
          p_alvos: [{ module_key: MODULO }],
          p_metadata: resumo,
        });
      }

      return resumo;
    },
  );

  return jobResponse(outcome);
}

export const Route = createFileRoute("/api/public/hooks/water-daily-report")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
