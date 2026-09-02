import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { weeksBetween, type WeekBucket } from "./capacity";
import type { DailyTeamLoad } from "./monthly-scheduler";
import type { Equipe, TriagedOS } from "./triage";
import { generateWeeklyProgramacao } from "./weekly-exporter";

function os(id: string, equipe: Equipe, equipamento: string): TriagedOS {
  return {
    arquivo: "teste.xlsx",
    os: id,
    chamado: "",
    tipo: "Preventiva",
    nomeOS: `OS ${id}`,
    descricao: "",
    categoria: equipe.startsWith("CLIMAT")
      ? "CLIMATIZAÇÃO E REFRIGERAÇÃO"
      : "CIVIL",
    criticidade: "",
    unidadeNegocio: "",
    ativo: "ATIVO",
    solicitante: "",
    inicioSLA: "",
    dataLimite: "",
    dataPrevistaMaxima: "",
    status: "",
    dataStatus: "",
    site: "DEMARCHI",
    predio: "A160",
    andar: "1",
    local: "Sala",
    equipamento,
    terminoSLA: "2026-09-18",
    terminoSLATs: new Date(2026, 8, 18).getTime(),
    dataConclusao: "",
    raw: {},
    equipe,
  };
}

describe("generateWeeklyProgramacao", () => {
  it("mantém o modelo A:J e preenche J somente para Refrigeração", async () => {
    const monday = new Date(2026, 8, 14);
    const week = weeksBetween(monday, new Date(2026, 8, 18))[0];
    const civil = os("CIV-1", "CIVIL", "NÃO DEVE SAIR");
    const refrig = os("REF-1", "CLIMATIZAÇÃO E REFRIGERAÇÃO 1", "FANCOIL 01");
    const bucket = (equipe: Equipe, item: TriagedOS): WeekBucket => ({
      week,
      os: [item],
      porDia: [[item], [], [], [], []],
    });
    const load = (equipe: Equipe): DailyTeamLoad => ({
      date: monday,
      dateKey: "2026-09-14",
      dayIndex: 0,
      preventiveCount: 1,
      correctiveCount: 0,
      scheduledMinutes: equipe === "CIVIL" ? 30 : 60,
      remainingMinutes: equipe === "CIVIL" ? 510 : 480,
      targetMinutes: 540,
      correctiveDeficit: 2,
    });
    const buckets = new Map<Equipe, WeekBucket>([
      ["CIVIL", bucket("CIVIL", civil)],
      [
        "CLIMATIZAÇÃO E REFRIGERAÇÃO 1",
        bucket("CLIMATIZAÇÃO E REFRIGERAÇÃO 1", refrig),
      ],
    ]);
    const loads = new Map<Equipe, DailyTeamLoad[]>([
      ["CIVIL", [load("CIVIL")]],
      [
        "CLIMATIZAÇÃO E REFRIGERAÇÃO 1",
        [load("CLIMATIZAÇÃO E REFRIGERAÇÃO 1")],
      ],
    ]);
    const blob = await generateWeeklyProgramacao({
      titulo: "GRUPO GPS",
      week,
      bucketsPorEquipe: buckets,
      cargasPorEquipe: loads,
      minutosPorEquipe: { CIVIL: 30, "CLIMATIZAÇÃO E REFRIGERAÇÃO 1": 60 },
      ativoIndex: new Map(),
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    const program = workbook.worksheets[0];
    expect(program.actualColumnCount).toBe(10);
    expect(program.getColumn(2).width).toBeCloseTo(56.7109375);
    expect(program.getColumn(10).width).toBeCloseTo(68.140625);
    expect(program.getRow(1).height).toBe(42);
    expect(program.getRow(2).height).toBeCloseTo(38.1);
    expect(program.getRow(3).height).toBeCloseTo(119.25);
    expect(program.getCell("J3").value).toBe("");
    expect(program.getCell("J4").value).toBe("FANCOIL 01");
    expect(program.getCell("A2").value).toBe("OS");
    expect(program.getCell("J2").value).toBe("Equipamento");
    expect(workbook.getWorksheet("RESUMO")?.getCell("G5").value).toBe("08:30");
  });
});
