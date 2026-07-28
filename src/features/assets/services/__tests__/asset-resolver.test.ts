import { describe, expect, it } from "vitest";

import {
  buildAssetGraph,
  normalizeCode,
  resolveAsset,
  validateAssetRecords,
} from "../asset-resolver";
import type { AssetRecord } from "../../types";

// Recorte real da base DEMARCHI.
const BASE: AssetRecord[] = [
  { code: "DEM", name: "DEMARCHI", level: "PLANTA", parentCode: null },
  { code: "DEMPZ", name: "E171", level: "PRÉDIO / ÁREA", parentCode: "DEM" },
  { code: "DEMPZTE", name: "TÉRREO", level: "ANDAR / PAVIMENTO", parentCode: "DEMPZ" },
  {
    code: "DEMPZTEACM22",
    name: "AREA COMUM - POOL ELÉTRICA E INSTRUMENTAÇÃO",
    level: "AMBIENTE / LOCAL",
    parentCode: "DEMPZTE",
  },
  { code: "DEMPA", name: "E100", level: "PRÉDIO / ÁREA", parentCode: "DEM" },
  { code: "DEMPA01", name: "1º ANDAR", level: "ANDAR / PAVIMENTO", parentCode: "DEMPA" },
  { code: "DEMPA01COP01", name: "COPA 01", level: "AMBIENTE / LOCAL", parentCode: "DEMPA01" },
  {
    code: "DEMPA01COP01AJA001",
    name: "114837 | AR CONDICIONADO DE JANELA 001 [CARRIER]",
    level: "EQUIPAMENTO",
    parentCode: "DEMPA01COP01",
  },
];

const graph = buildAssetGraph(BASE);

describe("normalizeCode", () => {
  it("remove caracteres invisíveis e normaliza caixa, sem perder caracteres válidos", () => {
    expect(normalizeCode("  \u200bdempz-te_01 \ufeff")).toBe("DEMPZ-TE_01");
  });
});

describe("resolveAsset", () => {
  it("resolve Ambiente pela árvore (DEMPZTEACM22)", () => {
    const r = resolveAsset(graph, "DEMPZTEACM22");
    expect(r.predio).toBe("E171");
    expect(r.andar).toBe("TÉRREO");
    expect(r.ambiente).toBe("AREA COMUM - POOL ELÉTRICA E INSTRUMENTAÇÃO");
    expect(r.method).toBe("tree");
    expect(r.found).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("Equipamento usa o Ambiente ancestral mais próximo", () => {
    const r = resolveAsset(graph, "DEMPA01COP01AJA001");
    expect(r.level).toBe("EQUIPAMENTO");
    expect(r.predio).toBe("E100");
    expect(r.andar).toBe("1º ANDAR");
    expect(r.ambiente).toBe("COPA 01");
    expect(r.method).toBe("tree");
  });

  it("Andar deixa Ambiente como não aplicável; Prédio deixa Andar e Ambiente", () => {
    const andar = resolveAsset(graph, "DEMPZTE");
    expect(andar.ambiente).toBe("");
    expect(andar.notApplicable.ambiente).toBe(true);

    const predio = resolveAsset(graph, "DEMPZ");
    expect(predio.andar).toBe("");
    expect(predio.notApplicable).toMatchObject({ andar: true, ambiente: true });
  });

  it("código inexistente cai no fallback legado LEFT(5)/LEFT(7)", () => {
    const r = resolveAsset(graph, "DEMPZTEXXX99");
    expect(r.found).toBe(false);
    expect(r.method).toBe("legacy");
    expect(r.predio).toBe("E171");
    expect(r.andar).toBe("TÉRREO");
    expect(r.ambiente).toBe("");
  });

  it("código sem nenhuma correspondência retorna unmatched", () => {
    const r = resolveAsset(graph, "ZZZZZZZZZZ");
    expect(r.method).toBe("unmatched");
    expect(r.predio).toBe("");
    expect(r.issues).toContain("unmatched-code");
  });

  it("detecta ciclo na árvore", () => {
    const cyclic = buildAssetGraph([
      { code: "A", name: "A", level: "AMBIENTE / LOCAL", parentCode: "B" },
      { code: "B", name: "B", level: "ANDAR / PAVIMENTO", parentCode: "A" },
    ]);
    const r = resolveAsset(cyclic, "A");
    expect(r.issues).toContain("cycle-detected");
  });

  it("detecta pai inexistente", () => {
    const orphan = buildAssetGraph([
      { code: "X1", name: "SALA X", level: "AMBIENTE / LOCAL", parentCode: "NAOEXISTE" },
    ]);
    const r = resolveAsset(orphan, "X1");
    expect(r.issues).toContain("missing-parent:NAOEXISTE");
    expect(r.ambiente).toBe("SALA X");
  });

  it("respeita valores existentes e correção manual", () => {
    const existing = resolveAsset(graph, "DEMPZTEACM22", {
      existing: { predio: "P", andar: "A", ambiente: "AMB" },
    });
    expect(existing.method).toBe("existing-value");

    const manual = resolveAsset(graph, "DEMPZTEACM22", { manual: { ambiente: "SALA NOVA" } });
    expect(manual.method).toBe("manual");
    expect(manual.ambiente).toBe("SALA NOVA");
  });
});

describe("validateAssetRecords", () => {
  it("aponta duplicados, códigos vazios, pais inexistentes e níveis desconhecidos", () => {
    const { issues, valid } = validateAssetRecords([
      { code: "A1", name: "A", level: "AMBIENTE / LOCAL", parentCode: null },
      { code: "A1", name: "A dup", level: "AMBIENTE / LOCAL" },
      { code: "", name: "sem código" },
      { code: "B1", name: "B", level: "COISA ESTRANHA", parentCode: "NADA" },
    ]);
    const types = issues.map((i) => i.type);
    expect(types).toContain("duplicate-code");
    expect(types).toContain("empty-code");
    expect(types).toContain("unknown-level");
    expect(types).toContain("missing-parent");
    expect(valid).toHaveLength(2);
  });
});
