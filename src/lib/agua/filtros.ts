// Filtros de água: cadastro de pontos de filtro, workflow completo das
// solicitações, conclusão com evidências e agenda preventiva.
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

export type FiltroCondicao = "boa" | "regular" | "ruim" | "critica";

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
  /* 12.1 — ficha completa do ponto de filtro */
  predio: string | null;
  andar_setor: string | null;
  espaco: string | null;
  tipo_equipamento: string | null;
  fabricante: string | null;
  modelo_elemento: string | null;
  patrimonio: string | null;
  condicao_atual: FiltroCondicao;
  foto_url: string | null;
  qr_token: string;
  responsavel: string | null;
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

export interface FiltroPreventiva {
  id: string;
  ativo_id: string;
  prevista_para: string;
  status: "programada" | "vencendo" | "vencido" | "concluido" | "cancelado";
  justificativa: string | null;
  reagendada_de: string | null;
  solicitacao_id: string | null;
  concluida_em: string | null;
  criado_em: string;
}

export const TIPOS_FILTRO = ["refil", "vela", "membrana", "carvão ativado", "outro"] as const;

export const TIPOS_EQUIPAMENTO = [
  "purificador",
  "bebedouro",
  "filtro de parede",
  "central de filtragem",
  "outro",
] as const;

export const CONDICOES: Array<{ valor: FiltroCondicao; label: string }> = [
  { valor: "boa", label: "Boa" },
  { valor: "regular", label: "Regular" },
  { valor: "ruim", label: "Ruim" },
  { valor: "critica", label: "Crítica" },
];

/** Motivos padronizados da abertura (item 12.2). */
export const MOTIVOS_SOLICITACAO = [
  { valor: "gosto_odor", label: "Água com gosto/odor" },
  { valor: "vazao", label: "Redução de vazão" },
  { valor: "vazamento", label: "Vazamento" },
  { valor: "vencido", label: "Filtro vencido" },
  { valor: "dano_fisico", label: "Dano físico" },
  { valor: "sem_agua", label: "Ausência de água" },
  { valor: "outro", label: "Outra causa" },
] as const;

export const MOTIVO_LABEL: Record<string, string> = Object.fromEntries(
  MOTIVOS_SOLICITACAO.map((m) => [m.valor, m.label]),
);

export const EVENTO_LABEL: Record<FiltroEvento["tipo"], string> = {
  abertura: "Solicitação aberta",
  triagem: "Triagem",
  programacao: "Programada",
  execucao: "Em execução",
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

/** Situações que encerram o ciclo (não consomem SLA). */
export const SITUACOES_ENCERRADAS: FiltroSituacao[] = [
  "concluida",
  "validada",
  "cancelada",
  "rejeitada",
];

/** Situações consideradas "em aberto" para bloquear duplicidade preventiva. */
export const SITUACOES_ABERTAS: FiltroSituacao[] = [
  "aberta",
  "solicitada",
  "em_triagem",
  "aprovada",
  "aguardando_material",
  "programada",
  "em_deslocamento",
  "em_execucao",
  "em_atendimento",
  "reaberta",
];

/* ------------------------------------------------------------------ */
/* Regras puras                                                        */
/* ------------------------------------------------------------------ */

export type SlaEstado = "no_prazo" | "atencao" | "vencido" | "encerrado";

/** Transições permitidas do workflow (item 12.3). */
export const TRANSICOES: Record<FiltroSituacao, FiltroSituacao[]> = {
  aberta: ["em_triagem", "aprovada", "rejeitada", "cancelada"],
  solicitada: ["em_triagem", "aprovada", "rejeitada", "cancelada"],
  em_triagem: ["aprovada", "rejeitada", "aguardando_material", "cancelada"],
  aprovada: ["aguardando_material", "programada", "cancelada"],
  aguardando_material: ["programada", "cancelada"],
  programada: ["em_deslocamento", "em_execucao", "aguardando_material", "cancelada"],
  em_deslocamento: ["em_execucao", "cancelada"],
  em_execucao: ["concluida", "aguardando_material", "cancelada"],
  em_atendimento: ["concluida", "aguardando_material", "cancelada"],
  concluida: ["validada", "reaberta"],
  validada: [],
  reaberta: ["em_triagem", "aprovada", "programada", "cancelada"],
  rejeitada: ["reaberta"],
  cancelada: [],
};

export function podeTransicionar(de: FiltroSituacao, para: FiltroSituacao): boolean {
  return (TRANSICOES[de] ?? []).includes(para);
}

/** Classifica o SLA da solicitação (atenção a partir de 75% do prazo). */
export function estadoSla(
  solicitacao: { situacao: FiltroSituacao; criado_em: string; vence_em?: string | null },
  agora = new Date(),
): { estado: SlaEstado; horasRestantes: number } {
  if (SITUACOES_ENCERRADAS.includes(solicitacao.situacao)) {
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

/** Situação preventiva do ativo, usada na agenda (item 12.6). */
export function statusPreventivo(
  ativo: Pick<FiltroAtivo, "proxima_troca">,
  alertaDias = 30,
  hoje = new Date(),
): "sem_data" | "vencido" | "vencendo" | "em_dia" {
  const dias = diasParaTroca(ativo, hoje);
  if (dias === null) return "sem_data";
  if (dias < 0) return "vencido";
  return dias <= alertaDias ? "vencendo" : "em_dia";
}

/** Reincidência: mesmo ativo com mais de uma solicitação na janela de dias. */
export function ativosReincidentes(
  solicitacoes: Array<{ ativo_id: string | null; criado_em: string }>,
  janelaDias = 90,
  hoje = new Date(),
): Map<string, number> {
  const limite = hoje.getTime() - janelaDias * 86_400_000;
  const mapa = new Map<string, number>();
  for (const s of solicitacoes) {
    if (!s.ativo_id) continue;
    if (new Date(s.criado_em).getTime() < limite) continue;
    mapa.set(s.ativo_id, (mapa.get(s.ativo_id) ?? 0) + 1);
  }
  return new Map([...mapa].filter(([, n]) => n > 1));
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

/** Validação da abertura de solicitação (item 12.2). */
export function validarSolicitacao(input: {
  ponto_id?: string;
  motivos?: string[];
  motivo_outro?: string | null;
  descricao?: string | null;
}): string | null {
  if (!input.ponto_id) return "Selecione o prédio/ponto.";
  if (!input.motivos?.length) return "Selecione ao menos um motivo.";
  if (input.motivos.includes("outro") && !input.motivo_outro?.trim()) {
    return "Descreva a outra causa.";
  }
  return null;
}

/** Validação da conclusão (item 12.5): exige foto antes e depois. */
export function validarConclusao(input: {
  foto_antes_url?: string | null;
  foto_depois_url?: string | null;
  filtro_utilizado?: string | null;
  quantidade?: number | null;
}): string | null {
  if (!input.foto_antes_url) return "Envie a foto ANTES da troca.";
  if (!input.foto_depois_url) return "Envie a foto DEPOIS da troca.";
  if (!input.filtro_utilizado?.trim()) return "Informe o filtro utilizado.";
  const q = Number(input.quantidade ?? 1);
  if (!Number.isInteger(q) || q < 1) return "Quantidade deve ser um número inteiro maior que zero.";
  return null;
}

/** Calcula a próxima troca a partir da conclusão e da periodicidade. */
export function calcularProximaTroca(dataTroca: string, periodicidadeDias: number): string {
  const base = new Date(`${dataTroca}T00:00:00`);
  base.setDate(base.getDate() + Math.max(1, periodicidadeDias));
  return base.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Acesso a dados — ativos                                             */
/* ------------------------------------------------------------------ */

const ATIVO_FIELDS = [
  "id, ponto_id, codigo, marca, modelo, numero_serie, tipo_filtro, local_instalacao",
  "instalado_em, ultima_troca, periodicidade_dias, proxima_troca, situacao, observacao, criado_em",
  "predio, andar_setor, espaco, tipo_equipamento, fabricante, modelo_elemento, patrimonio",
  "condicao_atual, foto_url, qr_token, responsavel",
].join(", ");

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
  const texto = (v: string | null | undefined) => v?.trim() || null;
  const payload = {
    ponto_id: input.ponto_id,
    codigo: texto(input.codigo),
    marca: texto(input.marca),
    modelo: texto(input.modelo),
    numero_serie: texto(input.numero_serie),
    tipo_filtro: input.tipo_filtro,
    local_instalacao: texto(input.local_instalacao),
    instalado_em: input.instalado_em || null,
    ultima_troca: input.ultima_troca || null,
    periodicidade_dias: Number(input.periodicidade_dias),
    situacao: input.situacao ?? "ativo",
    observacao: texto(input.observacao),
    predio: texto(input.predio),
    andar_setor: texto(input.andar_setor),
    espaco: texto(input.espaco),
    tipo_equipamento: texto(input.tipo_equipamento),
    fabricante: texto(input.fabricante),
    modelo_elemento: texto(input.modelo_elemento),
    patrimonio: texto(input.patrimonio),
    condicao_atual: input.condicao_atual ?? "boa",
    foto_url: texto(input.foto_url),
    responsavel: texto(input.responsavel),
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

/* ------------------------------------------------------------------ */
/* Acesso a dados — trilha                                             */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Workflow (12.3 a 12.5)                                              */
/* ------------------------------------------------------------------ */

async function patch(id: string, payload: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("agua_filtro_solicitacoes").update(payload).eq("id", id);
  if (error) throw error;
}

export async function mudarSituacao(
  id: string,
  de: FiltroSituacao,
  para: FiltroSituacao,
): Promise<void> {
  if (!podeTransicionar(de, para)) {
    throw new Error("Transição não permitida para esta etapa do fluxo.");
  }
  await patch(id, { situacao: para });
}

export async function rejeitarSolicitacao(id: string, motivo: string): Promise<void> {
  const texto = motivo.trim();
  if (!texto) throw new Error("Informe o motivo da rejeição.");
  await patch(id, { situacao: "rejeitada", motivo_rejeicao: texto.slice(0, 500) });
}

/** 12.4 — programação da troca. */
export async function programarTroca(
  id: string,
  input: {
    responsavel_nome: string;
    responsavel_2_nome?: string | null;
    programada_em: string;
    veiculo_id?: string | null;
    material_descricao?: string | null;
    material_quantidade?: number | null;
    material_reservado?: boolean;
    prioridade?: FiltroPrioridade;
    os_relacionada?: string | null;
    observacao_programacao?: string | null;
    lembrete_em?: string | null;
    incluir_na_rota?: boolean;
  },
): Promise<void> {
  if (!input.responsavel_nome?.trim()) throw new Error("Defina o responsável pela troca.");
  if (!input.programada_em) throw new Error("Defina a data e o horário da troca.");

  await patch(id, {
    situacao: "programada",
    responsavel_nome: input.responsavel_nome.trim(),
    responsavel_2_nome: input.responsavel_2_nome?.trim() || null,
    programada_em: new Date(input.programada_em).toISOString(),
    prevista_para: input.programada_em.slice(0, 10),
    veiculo_id: input.veiculo_id || null,
    material_descricao: input.material_descricao?.trim() || null,
    material_quantidade: input.material_quantidade ?? null,
    material_reservado: Boolean(input.material_reservado),
    incluir_na_rota: Boolean(input.incluir_na_rota),
    os_relacionada: input.os_relacionada?.trim() || null,
    observacao_programacao: input.observacao_programacao?.trim() || null,
    lembrete_em: input.lembrete_em ? new Date(input.lembrete_em).toISOString() : null,
    ...(input.prioridade ? { prioridade: input.prioridade } : {}),
  });
}

/**
 * 12.5 — conclusão com evidências. Atualiza a última troca e a próxima troca
 * prevista do ativo (o trigger cuida da última troca; aqui gravamos a data
 * prevista quando o técnico ajusta manualmente).
 */
export async function concluirTroca(
  id: string,
  input: {
    ativo_id?: string | null;
    foto_antes_url: string;
    foto_depois_url: string;
    filtro_utilizado: string;
    lote?: string | null;
    quantidade?: number | null;
    colaborador?: string | null;
    observacao?: string | null;
    descarte_destino?: string | null;
    condicao_apos?: FiltroCondicao | null;
    nova_proxima_troca?: string | null;
    assinatura_url?: string | null;
  },
): Promise<void> {
  const erro = validarConclusao({
    foto_antes_url: input.foto_antes_url,
    foto_depois_url: input.foto_depois_url,
    filtro_utilizado: input.filtro_utilizado,
    quantidade: input.quantidade ?? 1,
  });
  if (erro) throw new Error(erro);

  const { data: userData } = await supabase.auth.getUser();
  const agora = new Date().toISOString();

  await patch(id, {
    situacao: "concluida",
    concluida_em: agora,
    foto_antes_url: input.foto_antes_url,
    foto_depois_url: input.foto_depois_url,
    foto_conclusao_url: input.foto_depois_url,
    filtro_utilizado: input.filtro_utilizado.trim(),
    lote: input.lote?.trim() || null,
    quantidade_utilizada: input.quantidade ?? 1,
    colaborador_conclusao: input.colaborador?.trim() || null,
    observacao_conclusao: input.observacao?.trim() || null,
    descarte_destino: input.descarte_destino?.trim() || null,
    condicao_apos: input.condicao_apos ?? null,
    nova_proxima_troca: input.nova_proxima_troca || null,
    assinatura_url: input.assinatura_url || null,
    atendida_por: userData.user?.id ?? null,
  });

  if (input.ativo_id && input.nova_proxima_troca) {
    // Mantém o ciclo do ativo alinhado com a data acordada em campo.
    const { error } = await db
      .from("agua_filtro_ativos")
      .update({ proxima_troca: input.nova_proxima_troca })
      .eq("id", input.ativo_id);
    if (error) throw error;
  }

  await marcarPreventivaConcluida(id);
}

/** Validação/pesquisa de satisfação do solicitante (12.7). */
export async function validarPeloSolicitante(
  id: string,
  input: { nota?: number | null; comentario?: string | null } = {},
): Promise<void> {
  await patch(id, {
    situacao: "validada",
    validada_em: new Date().toISOString(),
    avaliacao_nota: input.nota ?? null,
    avaliacao_comentario: input.comentario?.trim() || null,
  });
}

export async function reabrirSolicitacao(id: string, motivo: string): Promise<void> {
  const texto = motivo.trim();
  if (!texto) throw new Error("Explique o motivo da reabertura.");
  await patch(id, { situacao: "reaberta", descricao: texto.slice(0, 1000) });
}

export async function cancelarSolicitacao(id: string, motivo: string): Promise<void> {
  const texto = motivo.trim();
  if (!texto) throw new Error("Informe o motivo do cancelamento.");
  await patch(id, { situacao: "cancelada", motivo_cancelamento: texto.slice(0, 500) });
}

/* ------------------------------------------------------------------ */
/* Agenda preventiva (12.6)                                            */
/* ------------------------------------------------------------------ */

const PREV_FIELDS =
  "id, ativo_id, prevista_para, status, justificativa, reagendada_de, solicitacao_id, concluida_em, criado_em";

export async function listPreventivas(): Promise<FiltroPreventiva[]> {
  const { data, error } = await db
    .from("agua_filtro_preventivas")
    .select(PREV_FIELDS)
    .order("prevista_para", { ascending: true })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as FiltroPreventiva[];
}

/** Cria as tarefas preventivas faltantes para os ativos dentro da janela. */
export async function gerarAgendaPreventiva(
  ativos: FiltroAtivo[],
  existentes: FiltroPreventiva[],
  janelaDias = 60,
): Promise<number> {
  const jaTem = new Set(
    existentes
      .filter((p) => p.status !== "cancelado")
      .map((p) => `${p.ativo_id}|${p.prevista_para}`),
  );
  const alvo = ativosParaPreventiva(ativos, janelaDias).filter(
    (a) => a.proxima_troca && !jaTem.has(`${a.id}|${a.proxima_troca}`),
  );
  if (!alvo.length) return 0;

  const { data: userData } = await supabase.auth.getUser();
  const { error } = await db.from("agua_filtro_preventivas").insert(
    alvo.map((a) => ({
      ativo_id: a.id,
      prevista_para: a.proxima_troca,
      status: a.dias <= 0 ? "vencido" : "programada",
      criado_por: userData.user?.id ?? null,
    })),
  );
  if (error) throw error;
  return alvo.length;
}

/** Antecipa ou adia uma preventiva com justificativa obrigatória. */
export async function reagendarPreventiva(
  preventiva: FiltroPreventiva,
  novaData: string,
  justificativa: string,
): Promise<void> {
  if (!novaData) throw new Error("Escolha a nova data.");
  if (!justificativa.trim()) throw new Error("Justifique a antecipação/adiamento.");
  const { error } = await db
    .from("agua_filtro_preventivas")
    .update({
      prevista_para: novaData,
      reagendada_de: preventiva.prevista_para,
      justificativa: justificativa.trim().slice(0, 500),
      status: "programada",
    })
    .eq("id", preventiva.id);
  if (error) throw error;
}

/** Abre a solicitação de troca a partir de uma tarefa preventiva. */
export async function abrirSolicitacaoPreventiva(
  preventiva: FiltroPreventiva,
  ativo: FiltroAtivo,
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const dias = diasParaTroca(ativo) ?? 0;
  const { data, error } = await db
    .from("agua_filtro_solicitacoes")
    .insert({
      ponto_id: ativo.ponto_id,
      ativo_id: ativo.id,
      tipo: "troca",
      prioridade: dias <= 0 ? "alta" : "media",
      origem: "preventiva",
      situacao: "solicitada",
      predio: ativo.predio,
      andar_setor: ativo.andar_setor,
      espaco: ativo.espaco,
      motivos: ["vencido"],
      descricao: `Troca preventiva (${ativo.tipo_filtro}) prevista para ${preventiva.prevista_para}.`,
      prevista_para: preventiva.prevista_para,
      criado_por: userData.user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: upErr } = await db
    .from("agua_filtro_preventivas")
    .update({ solicitacao_id: data.id })
    .eq("id", preventiva.id);
  if (upErr) throw upErr;
}

async function marcarPreventivaConcluida(solicitacaoId: string): Promise<void> {
  await db
    .from("agua_filtro_preventivas")
    .update({ status: "concluido", concluida_em: new Date().toISOString() })
    .eq("solicitacao_id", solicitacaoId);
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
    situacao: "solicitada",
    predio: a.predio,
    andar_setor: a.andar_setor,
    espaco: a.espaco,
    motivos: ["vencido"],
    descricao: `Troca preventiva (${a.tipo_filtro}) — prevista para ${a.proxima_troca}.`,
    prevista_para: a.proxima_troca,
    criado_por: userData.user?.id ?? null,
  }));

  const { error } = await db.from("agua_filtro_solicitacoes").insert(rows);
  if (error) throw error;
  return rows.length;
}
