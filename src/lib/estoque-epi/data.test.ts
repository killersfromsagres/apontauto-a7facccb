import { describe, expect, it } from "vitest";

import { inventoryValue, type EstoqueItem } from "./data";

function item(estoqueAtual: number, valorUnitario = 10): EstoqueItem {
  return {
    id: "item-1",
    codigo: "001",
    descricao: "Luva teste",
    categoria: "Luvas",
    tamanho: "M",
    ca_numero: "12345",
    unidade: "UN",
    estoque_atual: estoqueAtual,
    valor_unitario: valorUnitario,
    ativo: true,
    created_at: "2026-09-30T12:00:00Z",
    updated_at: "2026-09-30T12:00:00Z",
  };
}

describe("controle de estoque por quantidade", () => {
  it("calcula o valor físico somente pela quantidade atual e valor unitário", () => {
    expect(inventoryValue(item(7))).toBe(70);
    expect(inventoryValue(item(0))).toBe(0);
    expect(inventoryValue(item(3, 12.5))).toBe(37.5);
  });

  it("não depende de estoque mínimo ou ideal", () => {
    const current = item(4);
    expect(current).not.toHaveProperty("estoque_minimo");
    expect(current).not.toHaveProperty("estoque_ideal");
    expect(current.estoque_atual).toBe(4);
  });
});
