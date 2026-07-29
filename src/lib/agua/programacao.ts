// Programação semanal, exceções, feriados, rotas e geração automática (item 7).
// Timezone operacional: America/Sao_Paulo.

import { supabase } from "@/integrations/supabase/client";
import { limparTexto } from "@/lib/agua/normalize";

const db = supabase as unknown as { from: (t: string) => any; rpc: (fn: string, args?: any) => any };

export const TZ = "America/Sao_Paulo";

export const TURNOS = [
  { key: "manha", label: "Manhã" },
  { key: "tarde", label: "Tarde" },
  { key: "integral", label: "Integral" },
] as const;

export const TURNO_LABEL: Record<string, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  integral: "Integral",
};

export const ROTA_STATUS_LABEL: Record<string, string> = {
  planejada: "Planejada",
  pronta: "Pronta para iniciar",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

/** Data de hoje no fuso operacional (YYYY-MM-DD). */
export function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function addDias(dataISO: string, dias: number): string {
  const [y, m, d] = dataISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

/** Segunda-feira da semana da data informada. */
export function inicioSemana(dataISO: string): string {
  const [y, m, d] = dataISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const iso = dt.getUTCDay() === 0 ? 7 : dt.getUTCDay();
  return addDias(dataISO, 1 - iso);
}

export function dataDoDia(semanaISO: string, diaSemana: number): string {
  return addDias(semanaISO, diaSemana - 1);
}

export function formatarData(dataISO: string): string {
  const [y, m, d] = dataISO.split("-");
  return `${d}/${m}/${y}`;
}

/* ------------------------------------------------------------------ */
/* Programação semanal                                                 */
/* ------------------------------------------------------------------ */

export interface ProgramacaoLinha {
  id: string;
  ponto_id: string;
  dia_semana: number;
  ordem: number;
  bags: number;
  turno: string;
  equipe: string | null;
  template_key: string;
  ativo: boolean;
}

const PROG_FIELDS =
  "id, ponto_id, dia_semana, ordem, bags, turno, equipe, template_key, ativo";

export async function listProgramacaoCompleta(): Promise<ProgramacaoLinha[]> {
  const { data, error } = await db
    .from("agua_programacao")
    .select(PROG_FIELDS)
    .order("dia_semana")
    .order("ordem");
  if (error) throw error;
  return (data ?? []) as ProgramacaoLinha[];
}

export async function upsertProgramacao(
  rows: Array<Partial<ProgramacaoLinha> & { ponto_id: string; dia_semana: number }>,
): Promise<void> {
  const { error } = await db
    .from("agua_programacao")
    .upsert(rows, { onConflict: "ponto_id,dia_semana" });
  if (error) throw error;
}

export async function atualizarProgramacao(
  id: string,
  patch: Partial<ProgramacaoLinha>,
): Promise<void> {
  const { error } = await db.from("agua_programacao").update(patch).eq("id", id);
  if (error) throw error;
}

/** Edição em lote — aplica o mesmo patch a várias linhas. */
export async function atualizarProgramacaoEmLote(
  ids: string[],
  patch: Partial<ProgramacaoLinha>,
): Promise<void> {
  if (!ids.length) return;
  const { error } = await db.from("agua_programacao").update(patch).in("id", ids);
  if (error) throw error;
}

export async function removerProgramacao(id: string): Promise<void> {
  const { error } = await db.from("agua_programacao").delete().eq("id", id);
  if (error) throw error;
}

/** Reordenação (drag-and-drop no desktop, subir/descer no mobile). */
export async function salvarOrdem(itens: Array<{ id: string; ordem: number }>): Promise<void> {
  for (const item of itens) {
    const { error } = await db
      .from("agua_programacao")
      .update({ ordem: item.ordem })
      .eq("id", item.id);
    if (error) throw error;
  }
}

/**
 * Duplica a programação de um dia para outro (base para "duplicar semana"
 * e para templates de rota). Não sobrescreve paradas já existentes.
 */
export async function duplicarDia(origem: number, destino: number): Promise<number> {
  const todas = await listProgramacaoCompleta();
  const doOrigem = todas.filter((p) => p.dia_semana === origem && p.ativo);
  const jaTem = new Set(todas.filter((p) => p.dia_semana === destino).map((p) => p.ponto_id));
  const novas = doOrigem
    .filter((p) => !jaTem.has(p.ponto_id))
    .map((p) => ({
      ponto_id: p.ponto_id,
      dia_semana: destino,
      ordem: p.ordem,
      bags: p.bags,
      turno: p.turno,
      equipe: p.equipe,
      template_key: p.template_key,
      origem: "duplicacao",
      ativo: true,
    }));
  if (!novas.length) return 0;
  const { error } = await db.from("agua_programacao").insert(novas);
  if (error) throw error;
  return novas.length;
}

/* ------------------------------------------------------------------ */
/* Feriados e bloqueios                                                */
/* ------------------------------------------------------------------ */

export interface Feriado {
  id: string;
  data: string;
  descricao: string;
  tipo: "feriado" | "bloqueio";
  bloqueia_geracao: boolean;
}

export async function listFeriados(): Promise<Feriado[]> {
  const { data, error } = await db
    .from("agua_feriados")
    .select("id, data, descricao, tipo, bloqueia_geracao")
    .order("data", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as Feriado[];
}

export async function criarFeriado(input: Omit<Feriado, "id">): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await db.from("agua_feriados").insert({
    ...input,
    descricao: limparTexto(input.descricao),
    criado_por: u.user?.id ?? null,
  });
  if (error) throw error;
}

export async function removerFeriado(id: string): Promise<void> {
  const { error } = await db.from("agua_feriados").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Exceções por data                                                   */
/* ------------------------------------------------------------------ */

export interface Excecao {
  id: string;
  ponto_id: string;
  data: string;
  tipo: "remover" | "extra";
  bags: number;
  turno: string;
  motivo: string | null;
}

export async function listExcecoes(inicio: string, fim: string): Promise<Excecao[]> {
  const { data, error } = await db
    .from("agua_excecoes")
    .select("id, ponto_id, data, tipo, bags, turno, motivo")
    .gte("data", inicio)
    .lte("data", fim)
    .order("data");
  if (error) throw error;
  return (data ?? []) as Excecao[];
}

export async function criarExcecao(input: Omit<Excecao, "id">): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await db.from("agua_excecoes").upsert(
    {
      ...input,
      motivo: limparTexto(input.motivo ?? "") || null,
      criado_por: u.user?.id ?? null,
    },
    { onConflict: "ponto_id,data,tipo" },
  );
  if (error) throw error;
}

export async function removerExcecao(id: string): Promise<void> {
  const { error } = await db.from("agua_excecoes").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Rotas diárias (atribuição)                                          */
/* ------------------------------------------------------------------ */

export interface Rota {
  id: string;
  data: string;
  turno: string;
  equipe: string;
  template_key: string;
  colaborador_principal: string | null;
  colaborador_secundario: string | null;
  veiculo: string | null;
  supervisor: string | null;
  horario_previsto: string | null;
  bags_carregadas: number | null;
  observacao: string | null;
  status: string;
  motivo_cancelamento: string | null;
  versao: number;
  iniciada_em: string | null;
  finalizada_em: string | null;
}

const ROTA_FIELDS =
  "id, data, turno, equipe, template_key, colaborador_principal, colaborador_secundario, veiculo, supervisor, horario_previsto, bags_carregadas, observacao, status, motivo_cancelamento, versao, iniciada_em, finalizada_em";

export async function listRotas(inicio: string, fim: string): Promise<Rota[]> {
  const { data, error } = await db
    .from("agua_rotas")
    .select(ROTA_FIELDS)
    .gte("data", inicio)
    .lte("data", fim)
    .order("data", { ascending: false })
    .order("turno");
  if (error) throw error;
  return (data ?? []) as Rota[];
}

/**
 * Salva a atribuição. Depois da primeira execução toda mudança vira versão:
 * o histórico nunca é apagado.
 */
export async function salvarRota(
  rota: Rota,
  patch: Partial<Rota>,
  motivo?: string,
): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const usuario = u.user?.id ?? null;
  const jaIniciou = Boolean(rota.iniciada_em);

  const { error: vErr } = await db.from("agua_rota_versoes").insert({
    rota_id: rota.id,
    versao: rota.versao,
    snapshot: rota,
    motivo: limparTexto(motivo ?? "") || null,
    usuario_id: usuario,
  });
  if (vErr) throw vErr;

  const { error } = await db
    .from("agua_rotas")
    .update({
      ...patch,
      versao: jaIniciou ? rota.versao + 1 : rota.versao,
      atualizado_por: usuario,
    })
    .eq("id", rota.id);
  if (error) throw error;
}

export async function cancelarRota(rota: Rota, motivo: string): Promise<void> {
  const texto = limparTexto(motivo);
  if (texto.length < 5) throw new Error("Informe uma justificativa para o cancelamento.");
  await salvarRota(rota, { status: "cancelada", motivo_cancelamento: texto }, texto);
}

export interface RotaVersao {
  id: string;
  rota_id: string;
  versao: number;
  snapshot: Record<string, unknown>;
  motivo: string | null;
  criado_em: string;
}

export async function listVersoesRota(rotaId: string): Promise<RotaVersao[]> {
  const { data, error } = await db
    .from("agua_rota_versoes")
    .select("id, rota_id, versao, snapshot, motivo, criado_em")
    .eq("rota_id", rotaId)
    .order("versao", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RotaVersao[];
}

/* ------------------------------------------------------------------ */
/* Checklist de partida (7.3)                                          */
/* ------------------------------------------------------------------ */

export interface ChecklistPartidaItem {
  chave: string;
  label: string;
  ok: boolean;
  detalhe: string;
}

export function checklistPartida(args: {
  rota: Rota;
  paradas: number;
  veiculoDisponivel: boolean;
  checklistValido: boolean;
  bloqueioCritico: boolean;
  offlinePronto: boolean;
}): ChecklistPartidaItem[] {
  const { rota, paradas, veiculoDisponivel, checklistValido, bloqueioCritico, offlinePronto } = args;
  return [
    {
      chave: "veiculo",
      label: "Veículo disponível",
      ok: Boolean(rota.veiculo) && veiculoDisponivel,
      detalhe: rota.veiculo ? `Veículo ${rota.veiculo}` : "Nenhum veículo atribuído",
    },
    {
      chave: "checklist",
      label: "Checklist veicular válido",
      ok: checklistValido,
      detalhe: checklistValido ? "Checklist do dia registrado" : "Sem checklist válido hoje",
    },
    {
      chave: "bloqueio",
      label: "Sem bloqueio crítico",
      ok: !bloqueioCritico,
      detalhe: bloqueioCritico ? "Veículo bloqueado por item crítico" : "Nenhum bloqueio ativo",
    },
    {
      chave: "bags",
      label: "Quantidade carregada informada",
      ok: (rota.bags_carregadas ?? 0) > 0,
      detalhe: `${rota.bags_carregadas ?? 0} bag(s) carregada(s)`,
    },
    {
      chave: "atribuicao",
      label: "Rota atribuída",
      ok: Boolean(rota.colaborador_principal) && paradas > 0,
      detalhe: rota.colaborador_principal
        ? `${paradas} parada(s) para ${rota.colaborador_principal}`
        : "Sem colaborador principal",
    },
    {
      chave: "offline",
      label: "Dados offline baixados",
      ok: offlinePronto,
      detalhe: offlinePronto ? "Cache local pronto" : "Abra a Rota do Dia para baixar os dados",
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Geração automática                                                  */
/* ------------------------------------------------------------------ */

export interface GeracaoJob {
  id: string;
  data_alvo: string;
  origem: string;
  status: string;
  rotas_criadas: number;
  visitas_criadas: number;
  mensagem: string | null;
  criado_em: string;
}

export async function listGeracaoJobs(): Promise<GeracaoJob[]> {
  const { data, error } = await db
    .from("agua_geracao_jobs")
    .select("id, data_alvo, origem, status, rotas_criadas, visitas_criadas, mensagem, criado_em")
    .order("criado_em", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as GeracaoJob[];
}

/** Geração manual/idempotente — rodar de novo não duplica nada. */
export async function gerarRotas(dataISO: string, origem = "manual"): Promise<any> {
  const { data, error } = await db.rpc("agua_gerar_rotas", {
    p_data: dataISO,
    p_origem: origem,
  });
  if (error) throw error;
  return data;
}
