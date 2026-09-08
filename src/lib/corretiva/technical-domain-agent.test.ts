import { describe, expect, it } from "vitest";
import { analyzeCorrectiveTechnicalDomain } from "@/lib/corretiva/technical-domain-agent";

describe("agente técnico de domínio das corretivas", () => {
  it("identifica troca de iluminação como Elétrica mesmo se a equipe atual for Civil", () => {
    const result = analyzeCorrectiveTechnicalDomain({
      nome_os: "Solicito troca de iluminação do corredor, com luminárias queimadas",
      local: "Área de circulação",
      equipe: "Civil",
    });

    expect(result.equipe).toBe("Elétrica");
    expect(result.decisive).toBe(true);
  });

  it("entende plurais de lâmpadas, luminárias e tomadas", () => {
    const result = analyzeCorrectiveTechnicalDomain({
      nome_os: "Substituir 12 lâmpadas, 4 luminárias LED e duas tomadas",
      equipe: "Civil",
    });

    expect(result.equipe).toBe("Elétrica");
    expect(result.decisive).toBe(true);
  });

  it("identifica mictórios e desentupimento como Hidráulica", () => {
    const result = analyzeCorrectiveTechnicalDomain({
      nome_os: "Realizar desentupimento de dois mictórios do banheiro masculino",
      equipe: "Civil",
    });

    expect(result.equipe).toBe("Hidráulica");
    expect(result.decisive).toBe(true);
  });

  it("não deixa a palavra limpeza capturar uma privada entupida", () => {
    const result = analyzeCorrectiveTechnicalDomain({
      nome_os: "Por favor efetuar a limpeza de uma privada entupida",
      local: "Banheiro masculino",
      equipe: "Limpeza",
    });

    expect(result.equipe).toBe("Hidráulica");
    expect(result.decisive).toBe(true);
  });

  it("identifica vasos sanitários e descarga como Hidráulica", () => {
    const result = analyzeCorrectiveTechnicalDomain({
      nome_os: "Trocar descargas dos vasos sanitários do vestiário",
      equipe: "Civil",
    });

    expect(result.equipe).toBe("Hidráulica");
    expect(result.decisive).toBe(true);
  });

  it("não usa banheiro como sinal hidráulico quando o serviço é troca de vidro", () => {
    const result = analyzeCorrectiveTechnicalDomain({
      nome_os: "Troca do vidro quebrado no vestiário masculino",
      local: "Banheiro masculino",
      equipe: "Civil",
    });

    expect(result.equipe).toBe("Civil");
    expect(result.scores.Hidráulica).toBeLessThan(result.scores.Civil);
  });

  it("instalação de tomada em banheiro continua sendo Elétrica", () => {
    const result = analyzeCorrectiveTechnicalDomain({
      nome_os: "Instalar duas tomadas de 20 amperes",
      local: "Banheiro / vestiário",
      equipe: "Civil",
    });

    expect(result.equipe).toBe("Elétrica");
    expect(result.decisive).toBe(true);
  });
});
