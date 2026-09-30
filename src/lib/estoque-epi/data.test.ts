import { describe, expect, it } from "vitest";

import {
  estoqueStatus,
  inventoryValue,
  type EstoqueItem,
} from "./data";

function item(
  estoqueAtual: number,
  estoqueIdeal: number | null,
  estoqueMinimo: number | null,
): EstoqueItem {
  return {
    id: "item-1",
    codigo: "001",
    descricao: "Luva teste",
    categoria: "Luvas",
    tamanho: "M",
    ca_numero: "12345",
    unidade: "UN",
    estoque_atual: estoqueAtual,
    estoque_ideal: estoqueIdeal,
    estoque_minimo: estoqueMinimo,
    valor_unitario: 10,
    ativo: true,
    created_at: "2026-09-30T12:00:00Z",
    updated_at: "2026-09-30T12:00:00Z",
  };
}

describe("estoqueStatus", () => {
  it("distingue zerado, crítico, comprar, ideal e acima", () => {
    expect(estoqueStatus(item(0, 10, 3))).toBe("ZERADO");
    expect(estoqueStatus(item(2, 10, 3))).toBe("CRÍTICO");
    expect(estoqueStatus(item(6, 10, 3))).toBe("COMPRAR");
    expect(estoqueStatus(item(10, 10, 3))).toBe("IDEAL");
    expect(estoqueStatus(item(14, 10, 3))).toBe("ACIMA");
  });

  it("calcula o valor físico do estoque", () => {
    expect(inventoryValue(item(7, 10, 3))).toBe(70);
  });
});
