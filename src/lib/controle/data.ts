// Camada de dados da Central de Materiais.
// Consolida peças/defeitos de Refrigeração e Corretiva e também solicitações
// criadas diretamente pela Execução de Campo, sem depender da conclusão da OS.

import { supabase } from "@/integrations/supabase/client";

export type Origem = "refrigeracao" | "corretiva";
export type TipoItem = "peca" | "problema";
export type FonteRegistro = "apontamento" | "execucao_campo";

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
  fonte: FonteRegistro;
  itemId: string;
  osId: string;
  numeroOs: string;
  solicitacaoNumero: string | null;
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

type MaterialSolicitacaoRow = {
  id: string;
  numero: string | null;
  solicitante: string | null;
  setor: string | null;
  predio: string | null;
  local: string | null;
  prioridade: string | null;
  status: string | null;
  observacao: string | null;
  enviada_em: string | null;
  created_at: string;
  material_solicitacao_itens?: Array<{
    id: string;
    solicitacao_id: string;
    descricao: string;
    unidade: string | null;
    quantidade: number | string | null;
    justificativa: string | null;
  }>;
};

function osMap(rows: OsRow[] | null) {
  return new Map((rows ?? []).map((row) => [row.id, row]));
}

function osNumberMap(rows: OsRow[] | null) {
  return new Map((rows ?? []).map((row) => [normalize(row.numero_os), row]));
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function extractOsNumber(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (!value) continue;
    const match = value.match(/\bOS\s+([A-Z0-9._/-]+)/i);
    if (match?.[1]) return match[1].replace(/[\].,;:]+$/g, "");
  }
  return null;
}

function requestSignature(numeroOs: string, descricao: string, quantidade: number | null) {
  return `${normalize(numeroOs)}|${normalize(descricao).replace(/\s+/g, " ")}|${Number(quantidade || 1)}`;
}

function isFieldRequest(row: MaterialSolicitacaoRow) {
  const text = `${row.observacao ?? ""} ${(row.material_solicitacao_itens ?? [])
    .map((item) => item.justificativa ?? "")
    .join(" ")}`;
  return /Solicitado via OS|Requisitado via Execução de Campo|Referente à OS/i.test(text);
}

function assertQuery(result: { error: { message?: string } | null }, label: string) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message || "falha ao consultar dados"}`);
  }
}

export function itemKey(origem: Origem, tipo: TipoItem, itemId: string) {
  return `${origem}:${tipo}:${itemId}`;
}

/**
 * Carrega a Central de Materiais em duas camadas:
 * 1) apontamentos técnicos (corretiva_pecas/problemas e refrigeração);
 * 2) solicitações da Execução de Campo (material_solicitacoes).
 *
 * A segunda camada garante que um material apareça na Central assim que for
 * solicitado, inclusive em sincronizações offline, sem aguardar a conclusão da OS.
 * Quando os dois registros representam o mesmo pedido, eles são conciliados para
 * evitar duplicidade visual.
 */
export async function fetchControleItems(): Promise<ControleItem[]> {
  const [rPecas, rProblemas, cPecas, cProblemas, rOs, cOs, metas, fieldRequests] =
    await Promise.all([
      supabase
        .from("refrigeracao_pecas")
        .select(
          "id, os_id, descricao, quantidade, urgencia, observacao, status_gestor, created_at, modelo",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("refrigeracao_problemas")
        .select("id, os_id, descricao, gravidade, status_gestor, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("corretiva_pecas")
        .select(
          "id, os_id, descricao, quantidade, urgencia, observacao, status_gestor, created_at, modelo",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("corretiva_problemas")
        .select("id, os_id, descricao, gravidade, status_gestor, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("refrigeracao_os")
        .select("id, numero_os, nome_os, predio, andar, local, equipe"),
      supabase
        .from("corretiva_os")
        .select("id, numero_os, nome_os, predio, andar, local, equipe, solicitante"),
      supabase.from("controle_materiais_meta").select("*"),
      supabase
        .from("material_solicitacoes")
        .select(
          "id, numero, solicitante, setor, predio, local, prioridade, status, observacao, enviada_em, created_at, material_solicitacao_itens(id, solicitacao_id, descricao, unidade, quantidade, justificativa)",
        )
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

  assertQuery(rPecas, "Peças de refrigeração");
  assertQuery(rProblemas, "Problemas de refrigeração");
  assertQuery(cPecas, "Peças de corretiva");
  assertQuery(cProblemas, "Problemas de corretiva");
  assertQuery(rOs, "OS de refrigeração");
  assertQuery(cOs, "OS de corretiva");
  assertQuery(metas, "Metadados da Central de Materiais");
  assertQuery(fieldRequests, "Solicitações da Execução de Campo");

  const rMap = osMap(rOs.data as OsRow[] | null);
  const cMap = osMap(cOs.data as OsRow[] | null);
  const cNumberMap = osNumberMap(cOs.data as OsRow[] | null);
  const metaMap = new Map<string, ControleMeta>();

  for (const meta of (metas.data ?? []) as ControleMeta[]) {
    metaMap.set(itemKey(meta.origem, meta.tipo, meta.item_id), meta);
  }

  const out: ControleItem[] = [];
  const correctiveIndexesBySignature = new Map<string, number[]>();

  const pushPeca = (row: any, origem: Origem) => {
    const os = (origem === "refrigeracao" ? rMap : cMap).get(row.os_id);
    const key = itemKey(origem, "peca", row.id);
    const item: ControleItem = {
      key,
      origem,
      tipo: "peca",
      fonte: "apontamento",
      itemId: row.id,
      osId: row.os_id,
      numeroOs: os?.numero_os ?? "—",
      solicitacaoNumero: null,
      descricaoOs: os?.nome_os ?? null,
      predio: os?.predio ?? null,
      andar: os?.andar ?? null,
      local: os?.local ?? null,
      equipe: os?.equipe ?? null,
      solicitante: os?.solicitante ?? null,
      descricao: row.descricao,
      quantidade: Number(row.quantidade ?? 0) || 1,
      modelo: row.modelo ?? null,
      urgencia: row.urgencia ?? null,
      gravidade: null,
      statusGestor: row.status_gestor ?? "pendente",
      criadoEm: row.created_at,
      meta: metaMap.get(key) ?? null,
    };

    const index = out.push(item) - 1;
    if (origem === "corretiva") {
      const signature = requestSignature(item.numeroOs, item.descricao, item.quantidade);
      const indexes = correctiveIndexesBySignature.get(signature) ?? [];
      indexes.push(index);
      correctiveIndexesBySignature.set(signature, indexes);
    }
  };

  const pushProblema = (row: any, origem: Origem) => {
    const os = (origem === "refrigeracao" ? rMap : cMap).get(row.os_id);
    const key = itemKey(origem, "problema", row.id);
    out.push({
      key,
      origem,
      tipo: "problema",
      fonte: "apontamento",
      itemId: row.id,
      osId: row.os_id,
      numeroOs: os?.numero_os ?? "—",
      solicitacaoNumero: null,
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
      statusGestor: row.status_gestor ?? "pendente",
      criadoEm: row.created_at,
      meta: metaMap.get(key) ?? null,
    });
  };

  (rPecas.data ?? []).forEach((row) => pushPeca(row, "refrigeracao"));
  (cPecas.data ?? []).forEach((row) => pushPeca(row, "corretiva"));
  (rProblemas.data ?? []).forEach((row) => pushProblema(row, "refrigeracao"));
  (cProblemas.data ?? []).forEach((row) => pushProblema(row, "corretiva"));

  for (const request of (fieldRequests.data ?? []) as unknown as MaterialSolicitacaoRow[]) {
    if (!isFieldRequest(request)) continue;

    const requestOsNumber = extractOsNumber(
      request.observacao,
      ...(request.material_solicitacao_itens ?? []).map((item) => item.justificativa),
    );
    if (!requestOsNumber) continue;

    const os = cNumberMap.get(normalize(requestOsNumber));

    for (const requestItem of request.material_solicitacao_itens ?? []) {
      const quantity = Number(requestItem.quantidade ?? 1) || 1;
      const signature = requestSignature(requestOsNumber, requestItem.descricao, quantity);
      const matchingIndexes = correctiveIndexesBySignature.get(signature);
      const existingIndex = matchingIndexes?.shift();

      if (existingIndex !== undefined) {
        out[existingIndex] = {
          ...out[existingIndex],
          fonte: "execucao_campo",
          solicitacaoNumero: request.numero ?? null,
          solicitante: request.solicitante || out[existingIndex].solicitante,
        };
        continue;
      }

      const key = itemKey("corretiva", "peca", requestItem.id);
      out.push({
        key,
        origem: "corretiva",
        tipo: "peca",
        fonte: "execucao_campo",
        itemId: requestItem.id,
        osId: os?.id ?? request.id,
        numeroOs: os?.numero_os ?? requestOsNumber,
        solicitacaoNumero: request.numero ?? null,
        descricaoOs: os?.nome_os ?? "Solicitação criada na Execução de Campo",
        predio: request.predio ?? os?.predio ?? null,
        andar: os?.andar ?? null,
        local: request.local ?? os?.local ?? null,
        equipe: request.setor ?? os?.equipe ?? null,
        solicitante: request.solicitante ?? os?.solicitante ?? null,
        descricao: requestItem.descricao,
        quantidade: quantity,
        modelo: null,
        urgencia: request.prioridade ?? "normal",
        gravidade: null,
        statusGestor: request.status ?? "enviada",
        criadoEm: request.created_at || request.enviada_em || new Date().toISOString(),
        meta: metaMap.get(key) ?? null,
      });
    }
  }

  out.sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
  return out;
}

export async function upsertMeta(
  item: ControleItem,
  patch: Partial<Omit<ControleMeta, "id" | "origem" | "tipo" | "item_id" | "updated_at">>,
) {
  const { data: session } = await supabase.auth.getSession();
  const payload = {
    origem: item.origem,
    tipo: item.tipo,
    item_id: item.itemId,
    atualizado_por: session.session?.user?.id ?? null,
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
  const { data, error } = await supabase.from("controle_centros_custo").select("*").order("codigo");
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

export async function registrarEnvioFacilities(params: {
  itens: ControleItem[];
  enviadoEm: string;
  centroCusto?: string | null;
  destinatario?: string | null;
  canal?: string | null;
  observacao?: string | null;
  solicitadoPor?: string | null;
}) {
  const { data: session } = await supabase.auth.getSession();
  const { error } = await supabase.from("controle_envios_facilities").insert({
    enviado_em: params.enviadoEm,
    centro_custo: params.centroCusto ?? null,
    destinatario: params.destinatario ?? null,
    canal: params.canal ?? null,
    observacao: params.observacao ?? null,
    total_itens: params.itens.length,
    itens: params.itens.map((item) => ({
      descricao: item.descricao,
      numeroOs: item.numeroOs,
      origem: item.origem,
      tipo: item.tipo,
    })),
    criado_por: session.session?.user?.id ?? null,
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
