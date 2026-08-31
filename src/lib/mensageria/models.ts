export type MaloteStatus = "aguardando_entrega" | "entregue";
export type EnvioStatus = "preparando" | "enviado" | "finalizado" | "devolvido";
export type EnvioCategoria = "correios" | "juridico" | "malote_interno" | "outro";

export type Setor = {
  id: string;
  nome: string;
  responsavel: string;
};

export type Malote = {
  id: string;
  remetente: string;
  destinatario: string;
  codigo_rastreio: string | null;
  codigo_interno: string | null;
  item_descricao: string | null;
  local_recebimento: string;
  quantidade: number;
  setor: string;
  recebido_em: string | null;
  recebido_por: string;
  assinatura_portaria_data_url: string | null;
  observacoes: string | null;
  status: MaloteStatus;
  entregue_em: string | null;
  entregue_para: string | null;
  assinatura_entrega_data_url: string | null;
  entrega_observacoes: string | null;
  legacy_import: boolean;
  source_key: string | null;
  legacy_source: string | null;
  legacy_source_row: number | null;
  created_at: string;
  updated_at: string;
};

export type Envio = {
  id: string;
  categoria: EnvioCategoria;
  remetente: string;
  destinatario: string;
  codigo_rastreio: string | null;
  item_descricao: string | null;
  nota_fiscal: string | null;
  enviado_em: string | null;
  enviado_por: string | null;
  status: EnvioStatus;
  finalizado_em: string | null;
  observacoes: string | null;
  legacy_import: boolean;
  source_key: string | null;
  legacy_source: string | null;
  legacy_source_row: number | null;
  created_at: string;
  updated_at: string;
};

export type MensageriaSnapshot = {
  malotes: Malote[];
  envios: Envio[];
};
