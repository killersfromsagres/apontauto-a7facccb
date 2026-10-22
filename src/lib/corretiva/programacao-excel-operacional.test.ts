import { describe, expect, it } from "vitest";
import { buildProgramacaoWorkbook, type ProgramacaoExportRow } from "./programacao-excel";

const base = (patch: Partial<ProgramacaoExportRow>): ProgramacaoExportRow => ({
  id: crypto.randomUUID(),
  numero_os: "OS-1",
  nome_os: "Atividade teste",
  predio: "A220",
  andar: "1",
  local: "Sala",
  tipo: "Corretiva",
  equipe: "Civil",
  data_sla: null,
  data_programada: null,
  inicio: null,
  fim: null,
  ativo: "AT-01",
  equipamento: "Equipamento",
  patrimonio: null,
  status: "aberta",
  updated_at: "2026-10-22T10:00:00Z",
  solicitante: "Solicitante",
  data_criacao: "2026-10-22T10:00:00Z",
  ...patch,
});

describe("Excel operacional de corretivas", () => {
  it("mantém abas por equipe e informa situação, peça e programação", () => {
    const rows: ProgramacaoExportRow[] = [
      base({ numero_os: "100", equipe: "Civil", situacao_exportacao: "PENDENTE", peca_solicitada: true, esta_na_programacao: false }),
      base({ numero_os: "101", equipe: "Elétrica", situacao_exportacao: "PROGRAMADO", peca_solicitada: false, esta_na_programacao: true, programacao_dia: "Segunda-feira", programacao_periodo: "20/10/2026 a 24/10/2026" }),
      base({ numero_os: "102", equipe: "Civil", situacao_exportacao: "BACKORDER", peca_solicitada: true, esta_na_programacao: true, programacao_dia: "Terça-feira" }),
      base({ numero_os: "103", equipe: "Civil", status: "cancelada", situacao_exportacao: "PENDENTE" }),
    ];

    const workbook = buildProgramacaoWorkbook(rows, "Todas as equipes", "operacional", new Date("2026-10-22T12:00:00Z"));
    const general = workbook.getWorksheet("Programação Geral");
    expect(general).toBeTruthy();
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(
      expect.arrayContaining(["Programação Geral", "Equipe · Civil", "Equipe · Elétrica"]),
    );

    const headers = general!.getRow(2).values as unknown[];
    expect(headers).toEqual(expect.arrayContaining(["Situação", "Peça solicitada?", "Está na programação?", "Programação"]));

    expect(general!.getCell("B3").value).toBe("PENDENTE");
    expect(general!.getCell("J3").value).toBe("SIM");
    expect(general!.getCell("K3").value).toBe("NÃO");
    expect(general!.getCell("B4").value).toBe("PROGRAMADO");
    expect(general!.getCell("K4").value).toBe("SIM");
    expect(String(general!.getCell("L4").value)).toContain("Segunda-feira");
    expect(general!.getCell("B5").value).toBe("BACKORDER");
    expect(general!.rowCount).toBe(5);
  });
});
