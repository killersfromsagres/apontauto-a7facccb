import { describe, expect, it } from "vitest";

import { PT_STATUS_LABEL, PT_TRANSITIONS, type PTStatus } from "@/lib/taludes/pt";

const can = (from: PTStatus, to: PTStatus) => PT_TRANSITIONS[from].includes(to);

describe("transições da PT", () => {
  it("todo status tem rótulo e lista de transições", () => {
    for (const status of Object.keys(PT_TRANSITIONS) as PTStatus[]) {
      expect(PT_STATUS_LABEL[status]).toBeTruthy();
      expect(Array.isArray(PT_TRANSITIONS[status])).toBe(true);
    }
  });

  it("fluxo feliz: solicitada → em análise → liberada → encerrada", () => {
    expect(can("solicitada", "em_analise")).toBe(true);
    expect(can("em_analise", "liberada")).toBe(true);
    expect(can("liberada", "encerrada")).toBe(true);
  });

  it("chuva suspende a PT liberada e permite retomada", () => {
    expect(can("liberada", "suspensa_chuva")).toBe(true);
    expect(can("suspensa_chuva", "liberada")).toBe(true);
  });

  it("status finais são terminais", () => {
    expect(PT_TRANSITIONS.revogada).toEqual([]);
    expect(PT_TRANSITIONS.encerrada).toEqual([]);
  });

  it("recusa saltos inválidos", () => {
    expect(can("solicitada", "encerrada")).toBe(false);
    expect(can("solicitada", "suspensa_chuva")).toBe(false);
    expect(can("em_analise", "suspensa_chuva")).toBe(false);
    expect(can("encerrada", "liberada")).toBe(false);
  });

  it("qualquer status ativo pode ser revogado", () => {
    for (const s of ["solicitada", "em_analise", "liberada", "suspensa_chuva"] as PTStatus[]) {
      expect(can(s, "revogada")).toBe(true);
    }
  });

  it("nenhum status transiciona para si mesmo", () => {
    for (const s of Object.keys(PT_TRANSITIONS) as PTStatus[]) {
      expect(can(s, s)).toBe(false);
    }
  });
});
