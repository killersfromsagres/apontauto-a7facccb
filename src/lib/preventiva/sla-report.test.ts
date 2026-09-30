import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { generateSlaDeadlineReport, slaDeadlineRows } from "./sla-report";
import type { Equipe, TriagedOS } from "./triage";

function item(
  os: string,
  equipe: Equipe,
  terminoSLA: string,
  predio: string,
): TriagedOS {
  return {
    arquivo: `${equipe}.xlsx`,
    os,
    chamado: "",
    tipo: "Preventiva",
    nomeOS: `Preventiva ${os}`,
    descricao: "Teste",
    categoria: equipe.startsWith("CLIMAT")
      ? "CLIMATIZAÇÃO E REFRIGERAÇÃO"
      : equipe === "ELÉTRICA"
        ? "ELÉTRICA"
        : "CIVIL",
    criticidade: "MÉDIA",
    unidadeNegocio: "",
    ativo: `ATIVO-${os}`,
    solicitante: "",
    inicioSLA: "",
    dataLimite: "",
    dataPrevistaMaxima: "",
    status: "Aberta",
    dataStatus: "",
    site: "DEMARCHI",
    predio,
    andar: "1º Andar",
    local: "Sala",
    equipamento: "",
    terminoSLA,
    terminoSLATs: new Date(`${terminoSLA}T12:00:00`).getTime(),
    dataConclusao: "",
    raw: {},
    equipe,
  };
}

describe("relatório de Término SLA", () => {
  it("inclui apenas preventivas que vencem antes do dia 28 e separa por equipe", async () => {
    const rows = [
      item("C-1", "CIVIL", "2026-10-10", "A160"),
      item("E-1", "ELÉTRICA", "2026-10-27", "B200"),
      item("H-28", "HIDRÁULICA", "2026-10-28", "C70"),
      item("R-1", "CLIMATIZAÇÃO E REFRIGERAÇÃO 1", "2026-10-05", "A170"),
    ];

    expect(slaDeadlineRows(rows).map((row) => row.os)).toEqual([
      "C-1",
      "E-1",
      "R-1",
    ]);

    const report = await generateSlaDeadlineReport(
      rows,
      new Date(2026, 9, 1),
    );

    expect(report.total).toBe(3);
    expect(report.filename).toContain("TERMINO SLA");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await report.blob.arrayBuffer());

    const names = workbook.worksheets.map((sheet) => sheet.name);
    expect(names).toContain("RESUMO");
    expect(names).toContain("CIVIL");
    expect(names).toContain("ELÉTRICA");
    expect(names).toContain("REFRIGERAÇÃO 1");
    expect(names).not.toContain("HIDRÁULICA");

    const civil = workbook.getWorksheet("CIVIL")!;
    expect(civil.getCell("B6").text).toBe("C-1");
    expect(civil.getCell("C6").text).toBe("10/10/2026");
    expect(civil.getCell("D6").text).toBe("09/10/2026");

    const summary = workbook.getWorksheet("RESUMO")!;
    expect(summary.getCell("A1").text).toContain("TÉRMINO SLA");
  });
});
