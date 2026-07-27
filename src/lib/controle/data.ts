// Camada de dados do módulo "Controle de Materiais".
// Consolida pedidos de peças e defeitos apontados nas seções
// Refrigeração e Corretiva, mesclando os metadados de controle
// (centro de custo, requisição, envio para Facilities).

import { supabase } from "@/integrations/supabase/client";

export type Origem = "refrigeracao" | "corretiva";
export type TipoItem = "peca" | "problema";

export type StatusCompra =
  | "aguardando"
  | "solicitado"
  | "em_cotacao"
  | "comprado"
  | "recebido"
  | "cancelado";

export type ControleMeta = {
  id: string;
  origem: Origem;
  tipo: TipoItem;
  item_id: string;
  centro_custo: string | null;
  numero_requisicao: string | null;
  fornecedor: string | null;
  valor_estimado: number | null;
  status_compra: StatusCompra;
  data_solicitacao_facilities: string | null;
  solicitado_por: string | null;
  observacao: string | null;
  updated_at: string;
};

export type ControleItem = {
  key: string;
  origem: Origem;
  tipo: TipoItem;
  itemId: string;
  osId: string;
  numeroOs: string;
  descricaoOs: string | null;
  predio: string | null;
  andar: string | null;
  local: string | null;
  equipe: string | null;
  solicitante: string | null;
  descricao: string;
  quantidade: number | null;
  modelo: string | null;
  urgencia: string | null;
  gravidade: string | null;
  statusGestor: string;
  criadoEm: string;
  meta: ControleMeta | null;
};

export type CentroCusto = {
  id: string;
  codigo: string;
  descricao: string | null;
  responsavel: string | null;
  observacao: string | null;
  ativo: boolean;
};

export type EnvioFacilities = {
  id: string;
  enviado_em: string;
  centro_custo: string | null;
  destinatario: string | null;
  canal: string | null;
  observacao: string | null;
  total_itens: number;
  itens: { descricao: string; numeroOs: string; origem: string }[];
};

export const STATUS_COMPRA_LABEL: Record<StatusCompra, string> = {
  aguardando: "Aguardando",
  solicitado: "Solicitado à Facilities",
  em_cotacao: "Em cotação",
  comprado: "Comprado",
  recebido: "Recebido",
  cancelado: "Cancelado",
};

export const STATUS_COMPRA_ORDER: StatusCompra[] = [
  "aguardando",
  "solicitado",
  "em_cotacao",
  "comprado",
  "recebido",
  "cancelado",
];

type OsRow = {
  id: string;
  numero_os: string;
  nome_os: string | null;
  predio: string | null;
  andar: string | null;
  local: string | null;
  equipe: string | null;
  solicitante?: string | null;
};

function osMap(rows: OsRow[] | null) {
  return new Map((rows ?? []).map((r) => [r.id, r]));
}

export function itemKey(origem: Origem, tipo: TipoItem, itemId: string) {
  return `${origem}:${tipo}:${itemId}`;
}

/** Carrega todos os pedidos de peças e defeitos das duas seções. */
export async function fetchControleItems(): Promise<ControleItem[]> {
  const [rPecas, rProblemas, cPecas, cProblemas, rOs, cOs, metas] = await Promise.all([
    supabase
      .from("refrigeracao_pecas")
      .select("id, os_id, descricao, quantidade, urgencia, observacao, status_gestor, created_at, modelo")
      .order("created_at", { ascending: false }),
    supabase
      .from("refrigeracao_problemas")
      .select("id, os_id, descricao, gravidade, status_gestor, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("corretiva_pecas")
      .select("id, os_id, descricao, quantidade, urgencia, observacao, status_gestor, created_at, modelo")
      .order("created_at", { ascending: false }),
    supabase
      .from("corretiva_problemas")
      .select("id, os_id, descricao, gravidade, status_gestor, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("refrigeracao_os").select("id, numero_os, nome_os, predio, andar, local, equipe"),
    supabase
      .from("corretiva_os")
      .select("id, numero_os, nome_os, predio, andar, local, equipe, solicitante"),
    supabase.from("controle_materiais_meta").select("*"),
  ]);

  const rMap = osMap(rOs.data as OsRow[] | null);
  const cMap = osMap(cOs.data as OsRow[] | null);
  const metaMap = new Map<string, ControleMeta>();
  for (const m of (metas.data ?? []) as ControleMeta[]) {
    metaMap.set(itemKey(m.origem, m.tipo, m.item_id), m);
  }

  const out: ControleItem[] = [];

  const pushPeca = (row: any, origem: Origem) => {
    const os = (origem === "refrigeracao" ? rMap : cMap).get(row.os_id);
    const key = itemKey(origem, "peca", row.id);
    out.push({
      key,
      origem,
      tipo: "peca",
      itemId: row.id,
      osId: row.os_id,
      numeroOs: os?.numero_os ?? "—",
      descricaoOs: os?.nome_os ?? null,
      predio: os?.predio ?? null,
      andar: os?.andar ?? null,
      local: os?.local ?? null,
      equipe: os?.equipe ?? null,
      solicitante: os?.solicitante ?? null,
      descricao: row.descricao,
      quantidade: Number(row.quantidade ?? 0),
      modelo: row.modelo ?? null,
      urgencia: row.urgencia ?? null,
      gravidade: null,
      statusGestor: row.status_gestor,
      criadoEm: row.created_at,
      meta: metaMap.get(key) ?? null,
    });
  };

  const pushProblema = (row: any, origem: Origem) => {
    const os = (origem === "refrigeracao" ? rMap : cMap).get(row.os_id);
    const key = itemKey(origem, "problema", row.id);
    out.push({
      key,
      origem,
      tipo: "problema",
      itemId: row.id,
      osId: row.os_id,
      numeroOs: os?.numero_os ?? "—",
      descricaoOs: os?.nome_os ?? null,
      predio: os?.predio ?? null,
      andar: os?.andar ?? null,
      local: os?.local ?? null,
      equipe: os?.equipe ?? null,
      solicitante: os?.solicitante ?? null,
      descricao: row.descricao,
      quantidade: null,
      modelo: null,
      urgencia: null,
      gravidade: row.gravidade ?? null,
      statusGestor: row.status_gestor,
      criadoEm: row.created_at,
      meta: metaMap.get(key) ?? null,
    });
  };

  (rPecas.data ?? []).forEach((r) => pushPeca(r, "refrigeracao"));
  (cPecas.data ?? []).forEach((r) => pushPeca(r, "corretiva"));
  (rProblemas.data ?? []).forEach((r) => pushProblema(r, "refrigeracao"));
  (cProblemas.data ?? []).forEach((r) => pushProblema(r, "corretiva"));

  out.sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
  return out;
}

/** Cria ou atualiza os metadados de controle de um item. */
export async function upsertMeta(
  item: ControleItem,
  patch: Partial<Omit<ControleMeta, "id" | "origem" | "tipo" | "item_id" | "updated_at">>,
) {
  const { data: sess } = await supabase.auth.getSession();
  const payload = {
    origem: item.origem,
    tipo: item.tipo,
    item_id: item.itemId,
    atualizado_por: sess.session?.user?.id ?? null,
    ...patch,
  };
  const { data, error } = await supabase
    .from("controle_materiais_meta")
    .upsert(payload as any, { onConflict: "origem,tipo,item_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as ControleMeta;
}

export async function fetchCentrosCusto(): Promise<CentroCusto[]> {
  const { data, error } = await supabase
    .from("controle_centros_custo")
    .select("*")
    .order("codigo");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CentroCusto[];
}

export async function saveCentroCusto(input: Partial<CentroCusto> & { codigo: string }) {
  const { error } = await supabase
    .from("controle_centros_custo")
    .upsert(input as any, { onConflict: "codigo" });
  if (error) throw new Error(error.message);
}

export async function deleteCentroCusto(id: string) {
  const { error } = await supabase.from("controle_centros_custo").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function fetchEnvios(): Promise<EnvioFacilities[]> {
  const { data, error } = await supabase
    .from("controle_envios_facilities")
    .select("*")
    .order("enviado_em", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as EnvioFacilities[];
}

/**
 * Registra o envio de um lote de itens para Facilities (comprovação da data)
 * e marca os itens como "solicitado" com a data informada.
 */
export async function registrarEnvioFacilities(params: {
  itens: ControleItem[];
  enviadoEm: string;
  centroCusto?: string | null;
  destinatario?: string | null;
  canal?: string | null;
  observacao?: string | null;
  solicitadoPor?: string | null;
}) {
  const { data: sess } = await supabase.auth.getSession();
  const { error } = await supabase.from("controle_envios_facilities").insert({
    enviado_em: params.enviadoEm,
    centro_custo: params.centroCusto ?? null,
    destinatario: params.destinatario ?? null,
    canal: params.canal ?? null,
    observacao: params.observacao ?? null,
    total_itens: params.itens.length,
    itens: params.itens.map((i) => ({
      descricao: i.descricao,
      numeroOs: i.numeroOs,
      origem: i.origem,
      tipo: i.tipo,
    })),
    criado_por: sess.session?.user?.id ?? null,
  } as any);
  if (error) throw new Error(error.message);

  for (const item of params.itens) {
    await upsertMeta(item, {
      data_solicitacao_facilities: params.enviadoEm,
      status_compra: "solicitado",
      solicitado_por: params.solicitadoPor ?? null,
      ...(params.centroCusto ? { centro_custo: params.centroCusto } : {}),
    });
  }
}
