// Acesso a dados do módulo Entrega de Água (Frota e Abastecimento).
// Toda a programação vive no banco — nada é hardcoded nos componentes.

import { supabase } from "@/integrations/supabase/client";
import type { Divergencia, LeituraAgua } from "@/lib/agua/reader";

// As tabelas novas ainda não constam nos tipos gerados.
const db = supabase as unknown as { from: (t: string) => any };

export type VisitaStatus = "pendente" | "concluida" | "parcial" | "nao_realizada" | "cancelada";

export const VISITA_STATUS_LABEL: Record<VisitaStatus, string> = {
  pendente: "Pendente",
  concluida: "Concluída",
  parcial: "Entrega parcial",
  nao_realizada: "Não realizada",
  cancelada: "Cancelada",
};

export const MOTIVOS_NAO_REALIZADA = [
  "Feriado",
  "Paralisação",
  "Prédio fechado",
  "Sem acesso",
  "Falta de bags",
  "Mudança excepcional de rota",
  "Outro",
];

export interface Ponto {
  id: string;
  codigo: string;
  predio: string;
  andar: string;
  espaco: string;
  bags_padrao: number;
  janela_inicio: string | null;
  janela_fim: string | null;
  ordem: number;
  responsavel: string | null;
  veiculo: string | null;
  observacao: string | null;
  ativo: boolean;
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
  foto_url: string | null;
  observacao: string | null;
  responsavel: string | null;
  veiculo: string | null;
  executado_em: string | null;
}

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
  "id, codigo, predio, andar, espaco, bags_padrao, janela_inicio, janela_fim, ordem, responsavel, veiculo, observacao, ativo";

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
    .select(
      "id, ponto_id, data, dia_semana, status, motivo, bags_previstas, bags_entregues, foto_url, observacao, responsavel, veiculo, executado_em",
    )
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
  patch: Partial<
    Pick<
      Visita,
      "status" | "bags_entregues" | "foto_url" | "observacao" | "motivo" | "responsavel" | "veiculo"
    >
  >,
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

export async function atualizarPonto(id: string, patch: Partial<Ponto>): Promise<void> {
  const { error } = await db.from("agua_pontos").update(patch).eq("id", id);
  if (error) throw error;
}
