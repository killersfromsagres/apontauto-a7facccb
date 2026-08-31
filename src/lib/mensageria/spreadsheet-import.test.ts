import { describe, expect, it } from "vitest";

import { parseMensageriaSpreadsheet, type SpreadsheetRows } from "./spreadsheet-import";

describe("parseMensageriaSpreadsheet", () => {
  it("usa ENTREGA como histórico consolidado e enriquece por rastreio", () => {
    const sheets: Record<string, SpreadsheetRows> = {
      RECEBIMENTO: [
        ["REMETENTE", "DESTINATARIO", "COD RASTREIO", "STATUS", "ITEM", "DATA RECEBIMENTO"],
        ["Empresa", "Pessoa antiga", "AB 123 BR", "PENDENTE", "3 CAIXAS", 46202],
      ],
      ENTREGA: [
        ["REMETENTE", "DESTINATARIO", "COD RASTREIO", "COD SHERWIN", "DATA RECEBIMENTO", "STATUS", "OBSERVACAO"],
        ["Empresa", "Pessoa correta", "AB123BR", "SW-01", 46202, "ENTREGUE", "FINALIZADO POR TALITA"],
      ],
      CORREIOS: [],
      JURIDICOS: [],
    };

    const result = parseMensageriaSpreadsheet(sheets);

    expect(result.malotes).toHaveLength(1);
    expect(result.malotes[0]).toMatchObject({
      destinatario: "Pessoa correta",
      codigo_rastreio: "AB123BR",
      codigo_interno: "SW01",
      item_descricao: "3 CAIXAS",
      quantidade: 3,
      status: "entregue",
      entregue_em: null,
      entregue_para: null,
      legacy_source_row: 2,
    });
    expect(result.malotes[0].recebido_em).toBe("2026-06-29T12:00:00.000Z");
  });

  it("importa envios sem fabricar datas e informa problemas de qualidade", () => {
    const sheets: Record<string, SpreadsheetRows> = {
      RECEBIMENTO: [],
      ENTREGA: [
        ["REMETENTE", "DESTINATARIO", "COD RASTREIO", "COD SHERWIN", "DATA RECEBIMENTO", "STATUS", "OBSERVACAO"],
        ["Origem", "Jurídico", "N/A", null, "4 CAIXAS", "PENDENTE", null],
      ],
      CORREIOS: [
        ["DATA ENVIO", "REMETENTE", "DESTINATARIO", "COD RASTREIO", "STATUS", "ITEM", "NF", "DATA"],
        ["-", "Origem", "Destino", "OY-123-BR", "FINALIZADO", "1 CAIXA", 284, null],
      ],
      JURIDICOS: [
        ["REMETENTE", "DESTINATARIO", "COD RASTREIO", "STATUS", "DATA ENVIO"],
        ["Prefeitura", "Jurídico", "YO123BR", "ENVIADO", "POR ANA"],
      ],
    };

    const result = parseMensageriaSpreadsheet(sheets);

    expect(result.malotes[0]).toMatchObject({
      codigo_rastreio: null,
      codigo_interno: null,
      recebido_em: null,
      setor: "JURIDICO",
      status: "aguardando_entrega",
    });
    expect(result.envios).toHaveLength(2);
    expect(result.envios[0]).toMatchObject({ categoria: "correios", status: "finalizado", enviado_em: null, finalizado_em: null });
    expect(result.envios[1]).toMatchObject({ categoria: "juridico", status: "enviado", enviado_em: null, observacoes: "Valor original da data: POR ANA" });
    expect(result.warnings).toHaveLength(4);
  });
});
