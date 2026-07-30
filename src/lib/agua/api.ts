// Acesso a dados do módulo Entrega de Água (Frota e Abastecimento).
// Toda a programação vive no banco — nada é hardcoded nos componentes.

import { supabase } from "@/integrations/supabase/client";
import type { Divergencia, LeituraAgua } from "@/lib/agua/reader";
import {
  caixaTitulo,
  limparTexto,
  normalizarCodigo,
  normalizarTelefone,
} from "@/lib/agua/normalize";


// As tabelas novas ainda não constam nos tipos gerados.
const db = supabase as unknown as { from: (t: string) => any };

// Item 14 — os estados oficiais vivem em estados.ts (espelho dos enums do banco).
export {
  VISITA_STATUS,
  VISITA_STATUS_LABEL,
  VISITA_FINAIS,
  VISITA_TRANSICOES,
  podeTransicionarVisita,
  visitaAtendida,
} from "@/lib/agua/estados";
export type { VisitaStatus } from "@/lib/agua/estados";

import type { VisitaStatus } from "@/lib/agua/estados";



export const MOTIVOS_NAO_REALIZADA = [
  "Feriado",
  "Paralisação",
  "Prédio fechado",
  "Sem acesso",
  "Falta de bags",
  "Mudança excepcional de rota",
  "Outro",
];

export type PontoPrioridade = "baixa" | "media" | "alta" | "critica";

export const PONTO_PRIORIDADE_LABEL: Record<PontoPrioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

export const PONTO_FREQUENCIAS = [
  "Diária",
  "Semanal",
  "2x por semana",
  "3x por semana",
  "Quinzenal",
  "Mensal",
  "Sob demanda",
];

export interface Ponto {
  id: string;
  codigo: string;
  predio: string;
  andar: string;
  espaco: string;
  descricao: string | null;
  bags_padrao: number;
  bag_tipo: string | null;
  bag_capacidade_litros: number | null;
  estoque_minimo: number | null;
  frequencia: string | null;
  prioridade: PontoPrioridade;
  tempo_estimado_min: number | null;
  janela_inicio: string | null;
  janela_fim: string | null;
  ordem: number;
  responsavel: string | null;
  contato_telefone: string | null;
  acesso_observacoes: string | null;
  requer_epi: boolean;
  epi_descricao: string | null;
  veiculo: string | null;
  veiculo_recomendado: string | null;
  latitude: number | null;
  longitude: number | null;
  imagem_url: string | null;
  qr_code: string | null;
  observacao: string | null;
  ativo: boolean;
  criado_em?: string;
  atualizado_em?: string;
  atualizado_por?: string | null;
}


export interface ProgramacaoItem {
  id: string;
  ponto_id: string;
  dia_semana: number;
  ordem: number;
  bags: number;
  ativo: boolean;
}

export interface Visita {
  id: string;
  ponto_id: string;
  data: string;
  dia_semana: number;
  status: VisitaStatus;
  motivo: string | null;
  bags_previstas: number;
  bags_entregues: number | null;
  bags_recolhidas: number | null;
  estoque_antes: number | null;
  estoque_depois: number | null;
  condicao: string | null;
  recebido_por: string | null;
  fotos: string[];
  assinatura_url: string | null;
  local_confirmado: boolean;
  latitude: number | null;
  longitude: number | null;
  deslocamento_em: string | null;
  atendimento_em: string | null;
  foto_url: string | null;
  observacao: string | null;
  responsavel: string | null;
  veiculo: string | null;
  ordem: number;
  rota_id: string | null;
  executado_em: string | null;
}

export const VISITA_FIELDS =
  "id, ponto_id, data, dia_semana, status, motivo, bags_previstas, bags_entregues, bags_recolhidas, estoque_antes, estoque_depois, condicao, recebido_por, fotos, assinatura_url, local_confirmado, latitude, longitude, deslocamento_em, atendimento_em, foto_url, observacao, responsavel, veiculo, ordem, rota_id, executado_em";


export interface Lote {
  id: string;
  arquivo_nome: string;
  arquivo_hash: string;
  total_linhas: number;
  total_pontos: number;
  total_visitas: number;
  divergencias: Divergencia[];
  resumo: Record<string, unknown>;
  status: string;
  criado_em: string;
  desfeito_em: string | null;
}

const PONTO_FIELDS =
  "id, codigo, predio, andar, espaco, descricao, bags_padrao, bag_tipo, bag_capacidade_litros, estoque_minimo, frequencia, prioridade, tempo_estimado_min, janela_inicio, janela_fim, ordem, responsavel, contato_telefone, acesso_observacoes, requer_epi, epi_descricao, veiculo, veiculo_recomendado, latitude, longitude, imagem_url, qr_code, observacao, ativo, criado_em, atualizado_em, atualizado_por";


export const pontoLabel = (p: Ponto) =>
  `${p.predio}${p.andar ? ` · ${p.andar}` : ""}${p.espaco ? ` · ${p.espaco}` : ""}`;

/** Dia da semana ISO (1 = segunda … 7 = domingo) de uma data ISO local. */
export function diaSemanaISO(dataISO: string): number {
  const [y, m, d] = dataISO.split("-").map(Number);
  const wd = new Date(y, m - 1, d).getDay();
  return wd === 0 ? 7 : wd;
}

export function hojeISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function listPontos(): Promise<Ponto[]> {
  const { data, error } = await db
    .from("agua_pontos")
    .select(PONTO_FIELDS)
    .order("ordem")
    .order("predio");
  if (error) throw error;
  return (data ?? []) as Ponto[];
}

export async function listProgramacao(): Promise<ProgramacaoItem[]> {
  const { data, error } = await db
    .from("agua_programacao")
    .select("id, ponto_id, dia_semana, ordem, bags, ativo")
    .eq("ativo", true);
  if (error) throw error;
  return (data ?? []) as ProgramacaoItem[];
}

export async function listVisitas(inicio: string, fim: string): Promise<Visita[]> {
  const { data, error } = await db
    .from("agua_visitas")
    .select(VISITA_FIELDS)
    .gte("data", inicio)
    .lte("data", fim)
    .order("data", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Visita[];
}

export async function listLotes(): Promise<Lote[]> {
  const { data, error } = await db
    .from("agua_import_lotes")
    .select(
      "id, arquivo_nome, arquivo_hash, total_linhas, total_pontos, total_visitas, divergencias, resumo, status, criado_em, desfeito_em",
    )
    .order("criado_em", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as Lote[];
}

export async function loteComHash(hash: string): Promise<Lote | null> {
  const { data, error } = await db
    .from("agua_import_lotes")
    .select("id, arquivo_nome, arquivo_hash, criado_em, status, desfeito_em")
    .eq("arquivo_hash", hash)
    .is("desfeito_em", null)
    .limit(1);
  if (error) throw error;
  return ((data ?? [])[0] ?? null) as Lote | null;
}

/**
 * Aplica um lote de importação: grava o lote, faz upsert dos pontos e
 * substitui apenas a programação semanal dos pontos do arquivo.
 * As visitas já executadas nunca são tocadas.
 */
export async function aplicarImportacao(args: {
  leitura: LeituraAgua;
  arquivoNome: string;
  hash: string;
}): Promise<{ loteId: string }> {
  const { leitura, arquivoNome, hash } = args;
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id ?? null;

  const { data: lote, error: loteErr } = await db
    .from("agua_import_lotes")
    .insert({
      arquivo_nome: arquivoNome,
      arquivo_hash: hash,
      total_linhas: leitura.totalLinhas,
      total_pontos: leitura.pontos.length,
      total_visitas: leitura.totalVisitas,
      divergencias: leitura.divergencias,
      resumo: { por_dia: leitura.porDia },
      criado_por: uid,
    })
    .select("id")
    .single();
  if (loteErr) throw loteErr;
  const loteId = lote.id as string;

  const payload = leitura.pontos.map((p, i) => ({
    codigo: p.codigo,
    predio: p.predio,
    andar: p.andar,
    espaco: p.espaco,
    ordem: i + 1,
    lote_id: loteId,
    ativo: true,
  }));

  const { data: pontos, error: pontoErr } = await db
    .from("agua_pontos")
    .upsert(payload, { onConflict: "codigo" })
    .select("id, codigo");
  if (pontoErr) {
    await db.from("agua_import_lotes").update({ status: "falhou" }).eq("id", loteId);
    throw pontoErr;
  }

  const idPorCodigo = new Map<string, string>(
    (pontos ?? []).map((p: { id: string; codigo: string }) => [p.codigo, p.id]),
  );
  const ids = [...idPorCodigo.values()];

  // Só a programação dos pontos deste arquivo é substituída.
  const { error: delErr } = await db.from("agua_programacao").delete().in("ponto_id", ids);
  if (delErr) {
    await db.from("agua_import_lotes").update({ status: "falhou" }).eq("id", loteId);
    throw delErr;
  }

  const progRows = leitura.pontos.flatMap((p) => {
    const pid = idPorCodigo.get(p.codigo);
    if (!pid) return [];
    return p.dias.map((dia, idx) => ({
      ponto_id: pid,
      dia_semana: dia,
      ordem: idx + 1,
      bags: 1,
      origem: "aba_diaria",
      lote_id: loteId,
    }));
  });

  const { error: progErr } = await db.from("agua_programacao").insert(progRows);
  if (progErr) {
    await db.from("agua_import_lotes").update({ status: "falhou" }).eq("id", loteId);
    throw progErr;
  }

  return { loteId };
}

/** Desfaz apenas a programação criada pelo lote — execuções ficam preservadas. */
export async function desfazerLote(loteId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await db.from("agua_programacao").delete().eq("lote_id", loteId);
  if (error) throw error;
  const { error: upErr } = await db
    .from("agua_import_lotes")
    .update({
      status: "desfeito",
      desfeito_em: new Date().toISOString(),
      desfeito_por: userData.user?.id ?? null,
    })
    .eq("id", loteId);
  if (upErr) throw upErr;
}

/** Cria (se faltar) as visitas do dia a partir da programação e devolve todas. */
export async function garantirVisitasDoDia(dataISO: string): Promise<Visita[]> {
  const dia = diaSemanaISO(dataISO);
  const [prog, existentes] = await Promise.all([
    listProgramacao(),
    listVisitas(dataISO, dataISO),
  ]);
  const doDia = prog.filter((p) => p.dia_semana === dia);
  const jaTem = new Set(existentes.map((v) => v.ponto_id));
  const faltando = doDia.filter((p) => !jaTem.has(p.ponto_id));

  if (faltando.length) {
    const { error } = await db.from("agua_visitas").insert(
      faltando.map((p) => ({
        ponto_id: p.ponto_id,
        data: dataISO,
        dia_semana: dia,
        status: "pendente",
        bags_previstas: p.bags,
      })),
    );
    // Conflito de unicidade = outro usuário criou primeiro; seguimos com a releitura.
    if (error && !String(error.code) .includes("23505")) throw error;
    return listVisitas(dataISO, dataISO);
  }
  return existentes;
}

/** Registra execução gerando sempre um evento de auditoria (nunca sobrescreve o histórico). */
export async function registrarVisita(
  visitaId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id ?? null;

  const { error } = await db
    .from("agua_visitas")
    .update({ ...patch, executado_por: uid, executado_em: new Date().toISOString() })
    .eq("id", visitaId);
  if (error) throw error;

  const { error: evErr } = await db.from("agua_visita_eventos").insert({
    visita_id: visitaId,
    tipo: patch.status ? `status:${patch.status}` : "ajuste",
    dados: patch,
    usuario_id: uid,
  });
  if (evErr) throw evErr;
}

/** Aplica a normalização textual do item 6.2 a um cadastro de ponto. */
export function normalizarPonto<T extends Partial<Ponto>>(input: T): T {
  const out: Record<string, unknown> = { ...input };
  if (input.codigo !== undefined) out.codigo = normalizarCodigo(input.codigo);
  if (input.predio !== undefined) out.predio = caixaTitulo(input.predio);
  if (input.andar !== undefined) out.andar = caixaTitulo(input.andar);
  if (input.espaco !== undefined) out.espaco = caixaTitulo(input.espaco);
  if (input.descricao !== undefined) out.descricao = limparTexto(input.descricao) || null;
  if (input.responsavel !== undefined) out.responsavel = caixaTitulo(input.responsavel) || null;
  if (input.contato_telefone !== undefined)
    out.contato_telefone = normalizarTelefone(input.contato_telefone) || null;
  if (input.acesso_observacoes !== undefined)
    out.acesso_observacoes = limparTexto(input.acesso_observacoes) || null;
  if (input.epi_descricao !== undefined)
    out.epi_descricao = limparTexto(input.epi_descricao) || null;
  if (input.observacao !== undefined) out.observacao = limparTexto(input.observacao) || null;
  if (input.bag_tipo !== undefined) out.bag_tipo = limparTexto(input.bag_tipo) || null;
  if (input.veiculo_recomendado !== undefined)
    out.veiculo_recomendado = limparTexto(input.veiculo_recomendado) || null;
  return out as T;
}

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function criarPonto(input: Partial<Ponto>): Promise<Ponto> {
  const usuario = await uid();
  const payload = normalizarPonto(input);
  const codigo =
    payload.codigo ||
    normalizarCodigo(`${payload.predio ?? ""} ${payload.andar ?? ""} ${payload.espaco ?? ""}`);
  const { data, error } = await db
    .from("agua_pontos")
    .insert({
      ...payload,
      codigo,
      qr_code: payload.qr_code || `AGUA:${codigo}`,
      criado_por: usuario,
      atualizado_por: usuario,
    })
    .select(PONTO_FIELDS)
    .single();
  if (error) throw error;
  return data as Ponto;
}

export async function atualizarPonto(id: string, patch: Partial<Ponto>): Promise<void> {
  const usuario = await uid();
  const { error } = await db
    .from("agua_pontos")
    .update({
      ...normalizarPonto(patch),
      atualizado_por: usuario,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export interface PontoMerge {
  id: string;
  origem_id: string;
  destino_id: string;
  origem_snapshot: Record<string, unknown>;
  destino_snapshot: Record<string, unknown>;
  motivo: string | null;
  criado_em: string;
}

export async function listMerges(): Promise<PontoMerge[]> {
  const { data, error } = await db
    .from("agua_ponto_merges")
    .select("id, origem_id, destino_id, origem_snapshot, destino_snapshot, motivo, criado_em")
    .order("criado_em", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as PontoMerge[];
}

/**
 * Mescla dois cadastros: programação, visitas e solicitações da origem passam
 * para o destino, a origem é inativada e tudo fica registrado na auditoria.
 * Só roda com confirmação explícita do administrador.
 */
export async function mesclarPontos(args: {
  origem: Ponto;
  destino: Ponto;
  motivo: string;
}): Promise<void> {
  const { origem, destino, motivo } = args;
  if (origem.id === destino.id) throw new Error("Origem e destino são o mesmo ponto.");
  const usuario = await uid();

  const { error: mergeErr } = await db.from("agua_ponto_merges").insert({
    origem_id: origem.id,
    destino_id: destino.id,
    origem_snapshot: origem,
    destino_snapshot: destino,
    motivo: limparTexto(motivo) || null,
    usuario_id: usuario,
  });
  if (mergeErr) throw mergeErr;

  for (const tabela of ["agua_visitas", "agua_filtro_solicitacoes"]) {
    const { error } = await db.from(tabela).update({ ponto_id: destino.id }).eq("ponto_id", origem.id);
    if (error) throw error;
  }

  // A programação da origem é descartada: a do destino é a verdade operacional.
  const { error: progErr } = await db.from("agua_programacao").delete().eq("ponto_id", origem.id);
  if (progErr) throw progErr;

  const { error: offErr } = await db
    .from("agua_pontos")
    .update({
      ativo: false,
      mesclado_em: new Date().toISOString(),
      mesclado_para: destino.id,
      atualizado_por: usuario,
      observacao: limparTexto(
        `${origem.observacao ?? ""} [mesclado em ${destino.codigo}]`,
      ),
    })
    .eq("id", origem.id);
  if (offErr) throw offErr;
}


/* ------------------------------------------------------------------ */
/* Solicitações de filtro                                              */
/* ------------------------------------------------------------------ */

/**
 * Workflow completo (item 12.3). `aberta` e `em_atendimento` são valores
 * legados mantidos para as solicitações criadas antes da ampliação.
 */
export type FiltroSituacao =
  | "aberta"
  | "em_atendimento"
  | "solicitada"
  | "em_triagem"
  | "aprovada"
  | "rejeitada"
  | "aguardando_material"
  | "programada"
  | "em_deslocamento"
  | "em_execucao"
  | "concluida"
  | "validada"
  | "reaberta"
  | "cancelada";

export type FiltroPrioridade = "baixa" | "media" | "alta";

export const FILTRO_SITUACAO_LABEL: Record<FiltroSituacao, string> = {
  aberta: "Solicitada",
  solicitada: "Solicitada",
  em_triagem: "Em triagem",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  aguardando_material: "Aguardando material",
  programada: "Programada",
  em_deslocamento: "Em deslocamento",
  em_execucao: "Em execução",
  em_atendimento: "Em execução",
  concluida: "Concluída",
  validada: "Validada pelo solicitante",
  reaberta: "Reaberta",
  cancelada: "Cancelada",
};

export const FILTRO_PRIORIDADE_LABEL: Record<FiltroPrioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

export const FILTRO_TIPOS = ["troca", "limpeza", "reparo", "instalação"];

export interface FiltroSolicitacao {
  id: string;
  numero: number | null;
  ponto_id: string;
  ativo_id: string | null;
  origem: string;
  tipo: string;
  prioridade: FiltroPrioridade;
  situacao: FiltroSituacao;
  descricao: string | null;
  foto_url: string | null;
  foto_conclusao_url: string | null;
  observacao_conclusao: string | null;
  motivo_cancelamento: string | null;
  prevista_para: string | null;
  concluida_em: string | null;
  atendimento: string | null;
  sla_horas: number | null;
  vence_em: string | null;
  criado_em: string;
  /* 12.2 — identificação e contexto */
  solicitante_nome: string | null;
  predio: string | null;
  andar_setor: string | null;
  espaco: string | null;
  motivos: string[];
  motivo_outro: string | null;
  telefone: string | null;
  disponibilidade_acesso: string | null;
  os_relacionada: string | null;
  motivo_rejeicao: string | null;
  /* 12.4 — programação */
  responsavel_nome: string | null;
  responsavel_2_nome: string | null;
  programada_em: string | null;
  veiculo_id: string | null;
  material_descricao: string | null;
  material_quantidade: number | null;
  material_reservado: boolean;
  incluir_na_rota: boolean;
  lembrete_em: string | null;
  observacao_programacao: string | null;
  /* 12.5 — conclusão */
  foto_antes_url: string | null;
  foto_depois_url: string | null;
  filtro_utilizado: string | null;
  lote: string | null;
  quantidade_utilizada: number | null;
  colaborador_conclusao: string | null;
  descarte_destino: string | null;
  condicao_apos: string | null;
  nova_proxima_troca: string | null;
  assinatura_url: string | null;
  /* 12.7 — validação e avaliação */
  validada_em: string | null;
  reaberturas: number;
  avaliacao_nota: number | null;
  avaliacao_comentario: string | null;
}

const FILTRO_FIELDS = [
  "id, numero, ponto_id, ativo_id, origem, tipo, prioridade, situacao, descricao",
  "foto_url, foto_conclusao_url, observacao_conclusao, motivo_cancelamento",
  "prevista_para, concluida_em, atendimento, sla_horas, vence_em, criado_em",
  "solicitante_nome, predio, andar_setor, espaco, motivos, motivo_outro, telefone",
  "disponibilidade_acesso, os_relacionada, motivo_rejeicao",
  "responsavel_nome, responsavel_2_nome, programada_em, veiculo_id",
  "material_descricao, material_quantidade, material_reservado, incluir_na_rota",
  "lembrete_em, observacao_programacao",
  "foto_antes_url, foto_depois_url, filtro_utilizado, lote, quantidade_utilizada",
  "colaborador_conclusao, descarte_destino, condicao_apos, nova_proxima_troca, assinatura_url",
  "validada_em, reaberturas, avaliacao_nota, avaliacao_comentario",
].join(", ");

export async function listFiltros(): Promise<FiltroSolicitacao[]> {
  const { data, error } = await db
    .from("agua_filtro_solicitacoes")
    .select(FILTRO_FIELDS)
    .order("criado_em", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as FiltroSolicitacao[];
}


export async function criarFiltro(input: {
  ponto_id: string;
  tipo: string;
  prioridade: FiltroPrioridade;
  ativo_id?: string | null;
  origem?: string;
  descricao?: string | null;
  prevista_para?: string | null;
  foto_url?: string | null;
  situacao?: FiltroSituacao;
  solicitante_nome?: string | null;
  predio?: string | null;
  andar_setor?: string | null;
  espaco?: string | null;
  motivos?: string[];
  motivo_outro?: string | null;
  telefone?: string | null;
  disponibilidade_acesso?: string | null;
  os_relacionada?: string | null;
}): Promise<void> {

  const { data: userData } = await supabase.auth.getUser();
  const { data: criada, error } = await db
    .from("agua_filtro_solicitacoes")
    .insert({
      situacao: "solicitada",
      ...input,
      criado_por: userData.user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  // Item 17 — avisa gestão e técnicos sobre a nova solicitação.
  const { notificarAgua } = await import("@/lib/agua/notificacoes");
  await notificarAgua({
    evento: "filtro_solicitacao_criada",
    corpo: `Novo pedido de filtro em ${input.predio ?? "ponto não informado"}${
      input.andar_setor ? ` — ${input.andar_setor}` : ""
    }. Prioridade: ${input.prioridade ?? "media"}.`,
    deepLink: "/abastecimento/agua/filtros",
    chave: `filtro:${criada?.id ?? crypto.randomUUID()}:solicitada`,
    metadata: { solicitacao_id: criada?.id ?? null },
  });
}

export async function atualizarFiltro(
  id: string,
  patch: Partial<Pick<FiltroSolicitacao, "situacao" | "prioridade" | "atendimento" | "prevista_para" | "foto_url">>,
): Promise<void> {
  const payload: Record<string, unknown> = { ...patch };
  if (patch.situacao === "concluida") payload.concluida_em = new Date().toISOString();
  const { error } = await db.from("agua_filtro_solicitacoes").update(payload).eq("id", id);
  if (error) throw error;
}
