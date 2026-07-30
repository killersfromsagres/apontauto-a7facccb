// Item 17 — avisos automáticos baseados em tempo (cron a cada 30 min).
// Cobre: lembrete de início, rota não iniciada, parada atrasada,
// troca de filtro atrasada e filtro próximo do vencimento.
import { createFileRoute } from "@tanstack/react-router";

const TZ = "America/Sao_Paulo";
const MODULO = "abastecimento-agua";

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
function minutosDoDiaSP(): number {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  const [h, m] = p.split(":").map(Number);
  return h * 60 + m;
}
function paraMinutos(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
}

type Admin = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

interface Aviso {
  evento: string;
  titulo: string;
  corpo: string;
  categoria: string;
  severidade: string;
  deepLink: string;
  chave: string;
  requiresAck?: boolean;
}

async function publicar(admin: any, a: Aviso): Promise<boolean> {
  const { data: existente } = await admin
    .from("notifications")
    .select("id")
    .eq("metadata->>dedupe", a.chave)
    .gt("created_at", new Date(Date.now() - 12 * 3600_000).toISOString())
    .limit(1)
    .maybeSingle();
  if (existente) return false;

  const { data: nova, error } = await admin
    .from("notifications")
    .insert({
      title: a.titulo,
      body: a.corpo,
      category: a.categoria,
      severity: a.severidade,
      module_key: MODULO,
      target_mode: "modules",
      status: "published",
      deep_link: a.deepLink,
      requires_ack: Boolean(a.requiresAck),
      metadata: { dedupe: a.chave, evento: a.evento, origem: "cron" },
    })
    .select("id")
    .single();
  if (error || !nova) return false;

  await admin
    .from("notification_targets")
    .insert({ notification_id: nova.id, module_key: MODULO });
  return true;
}

async function handle() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const hoje = hojeSP();
  const agora = minutosDoDiaSP();
  let enviados = 0;

  // --- Rotas do dia -------------------------------------------------
  const { data: rotas } = await admin
    .from("agua_rotas")
    .select("id, data, turno, equipe, horario_previsto, status, iniciada_em")
    .eq("data", hoje);

  for (const r of rotas ?? []) {
    const previsto = paraMinutos(r.horario_previsto);
    const ativa = ["pronta", "atribuida", "planejada"].includes(String(r.status));
    if (previsto == null || !ativa) continue;

    // lembrete 30 min antes
    if (agora >= previsto - 30 && agora < previsto) {
      if (
        await publicar(admin, {
          evento: "lembrete_inicio",
          titulo: "Lembrete: início da rota de água",
          corpo: `A rota ${r.turno} (${r.equipe}) começa às ${r.horario_previsto}.`,
          categoria: "informacao",
          severidade: "info",
          deepLink: "/abastecimento/agua/rota",
          chave: `lembrete_inicio:${r.id}`,
        })
      )
        enviados++;
    }

    // não iniciada 45 min depois do previsto
    if (!r.iniciada_em && agora >= previsto + 45) {
      if (
        await publicar(admin, {
          evento: "rota_nao_iniciada",
          titulo: "Rota de água não iniciada",
          corpo: `A rota ${r.turno} (${r.equipe}) estava prevista para ${r.horario_previsto} e ainda não foi iniciada.`,
          categoria: "critico",
          severidade: "critical",
          deepLink: "/abastecimento/agua/rotas",
          chave: `rota_nao_iniciada:${r.id}`,
          requiresAck: true,
        })
      )
        enviados++;
    }
  }

  // --- Paradas atrasadas (em atendimento há mais de 90 min) ----------
  const limite = new Date(Date.now() - 90 * 60_000).toISOString();
  const { data: paradas } = await admin
    .from("agua_visitas")
    .select("id, status, atendimento_em, deslocamento_em")
    .eq("data", hoje)
    .in("status", ["em_atendimento", "em_deslocamento"]);

  for (const v of paradas ?? []) {
    const marco = v.atendimento_em ?? v.deslocamento_em;
    if (!marco || marco > limite) continue;
    if (
      await publicar(admin, {
        evento: "parada_atrasada",
        titulo: "Parada de água atrasada",
        corpo: "Uma parada está em andamento há mais de 90 minutos sem conclusão.",
        categoria: "atencao",
        severidade: "warn",
        deepLink: "/abastecimento/agua/rota",
        chave: `parada_atrasada:${v.id}`,
      })
    )
      enviados++;
  }

  // --- Filtros: troca atrasada e próximo do vencimento ---------------
  const em15 = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
  const { data: ativos } = await admin
    .from("agua_filtro_ativos")
    .select("id, predio, andar_setor, tipo_filtro, proxima_troca")
    .not("proxima_troca", "is", null)
    .lte("proxima_troca", em15);

  for (const a of ativos ?? []) {
    const venc = String(a.proxima_troca).slice(0, 10);
    const atrasado = venc < hoje;
    const local = [a.predio, a.andar_setor].filter(Boolean).join(" · ") || "Ponto";
    if (
      await publicar(admin, {
        evento: atrasado ? "filtro_troca_atrasada" : "filtro_proximo_vencimento",
        titulo: atrasado ? "Troca de filtro atrasada" : "Filtro próximo do vencimento",
        corpo: `${local} — filtro ${a.tipo_filtro ?? ""} com troca prevista para ${venc}.`,
        categoria: atrasado ? "critico" : "atencao",
        severidade: atrasado ? "critical" : "warn",
        deepLink: "/abastecimento/agua/filtros",
        chave: `${atrasado ? "filtro_troca_atrasada" : "filtro_proximo_vencimento"}:${a.id}:${venc}`,
      })
    )
      enviados++;
  }

  return Response.json({ ok: true, enviados, data: hoje });
}

export const Route = createFileRoute("/api/public/hooks/agua-notificacoes")({
  server: {
    handlers: {
      POST: async () => handle(),
      GET: async () => handle(),
    },
  },
});
