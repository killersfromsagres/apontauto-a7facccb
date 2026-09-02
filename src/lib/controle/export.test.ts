import { describe, expect, it } from "vitest";
import { exportControleMateriais } from "./export";
import type { ControleItem } from "./data";

function sampleItem(): ControleItem {
  return {
    key: "refrigeracao:peca:item-1",
    origem: "refrigeracao",
    tipo: "peca",
    fonte: "execucao_campo",
    itemId: "item-1",
    osId: "os-1",
    numeroOs: "123456",
    solicitacaoNumero: "MAT-001",
    descricaoOs: "Manutenção em equipamento de ar condicionado",
    predio: "A",
    andar: "1º Andar",
    local: "Sala técnica",
    equipe: "Refrigeração 1",
    solicitante: "Teste",
    descricao: "Filtro do fancoil",
    quantidade: 2,
    modelo: "REF-01",
    urgencia: "media",
    gravidade: null,
    statusGestor: "pendente",
    criadoEm: "2026-09-02T12:00:00.000Z",
    meta: null,
  };
}

describe("exportControleMateriais", () => {
  it("gera a planilha vazia sem colisão de células mescladas", async () => {
    const blob = await exportControleMateriais({ itens: [], centros: [], envios: [] });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it("gera a planilha com dados mínimos sem Cannot merge already merged cells", async () => {
    const blob = await exportControleMateriais({ itens: [sampleItem()], centros: [], envios: [] });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});
