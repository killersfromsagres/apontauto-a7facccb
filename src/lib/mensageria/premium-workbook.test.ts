import { describe, expect, it } from "vitest";

import type { Envio, Malote } from "@/lib/mensageria/models";
import { buildMensageriaPremiumWorkbook } from "@/lib/mensageria/premium-workbook";

const now = "2026-08-31T17:30:00.000Z";

const malote: Malote = {
  id: "malote-test-1",
  remetente: "Fornecedor Teste",
  destinatario: "Destinatário Teste",
  codigo_rastreio: "BR123456789",
  codigo_interno: "INT-001",
  item_descricao: "Documento técnico",
  local_recebimento: "Portaria",
  quantidade: 1,
  setor: "NÃO CLASSIFICADO",
  recebido_em: now,
  recebido_por: "Portaria",
  assinatura_portaria_data_url: null,
  observacoes: "Registro de teste",
  status: "aguardando_entrega",
  entregue_em: null,
  entregue_para: null,
  assinatura_entrega_data_url: null,
  entrega_observacoes: null,
  legacy_import: false,
  source_key: null,
  legacy_source: null,
  legacy_source_row: null,
  created_at: now,
  updated_at: now,
};

const envio: Envio = {
  id: "envio-test-1",
  categoria: "correios",
  remetente: "Remetente Teste",
  destinatario: "Destino Teste",
  codigo_rastreio: "BR987654321",
  item_descricao: "Envelope",
  nota_fiscal: null,
  enviado_em: now,
  enviado_por: "Usuário Teste",
  status: "enviado",
  finalizado_em: null,
  observacoes: "Envio de teste",
  legacy_import: false,
  source_key: null,
  legacy_source: null,
  legacy_source_row: null,
  created_at: now,
  updated_at: now,
};

describe("buildMensageriaPremiumWorkbook", () => {
  it("serializa o backup premium usando apenas APIs válidas do ExcelJS", async () => {
    const workbook = buildMensageriaPremiumWorkbook([malote], [envio]);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Resumo",
      "Malotes",
      "Envios",
      "Setores",
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(1_000);
  });

  it("continua serializando quando apenas uma coleção possui dados", async () => {
    const workbook = buildMensageriaPremiumWorkbook([malote], []);
    const buffer = await workbook.xlsx.writeBuffer();

    expect(buffer.byteLength).toBeGreaterThan(1_000);
    expect(workbook.getWorksheet("Envios")).toBeDefined();
  });
});
