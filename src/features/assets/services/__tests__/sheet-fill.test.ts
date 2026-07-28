import { describe, expect, it } from "vitest";

import { buildAssetGraph } from "../asset-resolver";
import {
  DEFAULT_FILL_OPTIONS,
  detectAtivoColumn,
  detectHeaderRow,
  detectTargetColumns,
  normHeader,
  processRows,
  accumulate,
  emptyTotals,
} from "../sheet-fill";
import { assertImportFileIsAllowed, sanitizeFileName } from "../../schemas";
import type { AssetRecord } from "../../types";

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
    name: "114837 | AR CONDICIONADO DE JANELA 001",
    level: "EQUIPAMENTO",
    parentCode: "DEMPA01COP01",
  },
];

const graph = buildAssetGraph(BASE);

const targetsFor = (headers: string[], ativoIndex: number) =>
  detectTargetColumns(headers, ativoIndex);

describe("normalização de cabeçalhos", () => {
  it("remove acentos, pontuação, espaços e caracteres invisíveis", () => {
    expect(normHeader("  Localização \u00a0 ")).toBe("LOCALIZACAO");
    expect(normHeader("Cód. do Ativo")).toBe("COD DO ATIVO");
    expect(normHeader("Andar/Pavimento")).toBe("ANDAR PAVIMENTO");
  });
});

describe("detecção da coluna Ativo", () => {
  it("encontra Ativo na primeira coluna", () => {
    const headers = ["Ativo", "Descrição", "Equipe"];
    const rows = [["DEMPZTEACM22", "x", "y"]];
    expect(detectAtivoColumn(headers, rows, graph).index).toBe(0);
  });

  it("encontra Ativo quando movido para outra posição (coluna U)", () => {
    const headers = Array.from({ length: 26 }, (_, i) => `Col ${i}`);
    headers[20] = "Ativo"; // coluna U
    const rows = Array.from({ length: 5 }, () => {
      const r = Array.from({ length: 26 }, () => "x");
      r[20] = "DEMPZTEACM22";
      return r;
    });
    const det = detectAtivoColumn(headers, rows, graph);
    expect(det.index).toBe(20);
    expect(det.confidence).toBe("high");
  });

  it("rejeita “Denominação Ativo” como coluna Ativo", () => {
    const headers = ["Denominação Ativo", "Ativo"];
    const rows = [["AREA COMUM", "DEMPZTEACM22"]];
    expect(detectAtivoColumn(headers, rows, graph).index).toBe(1);
  });

  it("detecta pelo conteúdo mesmo com cabeçalho genérico", () => {
    const headers = ["Coluna 1", "Coluna 2"];
    const rows = Array.from({ length: 6 }, () => ["lixo", "DEMPA01COP01AJA001"]);
    expect(detectAtivoColumn(headers, rows, graph).index).toBe(1);
  });
});

describe("cabeçalho fora da linha 1", () => {
  it("localiza a linha real do cabeçalho", () => {
    const rows = [
      ["Relatório de manutenção", ""],
      ["", ""],
      ["Ativo", "Prédio", "Andar", "Ambiente"],
      ["DEMPZTEACM22", "", "", ""],
    ];
    expect(detectHeaderRow(rows)).toBe(2);
  });
});

describe("colunas de destino", () => {
  it("reporta -1 quando Prédio/Andar/Ambiente não existem (serão criadas)", () => {
    const t = targetsFor(["Ativo", "OS"], 0);
    expect(t.predio).toBe(-1);
    expect(t.andar).toBe(-1);
    expect(t.ambiente).toBe(-1);
  });

  it("reaproveita colunas existentes com sinônimos", () => {
    const t = targetsFor(["Ativo", "Edifício", "Pavimento", "Local"], 0);
    expect(t.predio).toBe(1);
    expect(t.andar).toBe(2);
    expect(t.ambiente).toBe(3);
  });
});

describe("processamento", () => {
  const headers = ["Ativo", "Prédio", "Andar", "Ambiente"];
  const targets = targetsFor(headers, 0);
  const run = (rows: string[][], overwrite = false) =>
    processRows(graph, {
      rows,
      ativoIndex: 0,
      targets,
      headerRow: 0,
      options: { ...DEFAULT_FILL_OPTIONS, overwrite },
    });

  it("resolve DEMPZTEACM22 para E171 / TÉRREO / AREA COMUM - POOL ELÉTRICA E INSTRUMENTAÇÃO", () => {
    const [r] = run([["DEMPZTEACM22", "", "", ""]]);
    expect(r.final).toEqual([
      "E171",
      "TÉRREO",
      "AREA COMUM - POOL ELÉTRICA E INSTRUMENTAÇÃO",
    ]);
  });

  it("usa o Ambiente pai para equipamentos", () => {
    const [r] = run([["DEMPA01COP01AJA001", "", "", ""]]);
    expect(r.final).toEqual(["E100", "1º ANDAR", "COPA 01"]);
    expect(r.status).toBe("tree");
  });

  it("preserva valores existentes por padrão", () => {
    const [r] = run([["DEMPZTEACM22", "MANUAL", "MANUAL", "MANUAL"]]);
    expect(r.final).toEqual(["MANUAL", "MANUAL", "MANUAL"]);
    expect(r.changed).toBe(false);
  });

  it("sobrescreve quando a opção está ativa", () => {
    const [r] = run([["DEMPZTEACM22", "MANUAL", "MANUAL", "MANUAL"]], true);
    expect(r.final[0]).toBe("E171");
    expect(r.changed).toBe(true);
  });

  it("marca não encontrados", () => {
    const [r] = run([["CODIGO-INEXISTENTE", "", "", ""]]);
    expect(r.status).toBe("unmatched");
  });

  it("usa fallback legado por prefixo quando o código exato não existe", () => {
    const [r] = run([["DEMPZTEACM22XYZ", "", "", ""]]);
    expect(r.final[0]).toBe("E171");
    expect(["legacy", "tree", "exact"]).toContain(r.status);
  });

  it("ignora linhas sem ativo", () => {
    const [r] = run([["", "", "", ""]]);
    expect(r.status).toBe("empty");
  });

  it("processa 10 mil linhas e consolida os totais", () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => [
      i % 2 === 0 ? "DEMPZTEACM22" : "NAO-EXISTE",
      "",
      "",
      "",
    ]);
    const results = run(rows);
    expect(results).toHaveLength(10_000);
    const totals = accumulate(emptyTotals(), results);
    expect(totals.rowsWithAsset).toBe(10_000);
    expect(totals.unmatched).toBe(5_000);
  });

  it("processa em lotes preservando a numeração das linhas (cancelamento parcial)", () => {
    const rows = Array.from({ length: 1_000 }, () => ["DEMPZTEACM22", "", "", ""]);
    // Simula o worker interrompido após o primeiro lote.
    const batch = processRows(graph, {
      rows: rows.slice(0, 500),
      ativoIndex: 0,
      targets,
      headerRow: 2,
      options: DEFAULT_FILL_OPTIONS,
    });
    expect(batch).toHaveLength(500);
    expect(batch[0].row).toBe(4);
  });
});

describe("múltiplas abas", () => {
  it("aplica a mesma resolução em abas com layouts diferentes", () => {
    const sheets = [
      { headers: ["Ativo", "Prédio", "Andar", "Ambiente"], rows: [["DEMPZTEACM22", "", "", ""]], idx: 0 },
      { headers: ["OS", "TAG"], rows: [["123", "DEMPA01COP01"]], idx: 1 },
    ];
    const finals = sheets.map((s) =>
      processRows(graph, {
        rows: s.rows,
        ativoIndex: s.idx,
        targets: targetsFor(s.headers, s.idx),
        headerRow: 0,
        options: DEFAULT_FILL_OPTIONS,
      })[0].final,
    );
    expect(finals[0][0]).toBe("E171");
    expect(finals[1]).toEqual(["E100", "1º ANDAR", "COPA 01"]);
  });
});

describe("validação de arquivos importados", () => {
  it("sanitiza nomes de arquivo", () => {
    expect(sanitizeFileName("../../etc/pas swd<>.xlsx")).toBe("pas swd--.xlsx");
  });

  it("aceita planilhas suportadas", () => {
    expect(
      assertImportFileIsAllowed({ name: "base.xlsx", size: 1000, type: "" }).name,
    ).toBe("base.xlsx");
  });

  it("rejeita extensões não suportadas", () => {
    expect(() =>
      assertImportFileIsAllowed({ name: "malware.exe", size: 10, type: "" }),
    ).toThrow();
  });

  it("rejeita arquivos acima do limite", () => {
    expect(() =>
      assertImportFileIsAllowed({ name: "base.xlsx", size: 40 * 1024 * 1024, type: "" }),
    ).toThrow();
  });
});
