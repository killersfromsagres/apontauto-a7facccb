import { describe, expect, it } from "vitest";
import type { OsCacheRow } from "./db";
import { buildProgramacaoWorkbook } from "./programacao-excel";

function os(overrides: Partial<OsCacheRow> = {}) {
  return {
    id: "os-test-1",
    numero_os: "223633",
    equipe: "Elétrica",
    solicitante: "Solicitante Teste",
    predio: "Prédio A",
    andar: "1º",
    local: "Sala técnica",
    nome_os: "Correção de quadro elétrico",
    data_criacao: "2026-07-01T10:00:00.000Z",
    material_status: "solicitado",
    status: "aberta",
    ...overrides,
  } as unknown as OsCacheRow;
}

describe("buildProgramacaoWorkbook", () => {
  it("serializa o relatório premium com visão executiva, geral e equipes", async () => {
    const workbook = buildProgramacaoWorkbook(
      [
        os(),
        os({ id: "os-test-2", numero_os: "223634", equipe: "Civil", material_status: null, status: "em andamento" }),
      ],
      "Todas",
      "corretiva",
      new Date("2026-08-31T18:00:00.000Z"),
    );

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Visão Executiva",
      "Programação Geral",
      "Equipe · Civil",
      "Equipe · Elétrica",
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(5_000);
  });

  it("mantém o relatório válido com uma única equipe", async () => {
    const workbook = buildProgramacaoWorkbook([os()], "Elétrica", "corretiva");
    const buffer = await workbook.xlsx.writeBuffer();

    expect(workbook.getWorksheet("Visão Executiva")).toBeDefined();
    expect(workbook.getWorksheet("Programação Geral")).toBeDefined();
    expect(workbook.getWorksheet("Equipe · Elétrica")).toBeDefined();
    expect(buffer.byteLength).toBeGreaterThan(3_000);
  });
});
