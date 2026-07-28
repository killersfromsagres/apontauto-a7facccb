import { describe, expect, it } from "vitest";
import { rankBacklog, scoreBacklog } from "../backlog-score";

describe("backlog score", () => {
  it("prioriza risco de segurança e SLA vencido", () => {
    const alto = scoreBacklog({
      criticidadeAtivo: 5,
      riscoSeguranca: true,
      impactoOperacional: "alto",
      slaHorasRestantes: -3,
    });
    expect(alto.level).toBe("critico");
    expect(alto.factors.some((f) => f.key === "seguranca")).toBe(true);
  });

  it("penaliza material pendente", () => {
    const semMaterial = scoreBacklog({ criticidadeAtivo: 4, impactoOperacional: "medio" });
    const comPendencia = scoreBacklog({
      criticidadeAtivo: 4,
      impactoOperacional: "medio",
      materialPendente: true,
    });
    expect(comPendencia.score).toBeLessThan(semMaterial.score);
  });

  it("mantém o score entre 0 e 100 e gera justificativas", () => {
    const s = scoreBacklog({
      criticidadeAtivo: 5,
      riscoSeguranca: true,
      impactoOperacional: "alto",
      idadeDias: 120,
      slaHorasRestantes: -50,
      reincidencias: 10,
    });
    expect(s.score).toBeLessThanOrEqual(100);
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.factors.length).toBeGreaterThan(3);
    expect(s.recommendation).toBeTruthy();
  });

  it("ordena o backlog do maior para o menor score", () => {
    const ranked = rankBacklog(
      [
        { id: "a", crit: 1 },
        { id: "b", crit: 5 },
      ],
      (i) => ({ criticidadeAtivo: i.crit, riscoSeguranca: i.crit === 5 }),
    );
    expect(ranked[0].item.id).toBe("b");
  });
});
