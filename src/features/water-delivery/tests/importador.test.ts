/**
 * 23.1 — parser da planilha, cálculo dos dias por ponto, divergências e hash.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  inspecionarPlanilha,
  lerPlanilhaAgua,
  pontoCodigo,
  sha256Hex,
} from "@/features/water-delivery/importer/reader";

type LinhaDia = [string, string, string];

function aba(linhas: LinhaDia[]) {
  return XLSX.utils.aoa_to_sheet([["Prédio", "Andar", "Espaço"], ...linhas]);
}

function planilha(opts: {
  segunda?: LinhaDia[];
  terca?: LinhaDia[];
  quarta?: LinhaDia[];
  consolidada?: (string | number)[][];
  semConsolidada?: boolean;
}): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  if (!opts.semConsolidada) {
    const linhas = opts.consolidada ?? [
      ["Programação GPS", "", "", ""],
      ["Prédio", "Andar", "Espaço", "Período"],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), "PROGRAMAÇÃO 2");
  }
  if (opts.segunda) XLSX.utils.book_append_sheet(wb, aba(opts.segunda), "Segunda-feira");
  if (opts.terca) XLSX.utils.book_append_sheet(wb, aba(opts.terca), "Terça-feira");
  if (opts.quarta) XLSX.utils.book_append_sheet(wb, aba(opts.quarta), "Quarta-feira");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}

describe("inspeção da planilha (etapas 2 e 3 do assistente)", () => {
  it("lista abas, sugere o dia de cada uma e mapeia os cabeçalhos", () => {
    const buf = planilha({
      segunda: [["Bloco D55", "Térreo", "Copa"]],
      terca: [["Bloco D55", "Térreo", "Copa"]],
    });
    const insp = inspecionarPlanilha(buf);

    expect(insp.abas.map((a) => a.nome)).toEqual(["PROGRAMAÇÃO 2", "Segunda-feira", "Terça-feira"]);
    expect(insp.abas[0].consolidada).toBe(true);
    expect(insp.abaPorDia).toMatchObject({ 1: "Segunda-feira", 2: "Terça-feira" });
    expect(insp.mapeamentoSugerido).toMatchObject({
      predio: "Prédio",
      andar: "Andar",
      espaco: "Espaço",
    });
  });
});

describe("parser e cálculo dos dias", () => {
  it("consolida o mesmo ponto em vários dias e conta as visitas", () => {
    const r = lerPlanilhaAgua(
      planilha({
        segunda: [
          ["Bloco D55", "Térreo", "Copa"],
          ["Bloco A1", "1º", "Refeitório"],
        ],
        terca: [["Bloco D55", "Térreo", "Copa"]],
        quarta: [["Bloco D55", "Térreo", "Copa"]],
      }),
    );

    expect(r.pontos).toHaveLength(2);
    const copa = r.pontos.find((p) => p.espaco.includes("COPA"))!;
    expect(copa.dias).toEqual([1, 2, 3]);
    expect(r.porDia).toMatchObject({ 1: 2, 2: 1, 3: 1 });
    expect(r.totalVisitas).toBe(4);
    expect(r.totalLinhas).toBe(4);
    expect(copa.codigo).toBe(pontoCodigo("BLOCO D55", "TERREO", "COPA"));
  });

  it("normaliza grafias diferentes do mesmo prédio em um único ponto", () => {
    const r = lerPlanilhaAgua(
      planilha({
        segunda: [["  bloco   d55 ", "térreo", "copa"]],
        terca: [["BLOCO D55", "TERREO", "COPA"]],
      }),
    );
    expect(r.pontos).toHaveLength(1);
    expect(r.pontos[0].dias).toEqual([1, 2]);
  });

  it("aponta duplicidade quando o ponto se repete no mesmo dia sem contar duas visitas", () => {
    const r = lerPlanilhaAgua(
      planilha({
        segunda: [
          ["Bloco D55", "Térreo", "Copa"],
          ["Bloco D55", "Térreo", "Copa"],
        ],
      }),
    );
    expect(r.porDia[1]).toBe(1);
    expect(r.divergencias.some((d) => d.tipo === "duplicidade_no_dia")).toBe(true);
  });

  it("registra erro em linha sem prédio e ignora linhas totalmente vazias", () => {
    const r = lerPlanilhaAgua(
      planilha({
        segunda: [
          ["", "Térreo", "Copa"],
          ["", "", ""],
        ],
      }),
    );
    expect(r.pontos).toHaveLength(0);
    expect(r.totalLinhas).toBe(1);
    expect(r.divergencias.find((d) => d.tipo === "predio_vazio")?.severidade).toBe("erro");
  });

  it("avisa quando faltam abas diárias e a consolidada", () => {
    const r = lerPlanilhaAgua(
      planilha({ segunda: [["Bloco D55", "Térreo", "Copa"]], semConsolidada: true }),
    );
    const ausentes = r.divergencias.filter((d) => d.tipo === "aba_ausente");
    // terça a sexta + a aba consolidada
    expect(ausentes).toHaveLength(5);
  });

  it("informa os campos que a planilha não possui", () => {
    const r = lerPlanilhaAgua(planilha({ segunda: [["Bloco D55", "Térreo", "Copa"]] }));
    expect(
      r.divergencias.some((d) => d.tipo === "campos_ausentes" && d.severidade === "info"),
    ).toBe(true);
  });
});

describe("divergências contra a aba consolidada", () => {
  const consolidada = (periodo: string) => [
    ["Programação GPS", "", "", ""],
    ["Prédio", "Andar", "Espaço", "Período"],
    ["Bloco D55", "Térreo", "Copa", periodo],
  ];

  it("marca período divergente quando a diária traz dia extra", () => {
    const r = lerPlanilhaAgua(
      planilha({
        segunda: [["Bloco D55", "Térreo", "Copa"]],
        terca: [["Bloco D55", "Térreo", "Copa"]],
        consolidada: consolidada("Segunda"),
      }),
    );
    const div = r.divergencias.find((d) => d.tipo === "periodo_divergente");
    expect(div?.severidade).toBe("alerta");
    expect(r.pontos[0].revisao?.diasExtras).toEqual([2]);
    expect(r.pontos[0].revisao?.diasFaltando).toEqual([]);
    // nada é removido automaticamente: o ponto mantém os dois dias
    expect(r.pontos[0].dias).toEqual([1, 2]);
  });

  it("marca dia faltando quando a consolidada declara mais dias", () => {
    const r = lerPlanilhaAgua(
      planilha({
        segunda: [["Bloco D55", "Térreo", "Copa"]],
        consolidada: consolidada("Segunda e Quarta"),
      }),
    );
    expect(r.pontos[0].revisao?.diasFaltando).toEqual([3]);
  });

  it("aponta ponto que só existe na consolidada", () => {
    const r = lerPlanilhaAgua(
      planilha({
        segunda: [["Bloco A1", "1º", "Refeitório"]],
        consolidada: consolidada("Segunda"),
      }),
    );
    expect(r.divergencias.some((d) => d.tipo === "so_na_consolidada")).toBe(true);
  });

  it("detecta fórmula com erro no cabeçalho da consolidada", () => {
    const r = lerPlanilhaAgua(
      planilha({
        segunda: [["Bloco D55", "Térreo", "Copa"]],
        consolidada: [
          ["Programação GPS", "#VALUE!", "", ""],
          ["Prédio", "Andar", "Espaço", "Período"],
          ["Bloco D55", "Térreo", "Copa", "Segunda"],
        ],
      }),
    );
    expect(r.divergencias.some((d) => d.tipo === "formula_erro")).toBe(true);
  });

  it("unifica grafias diferentes do mesmo prédio e registra o aviso", () => {
    const r = lerPlanilhaAgua(
      planilha({
        segunda: [["Bloco D55", "Térreo", "Copa"]],
        consolidada: [
          ["Programação GPS", "", "", ""],
          ["Prédio", "Andar", "Espaço", "Período"],
          ["Bloco D55", "Térreo", "Copa", "Segunda"],
          ["bloco d55", "Térreo", "Copa", "Segunda"],
        ],
      }),
    );
    expect(r.divergencias.some((d) => d.tipo === "grafia_duplicada")).toBe(true);
  });
});

describe("hash do arquivo importado", () => {
  it("é estável para o mesmo conteúdo e muda com o conteúdo", async () => {
    const a = new TextEncoder().encode("planilha-a").buffer;
    const b = new TextEncoder().encode("planilha-b").buffer;
    const ha = await sha256Hex(a);
    expect(ha).toHaveLength(64);
    expect(ha).toBe(await sha256Hex(new TextEncoder().encode("planilha-a").buffer));
    expect(ha).not.toBe(await sha256Hex(b));
  });
});
