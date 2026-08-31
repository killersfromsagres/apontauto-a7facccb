import type { MensageriaSpreadsheetImport } from "./spreadsheet-import";
import type { Envio, Malote, MensageriaSnapshot } from "./models";

export function mapSpreadsheetHistoryToLocal(
  parsed: MensageriaSpreadsheetImport,
  importedAt = new Date().toISOString(),
): MensageriaSnapshot {
  const malotes: Malote[] = parsed.malotes.map((item) => ({
    id: `planilha-entrega-${item.legacy_source_row}`,
    remetente: item.remetente,
    destinatario: item.destinatario,
    codigo_rastreio: item.codigo_rastreio,
    codigo_interno: item.codigo_interno,
    item_descricao: item.item_descricao,
    local_recebimento: item.local_recebimento,
    quantidade: item.quantidade,
    setor: item.setor,
    recebido_em: item.recebido_em,
    recebido_por: item.recebido_por,
    assinatura_portaria_data_url: null,
    observacoes: item.observacoes,
    status: item.status,
    entregue_em: item.entregue_em,
    entregue_para: item.entregue_para,
    assinatura_entrega_data_url: null,
    entrega_observacoes: item.entrega_observacoes,
    legacy_import: true,
    source_key: `${item.legacy_source}:${item.legacy_source_row}`,
    legacy_source: item.legacy_source,
    legacy_source_row: item.legacy_source_row,
    created_at: item.recebido_em ?? importedAt,
    updated_at: importedAt,
  }));

  const envios: Envio[] = parsed.envios.map((item) => ({
    id: `planilha-envio-${item.categoria}-${item.legacy_source_row}`,
    categoria: item.categoria,
    remetente: item.remetente,
    destinatario: item.destinatario,
    codigo_rastreio: item.codigo_rastreio,
    item_descricao: item.item_descricao,
    nota_fiscal: item.nota_fiscal,
    enviado_em: item.enviado_em,
    enviado_por: item.enviado_por,
    status: item.status,
    finalizado_em: item.finalizado_em,
    observacoes: item.observacoes,
    legacy_import: true,
    source_key: `${item.legacy_source}:${item.legacy_source_row}`,
    legacy_source: item.legacy_source,
    legacy_source_row: item.legacy_source_row,
    created_at: item.enviado_em ?? importedAt,
    updated_at: importedAt,
  }));

  return { malotes, envios };
}
