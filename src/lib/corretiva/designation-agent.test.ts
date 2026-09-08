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

  it("retira troca de iluminação de Civil e envia para Elétrica", () => {
    const result = analyzeCorrectiveOrder({
      nome_os: "Troca de iluminação, substituir lâmpadas e luminárias queimadas",
      local: "Corredor principal",
      equipe: "Civil",
    });

    expect(result.equipe).toBe("Elétrica");
    expect(result.confianca).toBe("alta");
    expect(result.ambiguo).toBe(false);
  });

  it("retira mictórios e desentupimento de Civil e envia para Hidráulica", () => {
    const result = analyzeCorrectiveOrder({
      nome_os: "Realizar desentupimento de dois mictórios do banheiro masculino",
      equipe: "Civil",
    });

    expect(result.equipe).toBe("Hidráulica");
    expect(result.confianca).toBe("alta");
    expect(result.ambiguo).toBe(false);
  });

  it("corrige privada entupida que estava em Limpeza para Hidráulica", () => {
    const result = analyzeCorrectiveOrder({
      nome_os: "Por favor efetuar a limpeza de uma privada entupida",
      local: "Banheiro masculino",
      equipe: "Limpeza",
    });

    expect(result.equipe).toBe("Hidráulica");
    expect(result.confianca).toBe("alta");
  });

  it("não transforma troca de vidro no banheiro em Hidráulica", () => {
    const result = analyzeCorrectiveOrder({
      nome_os: "Troca do vidro quebrado no vestiário masculino",
      local: "Banheiro masculino",
      equipe: "Civil",
    });

    expect(result.equipe).toBe("Civil");
  });

  it("trata organização de fios como Elétrica mesmo quando o texto cita primeiro piso", () => {
    const result = analyzeCorrectiveOrder({
      nome_os: "Organização dos fios do primeiro piso",
      local: "Administração",
      equipe: "Civil",
    });

    expect(result.equipe).toBe("Elétrica");
    expect(result.confianca).toBe("alta");
    expect(result.ambiguo).toBe(false);
  });

  it("monta um plano de realocação para os exemplos operacionais", () => {
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
      {
        id: "eletrica-1",
        numero_os: "eletrica-1",
        nome_os: "troca de iluminação e luminárias queimadas",
        equipe: "Civil",
      },
      {
        id: "hidraulica-1",
        numero_os: "hidraulica-1",
        nome_os: "desentupimento de mictórios",
        equipe: "Civil",
      },
    ]);

    expect(plan.updates).toEqual([
      { id: "223560", numero_os: "223560", equipe: "Elétrica", source: "technical" },
      { id: "223567", numero_os: "223567", equipe: "Chaveiro", source: "technical" },
      { id: "eletrica-1", numero_os: "eletrica-1", equipe: "Elétrica", source: "technical" },
      { id: "hidraulica-1", numero_os: "hidraulica-1", equipe: "Hidráulica", source: "technical" },
    ]);
    expect(plan.unchanged).toBe(0);
    expect(plan.reviewNeeded).toBe(0);
  });
});
