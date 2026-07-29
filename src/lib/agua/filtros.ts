// Filtros de água: cadastro de ativos, workflow de solicitações e SLA.
//
// O banco cuida do que precisa ser inviolável (SLA calculado, trilha de
// eventos append-only, próxima troca do ativo). Aqui ficam as regras puras
// usadas pela UI e pelos testes.

import { supabase } from "@/integrations/supabase/client";
import type { FiltroPrioridade, FiltroSituacao } from "@/lib/agua/api";

const db = supabase as unknown as { from: (t: string) => any };

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export interface FiltroAtivo {
  id: string;
  ponto_id: string;
  codigo: string | null;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  tipo_filtro: string;
  local_instalacao: string | null;
  instalado_em: string | null;
  ultima_troca: string | null;
  periodicidade_dias: number;
  proxima_troca: string | null;
  situacao: "ativo" | "inativo" | "substituido";
  observacao: string | null;
  criado_em: string;
}

export interface FiltroEvento {
  id: string;
  solicitacao_id: string;
  tipo:
    | "abertura"
    | "triagem"
    | "programacao"
    | "execucao"
    | "conclusao"
    | "cancelamento"
    | "comentario";
  situacao_anterior: string | null;
  situacao_nova: string | null;
  comentario: string | null;
  foto_url: string | null;
  criado_em: string;
}

export const TIPOS_FILTRO = ["refil", "vela", "membrana", "carvão ativado", "outro"] as const;

export const EVENTO_LABEL: Record<FiltroEvento["tipo"], string> = {
  abertura: "Solicitação aberta",
  triagem: "Triagem",
  programacao: "Programada",
  execucao: "Em atendimento",
  conclusao: "Concluída",
  cancelamento: "Cancelada",
  comentario: "Comentário",
};

/** SLA em horas por prioridade — espelha o trigger `tg_agua_filtro_sla`. */
export const SLA_HORAS: Record<FiltroPrioridade, number> = {
  alta: 24,
  media: 72,
  baixa: 168,
};

/* ------------------------------------------------------------------ */
/* Regras puras                                                        */
/* ------------------------------------------------------------------ */

export type SlaEstado = "no_prazo" | "atencao" | "vencido" | "encerrado";

/** Classifica o SLA da solicitação (atenção a partir de 75% do prazo). */
export function estadoSla(
  solicitacao: { situacao: FiltroSituacao; criado_em: string; vence_em?: string | null },
  agora = new Date(),
): { estado: SlaEstado; horasRestantes: number } {
  if (solicitacao.situacao === "concluida" || solicitacao.situacao === "cancelada") {
    return { estado: "encerrado", horasRestantes: 0 };
  }
  if (!solicitacao.vence_em) return { estado: "no_prazo", horasRestantes: Infinity };

  const vence = new Date(solicitacao.vence_em).getTime();
  const inicio = new Date(solicitacao.criado_em).getTime();
  const horasRestantes = (vence - agora.getTime()) / 3_600_000;

  if (horasRestantes <= 0) return { estado: "vencido", horasRestantes };

  const total = Math.max(1, vence - inicio);
  const decorrido = agora.getTime() - inicio;
  return { estado: decorrido / total >= 0.75 ? "atencao" : "no_prazo", horasRestantes };
}

/** Dias até a próxima troca preventiva (negativo = vencida). */
export function diasParaTroca(ativo: Pick<FiltroAtivo, "proxima_troca">, hoje = new Date()): number | null {
  if (!ativo.proxima_troca) return null;
  const alvo = new Date(`${ativo.proxima_troca}T00:00:00`);
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo.getTime() - base.getTime()) / 86_400_000);
}

/** Ativos que precisam de troca preventiva dentro da janela informada. */
export function ativosParaPreventiva(
  ativos: FiltroAtivo[],
  janelaDias = 30,
  hoje = new Date(),
): Array<FiltroAtivo & { dias: number }> {
  return ativos
    .filter((a) => a.situacao === "ativo")
    .map((a) => ({ ...a, dias: diasParaTroca(a, hoje) ?? Infinity }))
    .filter((a) => Number.isFinite(a.dias) && a.dias <= janelaDias)
    .sort((a, b) => a.dias - b.dias);
}

/** Validação do cadastro de ativo. Retorna a mensagem do primeiro erro. */
export function validarAtivo(input: Partial<FiltroAtivo>): string | null {
  if (!input.ponto_id) return "Selecione o ponto de entrega.";
  if (!input.tipo_filtro) return "Informe o tipo de filtro.";
  const p = Number(input.periodicidade_dias);
  if (!Number.isInteger(p) || p < 1 || p > 3650) {
    return "Periodicidade deve ser um número de dias entre 1 e 3650.";
  }
  if (!input.instalado_em && !input.ultima_troca) {
    return "Informe a data de instalação ou da última troca.";
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Acesso a dados                                                      */
/* ------------------------------------------------------------------ */

const ATIVO_FIELDS =
  "id, ponto_id, codigo, marca, modelo, numero_serie, tipo_filtro, local_instalacao, instalado_em, ultima_troca, periodicidade_dias, proxima_troca, situacao, observacao, criado_em";

export async function listFiltroAtivos(): Promise<FiltroAtivo[]> {
  const { data, error } = await db
    .from("agua_filtro_ativos")
    .select(ATIVO_FIELDS)
    .order("proxima_troca", { ascending: true, nullsFirst: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as FiltroAtivo[];
}

export async function salvarFiltroAtivo(input: Partial<FiltroAtivo> & { id?: string }): Promise<void> {
  const erro = validarAtivo(input);
  if (erro) throw new Error(erro);

  const { data: userData } = await supabase.auth.getUser();
  const payload = {
    ponto_id: input.ponto_id,
    codigo: input.codigo?.trim() || null,
    marca: input.marca?.trim() || null,
    modelo: input.modelo?.trim() || null,
    numero_serie: input.numero_serie?.trim() || null,
    tipo_filtro: input.tipo_filtro,
    local_instalacao: input.local_instalacao?.trim() || null,
    instalado_em: input.instalado_em || null,
    ultima_troca: input.ultima_troca || null,
    periodicidade_dias: Number(input.periodicidade_dias),
    situacao: input.situacao ?? "ativo",
    observacao: input.observacao?.trim() || null,
  };

  if (input.id) {
    const { error } = await db.from("agua_filtro_ativos").update(payload).eq("id", input.id);
    if (error) throw error;
    return;
  }
  const { error } = await db
    .from("agua_filtro_ativos")
    .insert({ ...payload, criado_por: userData.user?.id ?? null });
  if (error) throw error;
}

export async function listFiltroEventos(solicitacaoId: string): Promise<FiltroEvento[]> {
  const { data, error } = await db
    .from("agua_filtro_eventos")
    .select("id, solicitacao_id, tipo, situacao_anterior, situacao_nova, comentario, foto_url, criado_em")
    .eq("solicitacao_id", solicitacaoId)
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FiltroEvento[];
}

export async function comentarSolicitacao(solicitacaoId: string, comentario: string): Promise<void> {
  const texto = comentario.trim();
  if (!texto) throw new Error("Escreva um comentário.");
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await db.from("agua_filtro_eventos").insert({
    solicitacao_id: solicitacaoId,
    tipo: "comentario",
    comentario: texto.slice(0, 1000),
    autor: userData.user?.id ?? null,
  });
  if (error) throw error;
}

/** Conclui a solicitação exigindo evidência fotográfica. */
export async function concluirSolicitacao(
  id: string,
  input: { foto_url: string; observacao?: string | null },
): Promise<void> {
  if (!input.foto_url) throw new Error("Foto da conclusão é obrigatória.");
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await db
    .from("agua_filtro_solicitacoes")
    .update({
      situacao: "concluida",
      concluida_em: new Date().toISOString(),
      foto_conclusao_url: input.foto_url,
      observacao_conclusao: input.observacao?.trim() || null,
      atendida_por: userData.user?.id ?? null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function cancelarSolicitacao(id: string, motivo: string): Promise<void> {
  const texto = motivo.trim();
  if (!texto) throw new Error("Informe o motivo do cancelamento.");
  const { error } = await db
    .from("agua_filtro_solicitacoes")
    .update({ situacao: "cancelada", motivo_cancelamento: texto.slice(0, 500) })
    .eq("id", id);
  if (error) throw error;
}

/** Abre solicitações preventivas para os ativos vencidos/próximos do vencimento. */
export async function gerarPreventivas(
  ativos: FiltroAtivo[],
  abertasPorAtivo: Set<string>,
  janelaDias = 30,
): Promise<number> {
  const alvo = ativosParaPreventiva(ativos, janelaDias).filter((a) => !abertasPorAtivo.has(a.id));
  if (!alvo.length) return 0;

  const { data: userData } = await supabase.auth.getUser();
  const rows = alvo.map((a) => ({
    ponto_id: a.ponto_id,
    ativo_id: a.id,
    tipo: "troca",
    prioridade: (a.dias <= 0 ? "alta" : "media") as FiltroPrioridade,
    origem: "preventiva",
    descricao: `Troca preventiva (${a.tipo_filtro}) — prevista para ${a.proxima_troca}.`,
    prevista_para: a.proxima_troca,
    criado_por: userData.user?.id ?? null,
  }));

  const { error } = await db.from("agua_filtro_solicitacoes").insert(rows);
  if (error) throw error;
  return rows.length;
}
