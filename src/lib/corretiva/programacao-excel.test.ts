import { describe, expect, it } from "vitest";
import type { OsCacheRow } from "./db";
import {
  buildProgramacaoWorkbook,
  OPERATIONS_FONT,
  OPERATIONS_FONT_SIZE,
  OPERATIONS_ROW_HEIGHT,
} from "./programacao-excel";

function os(overrides: Partial<OsCacheRow> & { tipo_importacao?: string | null } = {}) {
  return {
    id: "os-test-1",
    numero_os: "223633",
    equipe: "Elétrica",
    solicitante: "Solicitante Teste",
    predio: "Prédio A",
    andar: "1º",
    local: "Sala técnica",
    nome_os: "Correção de quadro elétrico",
    tipo: "Corretiva",
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
        os({
          id: "os-test-2",
          numero_os: "223634",
          equipe: "Civil",
          material_status: null,
          status: "em andamento",
        }),
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

  it("mantém cabeçalho operacional destacado e campos de leitura maiores", () => {
    const workbook = buildProgramacaoWorkbook([os()], "Todas", "corretiva");
    const sheet = workbook.getWorksheet("Programação Geral")!;
    const header = sheet.getRow(5);
    const data = sheet.getRow(6);

    expect(header.getCell(1).font.name).toBe(OPERATIONS_FONT);
    expect(header.getCell(1).font.size).toBe(10);
    expect(header.getCell(1).font.bold).toBe(true);

    expect(sheet.properties.defaultRowHeight).toBe(OPERATIONS_ROW_HEIGHT);
    expect(data.height).toBeGreaterThanOrEqual(OPERATIONS_ROW_HEIGHT);

    expect(data.getCell(1).font.bold).toBe(true);
    expect(data.getCell(1).font.size).toBeGreaterThanOrEqual(12);
    expect(data.getCell(2).font.name).toBe(OPERATIONS_FONT);
    expect(data.getCell(2).font.bold).toBe(true);
    expect(data.getCell(2).font.size).toBeGreaterThanOrEqual(OPERATIONS_FONT_SIZE - 1);
    expect(data.getCell(7).font.size).toBeGreaterThanOrEqual(12);
    expect(data.getCell(8).font.size).toBeGreaterThanOrEqual(12);
    expect(data.getCell(9).font.size).toBeGreaterThanOrEqual(14);
    expect(data.getCell(9).font.bold).toBe(true);
  });

  it("marca Backorder pela coluna Tipo e no resumo sem transformar a linha inteira", () => {
    const workbook = buildProgramacaoWorkbook(
      [os({ tipo: "Backorder", data_criacao: "2026-08-01T10:00:00.000Z" })],
      "Todas",
      "corretiva",
      new Date("2026-09-16T10:00:00.000Z"),
    );
    const sheet = workbook.getWorksheet("Programação Geral")!;
    const data = sheet.getRow(6);

    expect(data.getCell(3).value).toBe("BACKORDER");
    expect(String((data.getCell(3).fill as any)?.fgColor?.argb)).toBe("FFDC2626");
    expect(sheet.getCell("J3").text).toContain("BACKORDER");
    expect(data.getCell(9).fill).not.toEqual(data.getCell(3).fill);
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
