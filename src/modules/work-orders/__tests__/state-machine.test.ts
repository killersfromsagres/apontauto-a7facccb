import { describe, expect, it } from "vitest";
import { canTransition, isTerminal, nextStatuses, slaState } from "../domain/state-machine";

describe("work order state machine", () => {
  it("permite transições válidas", () => {
    expect(canTransition("corretiva", "aberta", "programada").ok).toBe(true);
    expect(canTransition("corretiva", "em_execucao", "concluida").ok).toBe(true);
  });

  it("bloqueia transições inválidas", () => {
    expect(canTransition("corretiva", "aberta", "concluida").ok).toBe(false);
    expect(canTransition("corretiva", "concluida", "em_execucao").ok).toBe(false);
    expect(canTransition("corretiva", "aberta", "aberta").ok).toBe(false);
  });

  it("identifica estados terminais", () => {
    expect(isTerminal("refrigeracao", "concluida")).toBe(true);
    expect(isTerminal("refrigeracao", "aberta")).toBe(false);
    expect(nextStatuses("refrigeracao", "aberta").length).toBeGreaterThan(0);
  });

  it("calcula o estado do SLA", () => {
    const created = new Date("2026-07-27T08:00:00");
    expect(slaState("corretiva", "critica", created, new Date("2026-07-27T09:00:00"))).toBe("ok");
    expect(slaState("corretiva", "critica", created, new Date("2026-07-27T11:30:00"))).toBe("atencao");
    expect(slaState("corretiva", "critica", created, new Date("2026-07-27T13:00:00"))).toBe("vencido");
  });
});
