// Controle de bags do módulo Abastecimento de Água.
//
// Regras:
// - `agua_bag_tipos` é o cadastro (código, capacidade, estoque, mínimo, local, fornecedor);
// - `agua_bag_movimentos` é append-only e é a fonte da verdade do estoque
//   (um trigger no banco aplica o delta em `estoque_atual`);
// - os alertas são calculados a partir das movimentações + visitas.

import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as { from: (t: string) => any };

export type BagMovimentoTipo =
  | "carga_rota"
  | "entrega"
  | "recolhimento_vazia"
  | "retorno"
  | "perda"
  | "avaria"
  | "ajuste"
  | "entrada_fornecedor";

export const BAG_MOVIMENTO_LABEL: Record<BagMovimentoTipo, string> = {
  carga_rota: "Carga de rota",
  entrega: "Entrega",
  recolhimento_vazia: "Recolhimento de vazia",
  retorno: "Retorno",
  perda: "Perda",
  avaria: "Avaria",
  ajuste: "Ajuste autorizado",
  entrada_fornecedor: "Entrada de fornecedor",
};

/** Sinal aplicado ao estoque — espelha o trigger `tg_agua_bag_estoque`. */
export const BAG_MOVIMENTO_SINAL: Record<BagMovimentoTipo, 1 | -1> = {
  entrada_fornecedor: 1,
  retorno: 1,
  recolhimento_vazia: 1,
  ajuste: 1,
  carga_rota: -1,
  entrega: -1,
  perda: -1,
  avaria: -1,
};

export interface BagTipo {
  id: string;
  codigo: string;
  nome: string;
  capacidade_label: string | null;
  capacidade_litros: number | null;
  unidade: string;
  estoque_atual: number;
  estoque_minimo: number;
  local_armazenamento: string | null;
  fornecedor: string | null;
  ativo: boolean;
  observacao: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface BagMovimento {
  id: string;
  bag_tipo_id: string;
  tipo: BagMovimentoTipo;
  quantidade: number;
  rota_id: string | null;
  visita_id: string | null;
  ponto_id: string | null;
  veiculo: string | null;
  responsavel: string | null;
  motivo: string | null;
  origem: string;
  idempotency_key: string | null;
  ocorrido_em: string;
  criado_por: string;
  criado_em: string;
}

const TIPO_FIELDS =
  "id,codigo,nome,capacidade_label,capacidade_litros,unidade,estoque_atual,estoque_minimo,local_armazenamento,fornecedor,ativo,observacao,criado_em,atualizado_em";

const MOV_FIELDS =
  "id,bag_tipo_id,tipo,quantidade,rota_id,visita_id,ponto_id,veiculo,responsavel,motivo,origem,idempotency_key,ocorrido_em,criado_por,criado_em";

export async function listBagTipos(): Promise<BagTipo[]> {
  const { data, error } = await db
    .from("agua_bag_tipos")
    .select(TIPO_FIELDS)
    .order("nome", { ascending: true });
  if (error) throw error;
  return (data ?? []) as BagTipo[];
}

export type BagTipoInput = Partial<Omit<BagTipo, "id" | "criado_em" | "atualizado_em">>;

export async function salvarBagTipo(id: string | null, patch: BagTipoInput): Promise<BagTipo> {
  const query = id
    ? db.from("agua_bag_tipos").update(patch).eq("id", id)
    : db.from("agua_bag_tipos").insert(patch);
  const { data, error } = await query.select(TIPO_FIELDS).single();
  if (error) throw error;
  return data as BagTipo;
}

export async function listBagMovimentos(
  de: string,
  ate: string,
  limite = 300,
): Promise<BagMovimento[]> {
  const { data, error } = await db
    .from("agua_bag_movimentos")
    .select(MOV_FIELDS)
    .gte("ocorrido_em", `${de}T00:00:00`)
    .lte("ocorrido_em", `${ate}T23:59:59`)
    .order("ocorrido_em", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as BagMovimento[];
}

export interface RegistrarMovimentoInput {
  bagTipoId: string;
  tipo: BagMovimentoTipo;
  quantidade: number;
  rotaId?: string | null;
  visitaId?: string | null;
  pontoId?: string | null;
  veiculo?: string | null;
  responsavel?: string | null;
  motivo?: string | null;
  origem?: "app" | "offline" | "importacao" | "automatico";
  /** Evita duplicidade na sincronização offline. */
  idempotencyKey?: string | null;
  ocorridoEm?: string;
}

const MOTIVO_OBRIGATORIO: BagMovimentoTipo[] = ["perda", "avaria", "ajuste"];

export function validarMovimento(input: RegistrarMovimentoInput): string | null {
  if (!input.bagTipoId) return "Selecione o tipo de bag.";
  if (!Number.isFinite(input.quantidade) || input.quantidade <= 0)
    return "Informe uma quantidade maior que zero.";
  if (!Number.isInteger(input.quantidade)) return "A quantidade deve ser um número inteiro.";
  if (MOTIVO_OBRIGATORIO.includes(input.tipo) && !input.motivo?.trim())
    return "Movimentações de perda, avaria e ajuste exigem motivo.";
  return null;
}

export async function registrarMovimento(input: RegistrarMovimentoInput): Promise<BagMovimento> {
  const erro = validarMovimento(input);
  if (erro) throw new Error(erro);

  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) throw new Error("Sessão expirada. Entre novamente.");

  const { data, error } = await db
    .from("agua_bag_movimentos")
    .insert({
      bag_tipo_id: input.bagTipoId,
      tipo: input.tipo,
      quantidade: input.quantidade,
      rota_id: input.rotaId ?? null,
      visita_id: input.visitaId ?? null,
      ponto_id: input.pontoId ?? null,
      veiculo: input.veiculo ?? null,
      responsavel: input.responsavel ?? null,
      motivo: input.motivo?.trim() || null,
      origem: input.origem ?? "app",
      idempotency_key: input.idempotencyKey ?? null,
      ocorrido_em: input.ocorridoEm ?? new Date().toISOString(),
      criado_por: uid,
    })
    .select(MOV_FIELDS)
    .single();
  if (error) throw error;
  return data as BagMovimento;
}

// ---------------------------------------------------------------- alertas

export type BagAlertaTipo =
  | "estoque_minimo"
  | "divergencia_rota"
  | "perda_recorrente"
  | "consumo_acima_media"
  | "previsto_vs_realizado"
  | "bag_danificada";

export interface BagAlerta {
  id: string;
  tipo: BagAlertaTipo;
  severidade: "alta" | "media" | "baixa";
  titulo: string;
  detalhe: string;
}

export interface AlertaEntradaVisita {
  ponto_id: string;
  nome: string;
  bags_previstas: number;
  bags_entregues: number | null;
  status: string;
}

export interface AlertaEntradaRota {
  id: string;
  data: string;
  divergencia_bags: number | null;
  bags_danificadas: number | null;
}

/**
 * Regras puras (testáveis) para os alertas do controle de bags.
 * `mediaJanela` é a média histórica de bags por ponto no período comparado.
 */
export function calcularAlertas(params: {
  tipos: BagTipo[];
  movimentos: BagMovimento[];
  visitas: AlertaEntradaVisita[];
  rotas: AlertaEntradaRota[];
}): BagAlerta[] {
  const { tipos, movimentos, visitas, rotas } = params;
  const alertas: BagAlerta[] = [];

  for (const t of tipos) {
    if (t.ativo && t.estoque_atual < t.estoque_minimo) {
      alertas.push({
        id: `estoque-${t.id}`,
        tipo: "estoque_minimo",
        severidade: "alta",
        titulo: `${t.nome} abaixo do mínimo`,
        detalhe: `Estoque atual ${t.estoque_atual} ${t.unidade} · mínimo ${t.estoque_minimo}.`,
      });
    }
  }

  for (const r of rotas) {
    if ((r.divergencia_bags ?? 0) !== 0) {
      alertas.push({
        id: `divergencia-${r.id}`,
        tipo: "divergencia_rota",
        severidade: "alta",
        titulo: `Divergência de bags na rota de ${r.data}`,
        detalhe: `Diferença de ${r.divergencia_bags} bag(s) na reconciliação.`,
      });
    }
    if ((r.bags_danificadas ?? 0) > 0) {
      alertas.push({
        id: `danificada-${r.id}`,
        tipo: "bag_danificada",
        severidade: "media",
        titulo: `Bags danificadas na rota de ${r.data}`,
        detalhe: `${r.bags_danificadas} bag(s) registradas como avaria.`,
      });
    }
  }

  const perdas = movimentos.filter((m) => m.tipo === "perda" || m.tipo === "avaria");
  if (perdas.length >= 3) {
    const total = perdas.reduce((a, m) => a + m.quantidade, 0);
    alertas.push({
      id: "perda-recorrente",
      tipo: "perda_recorrente",
      severidade: "media",
      titulo: "Perda/avaria recorrente",
      detalhe: `${perdas.length} registros somando ${total} bag(s) no período.`,
    });
  }

  const porPonto = new Map<string, { nome: string; prev: number; real: number; n: number }>();
  for (const v of visitas) {
    const cur = porPonto.get(v.ponto_id) ?? { nome: v.nome, prev: 0, real: 0, n: 0 };
    cur.prev += v.bags_previstas ?? 0;
    cur.real += v.bags_entregues ?? 0;
    cur.n += 1;
    porPonto.set(v.ponto_id, cur);
  }
  const medias = [...porPonto.values()].map((p) => (p.n ? p.real / p.n : 0));
  const mediaGeral = medias.length ? medias.reduce((a, b) => a + b, 0) / medias.length : 0;

  for (const [id, p] of porPonto) {
    const media = p.n ? p.real / p.n : 0;
    if (mediaGeral > 0 && media > mediaGeral * 1.5 && p.real >= 5) {
      alertas.push({
        id: `consumo-${id}`,
        tipo: "consumo_acima_media",
        severidade: "baixa",
        titulo: `${p.nome} consome acima da média`,
        detalhe: `Média de ${media.toFixed(1)} bag(s)/visita contra ${mediaGeral.toFixed(1)} da operação.`,
      });
    }
    if (p.prev > 0) {
      const desvio = Math.abs(p.real - p.prev) / p.prev;
      if (desvio >= 0.3 && Math.abs(p.real - p.prev) >= 3) {
        alertas.push({
          id: `previsto-${id}`,
          tipo: "previsto_vs_realizado",
          severidade: "media",
          titulo: `${p.nome} com previsão descolada do realizado`,
          detalhe: `Previsto ${p.prev} · realizado ${p.real} (${Math.round(desvio * 100)}% de desvio).`,
        });
      }
    }
  }

  const ordem = { alta: 0, media: 1, baixa: 2 } as const;
  return alertas.sort((a, b) => ordem[a.severidade] - ordem[b.severidade]);
}
