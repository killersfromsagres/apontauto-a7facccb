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

  it("corrige Civil para Elétrica quando há quadro elétrico e componentes industriais", () => {
    const result = designateCorrectiveTeam({
      nome_os: "Reparar quadro elétrico QGBT com disjuntor e contator desarmando",
      equipamento: "QGBT-01",
      local: "Sala elétrica do prédio administrativo",
      equipe: "Civil",
    });

    expect(result.equipe).toBe("Elétrica");
    expect(result.confianca).toBe("alta");
    expect(result.ambiguo).toBe(false);
  });

  it("mantém vazamento em fancoil no domínio de Refrigeração", () => {
    const result = designateCorrectiveTeam({
      nome_os: "Fancoil apresentando vazamento e baixa refrigeração",
      equipamento: "FAN COIL FC-12",
      equipe: "Hidráulica",
    });

    expect(result.equipe).toBe("Refrigeração");
    expect(result.confianca).toBe("alta");
  });

  it("designa fechadura e porta travada para Chaveiro mesmo se origem disser Civil", () => {
    const result = designateCorrectiveTeam({
      nome_os: "Porta travada com problema na fechadura e maçaneta",
      local: "Sala de reunião",
      equipe: "Civil",
    });

    expect(result.equipe).toBe("Chaveiro");
    expect(result.confianca).toBe("alta");
  });

  it("designa torneira, sifão e registro para Hidráulica", () => {
    expect(
      designateCorrectiveTeam({
        nome_os: "Trocar torneira, sifão e registro de água com vazamento",
        equipe: "Civil",
      }).equipe,
    ).toBe("Hidráulica");
  });

  it("designa drywall e gesso para Civil", () => {
    expect(
      designateCorrectiveTeam({
        nome_os: "Reparar drywall e gesso do forro com trinca",
        equipe: "Elétrica",
      }).equipe,
    ).toBe("Civil");
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
