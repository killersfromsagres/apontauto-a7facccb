import { describe, expect, it } from "vitest";
import { designateCorrectiveTeam } from "@/lib/corretiva/designation-engine";

describe("designateCorrectiveTeam", () => {
  it("designa vazamento e rede pluvial para Hidráulica", () => {
    expect(
      designateCorrectiveTeam({
        nome_os: "Limpeza de calha e caixa pluvial com vazamento",
        local: "Área externa",
        equipe: "Limpeza",
      }).equipe,
    ).toBe("Hidráulica");
  });

  it("mantém contexto de ar-condicionado em Refrigeração mesmo com falha de energia", () => {
    expect(
      designateCorrectiveTeam({
        nome_os: "Ar condicionado sem energia e não está gelando",
        equipamento: "Split 36.000 BTU",
        equipe: "Elétrica",
      }).equipe,
    ).toBe("Refrigeração");
  });

  it("designa falha de iluminação para Elétrica", () => {
    expect(
      designateCorrectiveTeam({
        nome_os: "Substituir luminária e lâmpada queimada",
        local: "Corredor administrativo",
      }).equipe,
    ).toBe("Elétrica");
  });

  it("designa fechadura e porta travada para Chaveiro", () => {
    expect(
      designateCorrectiveTeam({
        nome_os: "Porta travada com problema na fechadura e maçaneta",
        local: "Sala de reunião",
      }).equipe,
    ).toBe("Chaveiro");
  });

  it("designa demarcação e pintura para Pintura", () => {
    expect(
      designateCorrectiveTeam({
        nome_os: "Refazer pintura e demarcação de piso com faixa amarela",
        local: "Galpão",
      }).equipe,
    ).toBe("Pintura");
  });

  it("designa higienização comum para Limpeza", () => {
    expect(
      designateCorrectiveTeam({
        nome_os: "Higienização e limpeza geral da sala",
        local: "Sala administrativa",
      }).equipe,
    ).toBe("Limpeza");
  });

  it("preserva a equipe atual quando não existe qualquer sinal técnico", () => {
    const result = designateCorrectiveTeam({
      nome_os: "Verificar solicitação no local",
      predio: "A100",
      andar: "Térreo",
      equipe: "Civil",
    });

    expect(result.equipe).toBe("Civil");
    expect(result.hasSignal).toBe(false);
    expect(result.preservedCurrent).toBe(true);
  });
});
