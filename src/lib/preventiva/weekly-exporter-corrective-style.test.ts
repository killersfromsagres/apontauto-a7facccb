import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { weeksBetween } from "./capacity";
import { generateWeeklyProgramacao } from "./weekly-exporter";
import type { Equipe, TriagedOS } from "./triage";

function corrective(): TriagedOS {
  const equipe: Equipe = "CIVIL";
  return {
    arquivo: "teste.xlsx",
    os: "1700001",
    chamado: "1700001",
    tipo: "Corretiva",
    nomeOS: "Corrigir vazamento na sala técnica",
    descricao: "Corrigir vazamento na sala técnica",
    categoria: "CIVIL",
    criticidade: "ALTA",
    unidadeNegocio: "",
    ativo: "",
    solicitante: "Teste",
    inicioSLA: "",
    dataLimite: "",
    dataPrevistaMaxima: "",
    status: "aberta",
    dataStatus: "",
    site: "DEMARCHI",
    predio: "A160",
    andar: "Térreo",
    local: "Sala técnica",
    equipamento: "",
    terminoSLA: "2026-09-18",
    terminoSLATs: new Date(2026, 8, 18).getTime(),
    dataConclusao: "",
    raw: { programacaoTipo: "corretiva" },
    equipe,
  };
}

function fillArgb(cell: ExcelJS.Cell) {
  const fill = cell.fill;
  return fill && "fgColor" in fill ? String(fill.fgColor?.argb ?? "") : "";
}

describe("weekly corrective visual identification", () => {
  it("pinta a OS corretiva em vermelho com texto branco", async () => {
    const monday = new Date(2026, 8, 14);
    const week = weeksBetween(monday, new Date(2026, 8, 18))[0];
    const item = corrective();
    const blob = await generateWeeklyProgramacao({
      titulo: "GRUPO GPS",
      week,
      bucketsPorEquipe: new Map([
        ["CIVIL", { week, os: [item], porDia: [[item], [], [], [], []] }],
      ]),
      minutosPorEquipe: { CIVIL: 30 },
      ativoIndex: new Map(),
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    const program = workbook.getWorksheet("PROGRAMAÇÃO")!;

    // A4 é OS; B4 em diante devem manter o estilo normal da linha.
    expect(program.getCell("A4").text).toBe("1700001");
    expect(fillArgb(program.getCell("A4"))).toBe("FFDC2626");
    expect(String(program.getCell("A4").font.color?.argb)).toBe("FFFFFFFF");
    expect(fillArgb(program.getCell("B4"))).not.toBe("FFDC2626");
    expect(fillArgb(program.getCell("C4"))).not.toBe("FFDC2626");

    const teamSheet = workbook.getWorksheet("IMP CIVIL")!;
    expect(fillArgb(teamSheet.getCell("A3"))).toBe("FFDC2626");
    expect(String(teamSheet.getCell("A3").font.color?.argb)).toBe("FFFFFFFF");
    expect(fillArgb(teamSheet.getCell("B3"))).not.toBe("FFDC2626");
  });
});
