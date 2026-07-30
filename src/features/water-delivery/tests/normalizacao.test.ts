/**
 * 23.1 — normalização de local e detecção de duplicidade.
 */
import { describe, expect, it } from "vitest";

import {
  caixaTitulo,
  chaveFonetica,
  chaveLocal,
  detectarDuplicidades,
  limparTexto,
  normalizarCodigo,
  normalizarTelefone,
  similaridade,
} from "@/features/water-delivery/schemas/normalize";
import { normalizarPonto } from "@/features/water-delivery/queries/api";

describe("normalização de local", () => {
  it("colapsa espaços, normaliza traços e preserva acentos", () => {
    expect(limparTexto("  Bloco   D55–D85  ")).toBe("Bloco D55 - D85");
    expect(limparTexto("Refeitório\u00a0Central")).toBe("Refeitório Central");
    expect(limparTexto(null)).toBe("");
  });

  it("aplica caixa de título mantendo siglas e preposições", () => {
    expect(caixaTitulo("copa do refeitório")).toBe("Copa do Refeitório");
    expect(caixaTitulo("ambulatorio - RH - copa")).toBe("Ambulatorio - RH - Copa");
    expect(caixaTitulo("2º andar")).toBe("2º Andar");
  });

  it("padroniza código interno e telefone", () => {
    expect(normalizarCodigo(" d55 - d85 copa ")).toBe("D55-D85-COPA");
    expect(normalizarTelefone("11987654321")).toBe("(11) 98765-4321");
    expect(normalizarTelefone("1134567890")).toBe("(11) 3456-7890");
    expect(normalizarTelefone("4521")).toBe("4521"); // ramal
  });

  it("normaliza o cadastro inteiro do ponto", () => {
    const p = normalizarPonto({
      codigo: "d55 copa",
      predio: "  bloco   d55 ",
      andar: "terreo",
      espaco: "copa  central",
      contato_telefone: "11 98765-4321",
      observacao: "  sem   acesso aos sábados ",
    } as any);
    expect(p.codigo).toBe("D55-COPA");
    expect(p.predio).toBe("Bloco D55");
    expect(p.espaco).toBe("Copa Central");
    expect(p.contato_telefone).toBe("(11) 98765-4321");
    expect(p.observacao).toBe("sem acesso aos sábados");
  });

  it("gera a mesma chave canônica para grafias diferentes do mesmo local", () => {
    expect(chaveLocal("Bloco D55", "Térreo", "Copa")).toBe(
      chaveLocal("bloco d55", "terreo", "COPA"),
    );
    expect(chaveLocal("Bloco D55", "1º", "Copa")).not.toBe(chaveLocal("Bloco D55", "2º", "Copa"));
  });
});

describe("detecção de duplicidade", () => {
  const lista = [
    { id: "1", predio: "Bloco D55", andar: "Térreo", espaco: "Copa" },
    { id: "2", predio: "Bloco D55", andar: "Térreo", espaco: "Circulação" },
    { id: "3", predio: "Bloco A1", andar: "1º", espaco: "Refeitório" },
  ];

  it("acha duplicidade exata mesmo com acento e caixa diferentes", () => {
    const achados = detectarDuplicidades(
      { predio: "bloco d55", andar: "terreo", espaco: "copa" },
      lista,
    );
    expect(achados[0].tipo).toBe("exata");
    expect(achados[0].registro.id).toBe("1");
  });

  it("acha duplicidade fonética (grafia trocada)", () => {
    const achados = detectarDuplicidades(
      { predio: "Bloco D55", andar: "Terreo", espaco: "Ciculasão" },
      [{ id: "9", predio: "Bloco D55", andar: "Terreo", espaco: "Circulacao" }],
    );
    expect(chaveFonetica("Ciculasão")).not.toBe("");
    expect(achados.length).toBeGreaterThan(0);
    expect(achados[0].score).toBeGreaterThanOrEqual(0.86);
  });

  it("acha similaridade textual acima do limiar e ignora locais diferentes", () => {
    expect(similaridade("COPA", "COPA")).toBe(1);
    const achados = detectarDuplicidades(
      { predio: "Bloco D55", andar: "Térreo", espaco: "Copaa" },
      lista,
    );
    expect(achados.some((a) => a.registro.id === "1")).toBe(true);
    expect(achados.some((a) => a.registro.id === "3")).toBe(false);
  });

  it("nunca acusa o próprio registro em edição", () => {
    expect(
      detectarDuplicidades(
        { id: "1", predio: "Bloco D55", andar: "Térreo", espaco: "Copa" },
        lista,
      ),
    ).toEqual([]);
  });

  it("devolve no máximo cinco sugestões, das mais fortes para as mais fracas", () => {
    const muitos = Array.from({ length: 12 }, (_, i) => ({
      id: `x${i}`,
      predio: "Bloco D55",
      andar: "Térreo",
      espaco: "Copa",
    }));
    const achados = detectarDuplicidades(
      { predio: "Bloco D55", andar: "Térreo", espaco: "Copa" },
      muitos,
    );
    expect(achados).toHaveLength(5);
    expect(achados[0].score).toBeGreaterThanOrEqual(achados[4].score);
  });
});
