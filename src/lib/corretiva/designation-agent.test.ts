import { describe, expect, it } from "vitest";
import {
  analyzeCorrectiveOrder,
  planCorrectiveDesignations,
} from "@/lib/corretiva/designation-agent";

describe("agente de designação de corretivas", () => {
  it("realoca troca de chuveiro para Elétrica mesmo com quantidade no texto", () => {
    const result = analyzeCorrectiveOrder({
      nome_os: "Chamado OS 223560 troca 2 chuveiro no vestiario no Z-500",
      equipe: "Civil",
    });

    expect(result.equipe).toBe("Elétrica");
    expect(result.confianca).toBe("alta");
    expect(result.ambiguo).toBe(false);
  });

  it("realoca solicitação de cópia de várias chaves para Chaveiro", () => {
    const result = analyzeCorrectiveOrder({
      nome_os: "Chamado OS 223567 solicito por gentileza a copia de 23 chaves",
      equipe: "Civil",
    });

    expect(result.equipe).toBe("Chaveiro");
    expect(result.confianca).toBe("alta");
    expect(result.ambiguo).toBe(false);
  });

  it("mantém chuveiro com vazamento no domínio da Hidráulica", () => {
    const result = analyzeCorrectiveOrder({
      nome_os: "Chuveiro vazando e registro pingando no vestiário",
      equipe: "Civil",
    });

    expect(result.equipe).toBe("Hidráulica");
    expect(result.confianca).toBe("alta");
  });

  it("monta um plano de realocação para os dois exemplos operacionais", () => {
    const plan = planCorrectiveDesignations([
      {
        id: "223560",
        numero_os: "223560",
        nome_os: "troca 2 chuveiro no vestiario no Z-500",
        equipe: "Civil",
      },
      {
        id: "223567",
        numero_os: "223567",
        nome_os: "solicito por gentileza a copia de 23 chaves",
        equipe: "Civil",
      },
    ]);

    expect(plan.updates).toEqual([
      { id: "223560", numero_os: "223560", equipe: "Elétrica" },
      { id: "223567", numero_os: "223567", equipe: "Chaveiro" },
    ]);
    expect(plan.unchanged).toBe(0);
    expect(plan.reviewNeeded).toBe(0);
  });
});
