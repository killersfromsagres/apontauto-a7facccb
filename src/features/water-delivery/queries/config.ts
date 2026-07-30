// Item 22 — leitura/escrita das configurações cadastrais (tipos de bags e feriados).

import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as { from: (t: string) => any };

export interface BagTipo {
  id: string;
  codigo: string;
  nome: string;
  capacidade_label: string | null;
  capacidade_litros: number | null;
  estoque_atual: number;
  estoque_minimo: number;
  ativo: boolean;
}

export interface Feriado {
  id: string;
  data: string;
  descricao: string;
  tipo: string | null;
  bloqueia_geracao: boolean;
}

export async function listBagTipos(): Promise<BagTipo[]> {
  const { data, error } = await db
    .from("agua_bag_tipos")
    .select(
      "id, codigo, nome, capacidade_label, capacidade_litros, estoque_atual, estoque_minimo, ativo",
    )
    .order("nome");
  if (error) throw error;
  return (data ?? []) as BagTipo[];
}

export async function upsertBagTipo(input: Partial<BagTipo>): Promise<void> {
  const payload = {
    codigo: input.codigo?.trim(),
    nome: input.nome?.trim(),
    capacidade_label: input.capacidade_label?.trim() || null,
    capacidade_litros: input.capacidade_litros ?? null,
    estoque_minimo: input.estoque_minimo ?? 0,
    ativo: input.ativo ?? true,
  };
  const { error } = input.id
    ? await db.from("agua_bag_tipos").update(payload).eq("id", input.id)
    : await db.from("agua_bag_tipos").insert(payload);
  if (error) throw error;
}

/** Desativa em vez de excluir, preservando o histórico de movimentações. */
export async function desativarBagTipo(id: string): Promise<void> {
  const { error } = await db.from("agua_bag_tipos").update({ ativo: false }).eq("id", id);
  if (error) throw error;
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

export async function criarFeriado(input: {
  data: string;
  descricao: string;
  bloqueia_geracao: boolean;
}): Promise<void> {
  const { error } = await db.from("agua_feriados").insert({
    data: input.data,
    descricao: input.descricao.trim(),
    tipo: "manual",
    bloqueia_geracao: input.bloqueia_geracao,
  });
  if (error) throw error;
}

export async function removerFeriado(id: string): Promise<void> {
  const { error } = await db.from("agua_feriados").delete().eq("id", id);
  if (error) throw error;
}
