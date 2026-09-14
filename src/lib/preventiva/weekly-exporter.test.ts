import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { weeksBetween, type WeekBucket } from "./capacity";
import type { DailyTeamLoad } from "./monthly-scheduler";
import type { Equipe, TriagedOS } from "./triage";
import {
  buildWeeklyPrintHtml,
  generateWeeklyProgramacao,
} from "./weekly-exporter";

function os(
  id: string,
  equipe: Equipe,
  equipamento: string,
  tipo = "Preventiva",
): TriagedOS {
  return {
    arquivo: "teste.xlsx",
    os: id,
    chamado: "",
    tipo,
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
    raw: tipo === "Corretiva" ? { programacaoTipo: "corretiva" } : {},
    equipe,
  };
}

describe("generateWeeklyProgramacao", () => {
  it("mantém o modelo A:J, cria referência compacta de SLA e preenche J somente para Refrigeração", async () => {
    const monday = new Date(2026, 8, 14);
    const week = weeksBetween(monday, new Date(2026, 8, 18))[0];
    const civil = os("CIV-1", "CIVIL", "NÃO DEVE SAIR", "Corretiva");
    const civilTuesday = os("CIV-2", "CIVIL", "NÃO DEVE SAIR");
    const refrig = os("REF-1", "CLIMATIZAÇÃO E REFRIGERAÇÃO 1", "FANCOIL 01");
    const mondayLoad = (equipe: Equipe): DailyTeamLoad => ({
      date: monday,
      dateKey: "2026-09-14",
      dayIndex: 0,
      preventiveCount: equipe === "CIVIL" ? 0 : 1,
      correctiveCount: equipe === "CIVIL" ? 1 : 0,
      scheduledMinutes: equipe === "CIVIL" ? 30 : 60,
      remainingMinutes: equipe === "CIVIL" ? 510 : 480,
      targetMinutes: 540,
      correctiveDeficit: equipe === "CIVIL" ? 1 : 2,
    });
    const tuesdayLoad: DailyTeamLoad = {
      date: new Date(2026, 8, 15),
      dateKey: "2026-09-15",
      dayIndex: 1,
      preventiveCount: 1,
      correctiveCount: 0,
      scheduledMinutes: 30,
      remainingMinutes: 510,
      targetMinutes: 540,
      correctiveDeficit: 2,
    };
    const buckets = new Map<Equipe, WeekBucket>([
      [
        "CIVIL",
        {
          week,
          os: [civil, civilTuesday],
          porDia: [[civil], [civilTuesday], [], [], []],
        },
      ],
      [
        "CLIMATIZAÇÃO E REFRIGERAÇÃO 1",
        { week, os: [refrig], porDia: [[refrig], [], [], [], []] },
      ],
    ]);
    const loads = new Map<Equipe, DailyTeamLoad[]>([
      ["CIVIL", [mondayLoad("CIVIL"), tuesdayLoad]],
      [
        "CLIMATIZAÇÃO E REFRIGERAÇÃO 1",
        [mondayLoad("CLIMATIZAÇÃO E REFRIGERAÇÃO 1")],
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
    const xlsxBuffer = await blob.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsxBuffer);
    const program = workbook.worksheets[0];
    expect(workbook.worksheets).toHaveLength(5);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain(
      "IMP CIVIL",
    );
    expect(workbook.worksheets.map((sheet) => sheet.name)).toContain(
      "IMP REFRIG 1",
    );
    expect(program.name).toBe("PROGRAMAÇÃO");

    expect(program.actualColumnCount).toBe(10);
    expect(program.getColumn(2).width).toBeCloseTo(56.7109375);
    expect(program.getColumn(10).width).toBeCloseTo(68.140625);
    expect(program.getRow(1).height).toBe(42);
    expect(program.getRow(2).height).toBe(28);
    expect(program.getRow(3).height).toBeCloseTo(38.1);
    expect(program.getRow(4).height).toBeCloseTo(119.25);
    expect(program.getCell("J4").value).toBeNull();
    expect(program.getCell("J5").value).toBe("FANCOIL 01");
    expect(program.getCell("F4").value).toBe("Corretiva");
    expect(program.getCell("A2").text).toContain("SEGUNDA-FEIRA");
    expect(program.getCell("A3").value).toBe("OS");
    expect(program.getCell("J3").value).toBe("Equipamento");
    expect(program.getCell("A6").text).toContain("TERÇA-FEIRA");
    expect(workbook.getWorksheet("RESUMO")?.getCell("G5").value).toBe("08:30");

    const slaSheet = workbook.getWorksheet("SLA APONTAMENTO")!;
    expect(slaSheet.getCell("A4").value).toBe("OS");
    expect(slaSheet.getCell("B4").value).toBe("Término SLA");
    expect(slaSheet.getCell("C4").value).toBe("Equipe");
    expect(slaSheet.getCell("B5").value).toBe("18/09/2026");

    const zip = await JSZip.loadAsync(xlsxBuffer);
    const programXml = await zip
      .file("xl/worksheets/sheet1.xml")!
      .async("string");
    expect(programXml).toContain('<rowBreaks count="1" manualBreakCount="1">');

    const html = await buildWeeklyPrintHtml(blob);
    const printSections = html.match(
      /<section class="day-sheet[\s\S]*?<\/section>/g,
    )!;
    expect(printSections).toHaveLength(3);
    expect(html.match(/PROGRAMAÇÃO SEMANAL/g)).toHaveLength(3);
    expect(html).not.toContain("APONTAMENTO ANTECIPADO");
    expect(printSections[0]).toContain("EQUIPE CIVIL");
    expect(printSections[1]).toContain("EQUIPE CIVIL");
    expect(printSections[0]).not.toContain("CLIMATIZAÇÃO E REFRIGERAÇÃO 1");
    expect(printSections[1]).not.toContain("CLIMATIZAÇÃO E REFRIGERAÇÃO 1");
    expect(printSections[2]).toContain("EQUIPE CLIMATIZAÇÃO E REFRIGERAÇÃO 1");
    expect(printSections[2]).not.toContain(">CIVIL<");
    expect(html.indexOf('data-team="CIVIL"')).toBeLessThan(
      html.indexOf('data-team="CLIMATIZAÇÃO E REFRIGERAÇÃO 1"'),
    );
    expect(html).toContain("print-color-adjust: exact !important");
    expect(html).toContain("page-break-after: always");
    expect(html).toContain("background-color:#0B1F33");
  });

  it("ordena cada dia por prédio e pela sequência física dos andares", async () => {
    const monday = new Date(2026, 8, 14);
    const week = weeksBetween(monday, new Date(2026, 8, 18))[0];
    const located = (id: string, predio: string, andar: string): TriagedOS => ({
      ...os(id, "CIVIL", ""),
      predio,
      andar,
    });
    const mondayItems = [
      located("A220-2", "A220", "2º Andar"),
      located("A160-2", "A160", "2º Andar"),
      located("A160-T", "A160", "Térreo"),
      located("A160-1", "A160", "1º Andar"),
      located("A160-S2", "A160", "2º Sub Solo"),
      located("A160-S1", "A160", "1º Sub-Solo"),
      located("D55-X", "D55", ""),
      located("C70-T", "C70", "TÉRREO"),
      located("SEM-PREDIO", "", "Térreo"),
    ];
    const tuesday = located("TER-1", "A160", "1º Andar");
    const load = (date: Date, dayIndex: number): DailyTeamLoad => ({
      date,
      dateKey: `2026-09-${14 + dayIndex}`,
      dayIndex,
      preventiveCount: dayIndex === 0 ? mondayItems.length : 1,
      correctiveCount: 0,
      scheduledMinutes: 240,
      remainingMinutes: 300,
      targetMinutes: 540,
      correctiveDeficit: 2,
    });
    const blob = await generateWeeklyProgramacao({
      titulo: "GRUPO GPS",
      week,
      bucketsPorEquipe: new Map([
        [
          "CIVIL",
          {
            week,
            os: [...mondayItems, tuesday],
            porDia: [mondayItems, [tuesday], [], [], []],
          },
        ],
      ]),
      cargasPorEquipe: new Map([
        ["CIVIL", [load(monday, 0), load(new Date(2026, 8, 15), 1)]],
      ]),
      minutosPorEquipe: { CIVIL: 30 },
      ativoIndex: new Map(),
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    const program = workbook.getWorksheet("PROGRAMAÇÃO")!;
    const order = Array.from({ length: 9 }, (_, index) => ({
      predio: program.getCell(4 + index, 3).text,
      andar: program.getCell(4 + index, 4).text,
    }));
    expect(order).toEqual([
      { predio: "A160", andar: "1º Sub-Solo" },
      { predio: "A160", andar: "2º Sub Solo" },
      { predio: "A160", andar: "Térreo" },
      { predio: "A160", andar: "1º Andar" },
      { predio: "A160", andar: "2º Andar" },
      { predio: "A220", andar: "2º Andar" },
      { predio: "C70", andar: "TÉRREO" },
      { predio: "D55", andar: "" },
      { predio: "", andar: "Térreo" },
    ]);
  });

  it("não usa SLA para ordenar a programação, mas usa SLA na aba de apontamento", async () => {
    const monday = new Date(2026, 8, 14);
    const week = weeksBetween(monday, new Date(2026, 8, 18))[0];
    const early = {
      ...os("OS-200", "CIVIL", ""),
      predio: "A160",
      andar: "1º Andar",
      local: "Sala Z",
      terminoSLA: "2026-09-15",
      terminoSLATs: new Date(2026, 8, 15).getTime(),
    };
    const later = {
      ...os("OS-100", "CIVIL", ""),
      predio: "A160",
      andar: "1º Andar",
      local: "Sala A",
      terminoSLA: "2026-09-30",
      terminoSLATs: new Date(2026, 8, 30).getTime(),
    };
    const load: DailyTeamLoad = {
      date: monday,
      dateKey: "2026-09-14",
      dayIndex: 0,
      preventiveCount: 2,
      correctiveCount: 0,
      scheduledMinutes: 60,
      remainingMinutes: 480,
      targetMinutes: 540,
      correctiveDeficit: 2,
    };
    const blob = await generateWeeklyProgramacao({
      titulo: "GRUPO GPS",
      week,
      bucketsPorEquipe: new Map([
        [
          "CIVIL",
          {
            week,
            os: [early, later],
            porDia: [[early, later], [], [], [], []],
          },
        ],
      ]),
      cargasPorEquipe: new Map([["CIVIL", [load]]]),
      minutosPorEquipe: { CIVIL: 30 },
      ativoIndex: new Map(),
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    const program = workbook.getWorksheet("PROGRAMAÇÃO")!;
    expect(program.getCell("E4").text).toBe("Sala A");
    expect(program.getCell("A4").text).toBe("OS-100");
    expect(program.getCell("E5").text).toBe("Sala Z");
    expect(program.getCell("A5").text).toBe("OS-200");

    const slaSheet = workbook.getWorksheet("SLA APONTAMENTO")!;
    expect(slaSheet.getCell("A5").text).toBe("OS-200");
    expect(slaSheet.getCell("B5").text).toBe("15/09/2026");
    expect(slaSheet.getCell("C5").text).toBe("CIVIL");
    expect(slaSheet.getCell("A6").text).toBe("OS-100");
    expect(slaSheet.getCell("B6").text).toBe("30/09/2026");
  });
});

describe("abas de impressão por equipe", () => {
  it("cria abas contínuas por equipe, ordenadas, sem quebras manuais e com fit correto", async () => {
    const monday = new Date(2026, 8, 14);
    const week = weeksBetween(monday, new Date(2026, 8, 18))[0];
    const located = (
      id: string,
      equipe: Equipe,
      predio: string,
      andar: string,
    ): TriagedOS => ({ ...os(id, equipe, ""), predio, andar });

    const civilMon = located("C-1", "CIVIL", "A220", "2º Andar");
    const civilTue = located("C-2", "CIVIL", "A160", "1º Sub-Solo");
    const civilWed = located("C-3", "CIVIL", "A160", "Térreo");
    const eletrica = located("E-1", "ELÉTRICA", "A160", "1º Andar");

    const blob = await generateWeeklyProgramacao({
      titulo: "GRUPO GPS",
      week,
      bucketsPorEquipe: new Map([
        [
          "CIVIL",
          {
            week,
            os: [civilMon, civilTue, civilWed],
            porDia: [[civilMon], [civilTue], [civilWed], [], []],
          },
        ],
        [
          "ELÉTRICA",
          { week, os: [eletrica], porDia: [[eletrica], [], [], [], []] },
        ],
      ]),
      minutosPorEquipe: { CIVIL: 30, "ELÉTRICA": 30 },
      ativoIndex: new Map(),
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    const names = workbook.worksheets.map((sheet) => sheet.name);
    expect(names).toContain("IMP CIVIL");
    expect(names).toContain("IMP ELETRICA");
    expect(names).not.toContain("IMP CHAVEIRO");

    const civilSheet = workbook.getWorksheet("IMP CIVIL")!;
    expect(civilSheet.getCell("A2").value).toBe("OS");
    const order = [3, 4, 5].map((row) => ({
      predio: civilSheet.getCell(row, 3).text,
      andar: civilSheet.getCell(row, 4).text,
      equipe: civilSheet.getCell(row, 8).text,
    }));
    expect(order).toEqual([
      { predio: "A160", andar: "1º Sub-Solo", equipe: "CIVIL" },
      { predio: "A160", andar: "Térreo", equipe: "CIVIL" },
      { predio: "A220", andar: "2º Andar", equipe: "CIVIL" },
    ]);

    expect(civilSheet.pageSetup.fitToWidth).toBe(1);
    expect(civilSheet.pageSetup.fitToHeight).toBe(0);
    expect(civilSheet.pageSetup.orientation).toBe("landscape");
    expect(civilSheet.pageSetup.printArea).toBe("A1:J5");

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    for (const file of Object.keys(zip.files).filter((name) =>
      name.startsWith("xl/worksheets/sheet"),
    )) {
      const xml = await zip.file(file)!.async("string");
      expect(xml).not.toContain("<rowBreaks");
    }
  });
});
