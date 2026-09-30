import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export type EstoqueMovementType =
  | "entrada"
  | "saida"
  | "devolucao"
  | "ajuste_positivo"
  | "ajuste_negativo"
  | "descarte";

export interface EstoqueItem {
  id: string;
  codigo: string | null;
  descricao: string;
  categoria: string;
  tamanho: string | null;
  ca_numero: string | null;
  unidade: string;
  estoque_atual: number;
  estoque_ideal: number | null;
  estoque_minimo: number | null;
  valor_unitario: number | null;
  ativo: boolean;
  legacy_source_key?: string | null;
  origem_linha?: number | null;
  created_at: string;
  updated_at: string;
}

export interface EstoqueColaborador {
  id: string;
  nome: string;
  matricula: string | null;
  setor: string | null;
  cargo: string | null;
  unidade: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface EstoqueMovimento {
  id: string;
  item_id: string;
  tipo: EstoqueMovementType;
  quantidade: number;
  saldo_anterior: number;
  saldo_apos: number;
  valor_unitario: number | null;
  colaborador_id: string | null;
  colaborador_nome: string | null;
  motivo: string | null;
  documento: string | null;
  observacao: string | null;
  entrega_id: string | null;
  data_movimento: string;
  origem: string;
  created_at: string;
  item?: Pick<
    EstoqueItem,
    "descricao" | "codigo" | "categoria" | "tamanho" | "ca_numero"
  > | null;
}

export interface EstoqueEntregaItem {
  id: string;
  item_id: string | null;
  descricao: string;
  ca_numero: string | null;
  quantidade: number;
  valor_unitario: number | null;
}

export interface EstoqueEntrega {
  id: string;
  colaborador_id: string | null;
  colaborador_nome: string;
  colaborador_matricula: string | null;
  colaborador_setor: string | null;
  data_entrega: string;
  observacao: string | null;
  created_at: string;
  itens?: EstoqueEntregaItem[];
}

export interface EstoqueSnapshot {
  items: EstoqueItem[];
  colaboradores: EstoqueColaborador[];
  movimentos: EstoqueMovimento[];
  entregas: EstoqueEntrega[];
}

export interface EstoqueItemInput {
  codigo?: string | null;
  descricao: string;
  categoria: string;
  tamanho?: string | null;
  ca_numero?: string | null;
  unidade?: string;
  estoque_ideal?: number | null;
  estoque_minimo?: number | null;
  valor_unitario?: number | null;
  ativo?: boolean;
}

export interface EstoqueColaboradorInput {
  nome: string;
  matricula?: string | null;
  setor?: string | null;
  cargo?: string | null;
  unidade?: string | null;
  ativo?: boolean;
}

function numberOrZero(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapItem(row: any): EstoqueItem {
  return {
    ...row,
    estoque_atual: numberOrZero(row.estoque_atual),
    estoque_ideal: nullableNumber(row.estoque_ideal),
    estoque_minimo: nullableNumber(row.estoque_minimo),
    valor_unitario: nullableNumber(row.valor_unitario),
  };
}

function mapMovimento(row: any): EstoqueMovimento {
  return {
    ...row,
    quantidade: numberOrZero(row.quantidade),
    saldo_anterior: numberOrZero(row.saldo_anterior),
    saldo_apos: numberOrZero(row.saldo_apos),
    valor_unitario: nullableNumber(row.valor_unitario),
    item: row.item ?? null,
  };
}

function mapEntrega(row: any): EstoqueEntrega {
  return {
    ...row,
    itens: (row.itens ?? []).map((item: any) => ({
      ...item,
      quantidade: numberOrZero(item.quantidade),
      valor_unitario: nullableNumber(item.valor_unitario),
    })),
  };
}

export async function fetchEstoqueSnapshot(): Promise<EstoqueSnapshot> {
  const [itemsRes, colaboradoresRes, movimentosRes, entregasRes] =
    await Promise.all([
      db
        .from("estoque_epi_itens")
        .select("*")
        .order("categoria", { ascending: true })
        .order("descricao", { ascending: true }),
      db
        .from("estoque_epi_colaboradores")
        .select("*")
        .order("ativo", { ascending: false })
        .order("nome", { ascending: true }),
      db
        .from("estoque_epi_movimentos")
        .select(
          "*, item:estoque_epi_itens(descricao,codigo,categoria,tamanho,ca_numero)",
        )
        .order("data_movimento", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1000),
      db
        .from("estoque_epi_entregas")
        .select(
          "*, itens:estoque_epi_entrega_itens(id,item_id,descricao,ca_numero,quantidade,valor_unitario)",
        )
        .order("data_entrega", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

  const error =
    itemsRes.error ||
    colaboradoresRes.error ||
    movimentosRes.error ||
    entregasRes.error;
  if (error) throw error;

  return {
    items: (itemsRes.data ?? []).map(mapItem),
    colaboradores: colaboradoresRes.data ?? [],
    movimentos: (movimentosRes.data ?? []).map(mapMovimento),
    entregas: (entregasRes.data ?? []).map(mapEntrega),
  };
}

export async function saveEstoqueItem(
  input: EstoqueItemInput,
  id?: string | null,
): Promise<void> {
  const payload = {
    codigo: input.codigo?.trim() || null,
    descricao: input.descricao.trim(),
    categoria: input.categoria.trim() || "Outros EPIs",
    tamanho: input.tamanho?.trim() || null,
    ca_numero: input.ca_numero?.trim() || null,
    unidade: input.unidade?.trim() || "UN",
    estoque_ideal: input.estoque_ideal ?? null,
    estoque_minimo: input.estoque_minimo ?? null,
    valor_unitario: input.valor_unitario ?? null,
    ativo: input.ativo ?? true,
    updated_at: new Date().toISOString(),
  };

  if (!payload.descricao) throw new Error("Informe a descrição do item.");

  if (id) {
    const { error } = await db
      .from("estoque_epi_itens")
      .update(payload)
      .eq("id", id);
    if (error) throw error;
    return;
  }

  const { error } = await db.from("estoque_epi_itens").insert({
    ...payload,
    estoque_atual: 0,
  });
  if (error) throw error;
}

export async function saveEstoqueColaborador(
  input: EstoqueColaboradorInput,
  id?: string | null,
): Promise<void> {
  const payload = {
    nome: input.nome.trim(),
    matricula: input.matricula?.trim() || null,
    setor: input.setor?.trim() || null,
    cargo: input.cargo?.trim() || null,
    unidade: input.unidade?.trim() || null,
    ativo: input.ativo ?? true,
    updated_at: new Date().toISOString(),
  };

  if (!payload.nome) throw new Error("Informe o nome do colaborador.");

  if (id) {
    const { error } = await db
      .from("estoque_epi_colaboradores")
      .update(payload)
      .eq("id", id);
    if (error) throw error;
    return;
  }

  const { error } = await db.from("estoque_epi_colaboradores").insert(payload);
  if (error) throw error;
}

export async function registerEstoqueMovement(input: {
  itemId: string;
  tipo: EstoqueMovementType;
  quantidade: number;
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
  motivo?: string | null;
  documento?: string | null;
  observacao?: string | null;
  valorUnitario?: number | null;
  dataMovimento?: string | null;
}) {
  if (!input.dataMovimento) {
    throw new Error("Informe a data da movimentação.");
  }
  if (
    input.tipo === "saida" &&
    !input.colaboradorId &&
    !input.colaboradorNome?.trim()
  ) {
    throw new Error("Informe o colaborador que realizou a retirada.");
  }

  const { data, error } = await db.rpc("registrar_movimento_estoque_epi", {
    _item_id: input.itemId,
    _tipo: input.tipo,
    _quantidade: input.quantidade,
    _colaborador_id: input.colaboradorId ?? null,
    _colaborador_nome: input.colaboradorNome ?? null,
    _motivo: input.motivo ?? null,
    _documento: input.documento ?? null,
    _observacao: input.observacao ?? null,
    _valor_unitario: input.valorUnitario ?? null,
    _data_movimento: input.dataMovimento ?? null,
  });
  if (error) throw error;
  return data;
}

export async function registerEstoqueDelivery(input: {
  colaboradorId: string;
  itens: Array<{ itemId: string; quantidade: number }>;
  observacao?: string | null;
  dataEntrega?: string | null;
}) {
  if (!input.colaboradorId) {
    throw new Error("Selecione o colaborador que realizou a retirada.");
  }
  if (!input.dataEntrega) {
    throw new Error("Informe a data da retirada.");
  }
  if (!input.itens.length) {
    throw new Error("Adicione pelo menos um item à retirada.");
  }

  const { data, error } = await db.rpc("registrar_entrega_epi", {
    _colaborador_id: input.colaboradorId,
    _itens: input.itens.map((item) => ({
      item_id: item.itemId,
      quantidade: item.quantidade,
    })),
    _observacao: input.observacao ?? null,
    _data_entrega: input.dataEntrega ?? null,
  });
  if (error) throw error;
  return data as string;
}

export function estoqueStatus(item: EstoqueItem):
  | "ZERADO"
  | "CRÍTICO"
  | "COMPRAR"
  | "IDEAL"
  | "ACIMA"
  | "SEM META" {
  const atual = numberOrZero(item.estoque_atual);
  const ideal = nullableNumber(item.estoque_ideal);
  const minimo = nullableNumber(item.estoque_minimo);

  if (atual <= 0) return "ZERADO";
  if (minimo !== null && atual <= minimo) return "CRÍTICO";
  if (ideal === null || ideal <= 0) return "SEM META";
  if (atual < ideal) return "COMPRAR";
  if (atual === ideal) return "IDEAL";
  return "ACIMA";
}

export function inventoryValue(item: EstoqueItem): number {
  return numberOrZero(item.estoque_atual) * numberOrZero(item.valor_unitario);
}

export const ESTOQUE_CATEGORIAS = [
  "Uniformes",
  "Calçados",
  "Luvas",
  "Proteção Respiratória",
  "Proteção Visual e Facial",
  "Proteção Cabeça e Auditiva",
  "Trabalho em Altura",
  "Outros EPIs",
] as const;
