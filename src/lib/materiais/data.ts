// Camada de dados do módulo "Solicitação de Materiais" (colaborador).
// Catálogo de materiais + solicitações e seus itens.

import { supabase } from "@/integrations/supabase/client";

export type Prioridade = "baixa" | "normal" | "alta" | "urgente";
export type StatusSolicitacao =
  | "rascunho"
  | "enviada"
  | "em_analise"
  | "aprovada"
  | "atendida"
  | "cancelada";

export type MaterialCatalogo = {
  id: string;
  codigo: string;
  nome: string;
  categoria: string | null;
  unidade: string;
  descricao: string | null;
  ativo: boolean;
};

export type SolicitacaoItem = {
  id: string;
  solicitacao_id: string;
  catalogo_id: string | null;
  codigo: string | null;
  descricao: string;
  unidade: string;
  quantidade: number;
  justificativa: string | null;
};

export type Solicitacao = {
  id: string;
  numero: string;
  user_id: string;
  solicitante: string;
  setor: string | null;
  centro_custo: string | null;
  predio: string | null;
  local: string | null;
  prioridade: Prioridade;
  status: StatusSolicitacao;
  observacao: string | null;
  enviada_em: string | null;
  created_at: string;
  itens: SolicitacaoItem[];
};

export const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

export const STATUS_LABEL: Record<StatusSolicitacao, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  em_analise: "Em análise",
  aprovada: "Aprovada",
  atendida: "Atendida",
  cancelada: "Cancelada",
};

export const UNIDADES = [
  "UN",
  "PC",
  "CX",
  "PAR",
  "M",
  "M²",
  "KG",
  "L",
  "GL",
  "RL",
  "SC",
  "KIT",
] as const;

/** Item ainda não persistido (carrinho da nova solicitação). */
export type CarrinhoItem = {
  key: string;
  catalogoId: string | null;
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  justificativa: string;
};

export async function fetchCatalogo(): Promise<MaterialCatalogo[]> {
  const { data, error } = await supabase
    .from("materiais_catalogo")
    .select("id, codigo, nome, categoria, unidade, descricao, ativo")
    .eq("ativo", true)
    .order("categoria", { ascending: true })
    .order("nome", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MaterialCatalogo[];
}

export async function fetchMinhasSolicitacoes(): Promise<Solicitacao[]> {
  const { data, error } = await supabase
    .from("material_solicitacoes")
    .select(
      "id, numero, user_id, solicitante, setor, centro_custo, predio, local, prioridade, status, observacao, enviada_em, created_at, material_solicitacao_itens(id, solicitacao_id, catalogo_id, codigo, descricao, unidade, quantidade, justificativa)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((row) => ({
    ...row,
    quantidade: undefined,
    itens: ((row.material_solicitacao_itens ?? []) as any[]).map((i) => ({
      ...i,
      quantidade: Number(i.quantidade ?? 0),
    })),
  })) as Solicitacao[];
}

export type NovaSolicitacaoInput = {
  solicitante: string;
  setor?: string | null;
  centroCusto?: string | null;
  predio?: string | null;
  local?: string | null;
  prioridade: Prioridade;
  observacao?: string | null;
  status: Extract<StatusSolicitacao, "rascunho" | "enviada">;
  itens: CarrinhoItem[];
};

/** Cria a solicitação e seus itens. Retorna a solicitação completa. */
export async function criarSolicitacao(input: NovaSolicitacaoInput): Promise<Solicitacao> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) throw new Error("Sessão expirada. Entre novamente para enviar a solicitação.");
  if (input.itens.length === 0) throw new Error("Adicione ao menos um material.");

  const { data: sol, error } = await supabase
    .from("material_solicitacoes")
    .insert({
      user_id: uid,
      solicitante: input.solicitante,
      setor: input.setor || null,
      centro_custo: input.centroCusto || null,
      predio: input.predio || null,
      local: input.local || null,
      prioridade: input.prioridade,
      status: input.status,
      observacao: input.observacao || null,
      enviada_em: input.status === "enviada" ? new Date().toISOString() : null,
    } as any)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const payload = input.itens.map((i) => ({
    solicitacao_id: (sol as any).id,
    catalogo_id: i.catalogoId,
    codigo: i.codigo || null,
    descricao: i.descricao,
    unidade: i.unidade,
    quantidade: i.quantidade,
    justificativa: i.justificativa || null,
  }));
  const { data: itens, error: eItens } = await supabase
    .from("material_solicitacao_itens")
    .insert(payload as any)
    .select("*");
  if (eItens) {
    await supabase
      .from("material_solicitacoes")
      .delete()
      .eq("id", (sol as any).id);
    throw new Error(eItens.message);
  }

  return {
    ...(sol as any),
    itens: ((itens ?? []) as any[]).map((i) => ({ ...i, quantidade: Number(i.quantidade ?? 0) })),
  } as Solicitacao;
}

export async function enviarSolicitacao(id: string) {
  const { error } = await supabase
    .from("material_solicitacoes")
    .update({ status: "enviada", enviada_em: new Date().toISOString() } as any)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function excluirSolicitacao(id: string) {
  const { error } = await supabase.from("material_solicitacoes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
