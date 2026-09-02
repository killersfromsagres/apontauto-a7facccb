import { describe, expect, it } from "vitest";
import { resolveMaterialRequestOrigin } from "./data";

const refrigeracaoOs = new Map([
  ["9001", { id: "r-1", numero_os: "9001", nome_os: "Fancoil", predio: "A", andar: "1", local: "Sala", equipe: "Refrigeração 1" }],
]);

const corretivaOs = new Map([
  ["8001", { id: "c-1", numero_os: "8001", nome_os: "Tomada", predio: "B", andar: "2", local: "Sala", equipe: "Elétrica" }],
]);

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    numero: null,
    solicitante: "Teste",
    setor: null,
    predio: null,
    local: null,
    prioridade: "normal",
    status: "enviada",
    observacao: null,
    enviada_em: null,
    created_at: "2026-09-02T12:00:00.000Z",
    material_solicitacao_itens: [],
    ...overrides,
  } as any;
}

describe("resolveMaterialRequestOrigin", () => {
  it("identifica Refrigeração pela OS existente", () => {
    const result = resolveMaterialRequestOrigin({
      request: request(),
      requestOsNumber: "9001",
      refrigeracaoOs: refrigeracaoOs as any,
      corretivaOs: corretivaOs as any,
    });
    expect(result.origem).toBe("refrigeracao");
    expect(result.os?.id).toBe("r-1");
  });

  it("identifica Corretiva pela OS existente", () => {
    const result = resolveMaterialRequestOrigin({
      request: request(),
      requestOsNumber: "8001",
      refrigeracaoOs: refrigeracaoOs as any,
      corretivaOs: corretivaOs as any,
    });
    expect(result.origem).toBe("corretiva");
    expect(result.os?.id).toBe("c-1");
  });

  it("usa contexto HVAC quando o mesmo número existir nas duas origens", () => {
    const sharedRefrigeracao = new Map([["7001", { ...refrigeracaoOs.get("9001"), id: "r-7", numero_os: "7001" }]]);
    const sharedCorretiva = new Map([["7001", { ...corretivaOs.get("8001"), id: "c-7", numero_os: "7001" }]]);
    const result = resolveMaterialRequestOrigin({
      request: request({ setor: "Refrigeração 2", observacao: "Material para fancoil / HVAC" }),
      requestOsNumber: "7001",
      refrigeracaoOs: sharedRefrigeracao as any,
      corretivaOs: sharedCorretiva as any,
    });
    expect(result.origem).toBe("refrigeracao");
    expect(result.os?.id).toBe("r-7");
  });
});
