
import { describe, expect, it } from "vitest";
import { equipeStyles } from "./equipe";
import { BACKORDER_HEX, PRIORITY_HEX, classifyPriority } from "./priority-classifier";
describe("Corretiva Novo · paleta operacional", () => {
  it("mantém as cores por equipe", () => {
    expect(equipeStyles("Chaveiro").hex).toBe("#8B5CF6"); expect(equipeStyles("Civil").hex).toBe("#2DD4BF");
    expect(equipeStyles("Refrigeração").hex).toBe("#38BDF8"); expect(equipeStyles("Hidráulica").hex).toBe("#F97316");
    expect(equipeStyles("Pintura").hex).toBe("#EC4899"); expect(equipeStyles("Elétrica").hex).toBe("#F59E0B");
  });
  it("usa crítica amarela e Backorder vermelho", () => {
    expect(PRIORITY_HEX.CRÍTICA).toEqual({ bg: "#FACC15", fg: "#111827" });
    expect(BACKORDER_HEX).toEqual({ bg: "#DC2626", fg: "#FFFFFF" });
  });
  it("Backorder isolado não vira crítico", () => {
    const result = classifyPriority({ tipo: "Backorder", nome_os: "Ajustar acabamento", data_criacao: "2026-09-15" }, new Date(2026, 8, 16, 12));
    expect(result.isBackorder).toBe(true); expect(result.level).not.toBe("CRÍTICA");
  });
});
