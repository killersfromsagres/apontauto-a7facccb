import { describe, expect, it } from "vitest";

import {
  normalizeCorrectiveRefrigeracaoTeam,
  refrigeracaoTeamForPredio,
} from "./refrigeracao-routing";

describe("roteamento das corretivas de refrigeração por prédio", () => {
  it("manda C70 para Refrigeração 2 mesmo quando a equipe original diz Refrigeração 1", () => {
    const row = normalizeCorrectiveRefrigeracaoTeam({
      numero_os: "C70-001",
      equipe: "CLIMATIZAÇÃO E REFRIGERAÇÃO 1",
      predio: "C70",
      nome_os: "Corretiva de ar condicionado",
    });

    expect(row.equipe).toBe("CLIMATIZAÇÃO E REFRIGERAÇÃO 2");
  });

  it("manda E35 para Refrigeração 3 mesmo quando a equipe original diz Refrigeração 1", () => {
    const row = normalizeCorrectiveRefrigeracaoTeam({
      numero_os: "E35-001",
      equipe: "REFRIGERAÇÃO 1",
      predio: "E35",
      nome_os: "Falha no fancoil",
    });

    expect(row.equipe).toBe("CLIMATIZAÇÃO E REFRIGERAÇÃO 3");
  });

  it("manda A160 para Refrigeração 1 mesmo quando a equipe original diz Refrigeração 3", () => {
    const row = normalizeCorrectiveRefrigeracaoTeam({
      numero_os: "A160-001",
      equipe: "CLIMATIZAÇÃO E REFRIGERAÇÃO 3",
      predio: "A160",
      nome_os: "Corretiva de climatização",
    });

    expect(row.equipe).toBe("CLIMATIZAÇÃO E REFRIGERAÇÃO 1");
  });

  it("usa a mesma matriz de prédios das preventivas", () => {
    expect(refrigeracaoTeamForPredio("C70")).toBe(
      "CLIMATIZAÇÃO E REFRIGERAÇÃO 2",
    );
    expect(refrigeracaoTeamForPredio("E35")).toBe(
      "CLIMATIZAÇÃO E REFRIGERAÇÃO 3",
    );
    expect(refrigeracaoTeamForPredio("A160")).toBe(
      "CLIMATIZAÇÃO E REFRIGERAÇÃO 1",
    );
  });

  it("não altera equipes que não são de refrigeração", () => {
    const row = normalizeCorrectiveRefrigeracaoTeam({
      equipe: "ELÉTRICA",
      predio: "C70",
      nome_os: "Troca de luminária",
    });

    expect(row.equipe).toBe("ELÉTRICA");
  });
});
