import { describe, expect, it } from "vitest";
import {
  inferMaintenanceArea,
  mergeSchedules,
  normalizeOs,
  parseScheduleMatrix,
  summarizeScheduleRows,
} from "./daily-maintenance";

describe("daily maintenance schedule parser", () => {
  it("keeps the programmed day even when rows contain SLA dates", () => {
    const rows = parseScheduleMatrix(
      [
        ["SEGUNDA-FEIRA • 05/10/2026 • ELÉTRICA • 2 OS"],
        ["OS", "Nome", "Prédio", "Andar", "Espaço", "Atividade", "Término SLA", "Equipe", "Ativo"],
        ["1771633", "ROTINA ELÉTRICA", "A160", "4º ANDAR", "LAB", "Preventiva", "28/10/2026", "ELÉTRICA", "DEMPA04LAB09"],
        ["224246", "ADEQUAÇÃO DE TOMADAS", "C70", "", "", "Corretiva", "21/09/2026", "ELÉTRICA", "DEMPR"],
        ["TERÇA-FEIRA • 06/10/2026 • ELÉTRICA • 1 OS"],
        ["OS", "Nome", "Prédio", "Andar", "Espaço", "Atividade", "Término SLA", "Equipe", "Ativo"],
        ["1770533.0", "INSPEÇÃO", "A160", "", "", "Preventiva", "23/10/2026", "ELÉTRICA", "DEMPA"],
      ],
      "ELÉTRICA SEMANA 41.xlsx",
    );

    expect(rows).toHaveLength(3);
    expect(rows[0].date).toBe("2026-10-05");
    expect(rows[1].date).toBe("2026-10-05");
    expect(rows[2].date).toBe("2026-10-06");
    expect(rows[2].os).toBe("1770533");
    expect(rows.map((row) => row.activity)).toEqual(["Preventiva", "Corretiva", "Preventiva"]);
    expect(rows.every((row) => row.area === "Elétrica")).toBe(true);
  });

  it("supports Denominação and SLA header variants", () => {
    const rows = parseScheduleMatrix(
      [
        ["QUARTA-FEIRA • 07/10/2026 • CIVIL"],
        ["OS", "Denominação", "Prédio", "Andar", "Espaço", "Atividade", "SLA", "Equipe", "Ativo", "Equipamento", "Observação"],
        ["7009417", "REPARO", "P01", "TÉRREO", "SALA", "Corretiva", "09/10/2026", "CIVIL", "34516", "OUTROS", "Prioridade"],
      ],
      "CIVIL E HIDRÁULICA SEMANA 41.xlsx",
    );

    expect(rows[0]).toMatchObject({
      os: "7009417",
      name: "REPARO",
      sla: "09/10/2026",
      observation: "Prioridade",
      area: "Civil / Hidráulica",
    });
  });

  it("classifies Civil/Hidráulica, Elétrica and refrigeration groups from team or file name", () => {
    expect(inferMaintenanceArea("CIVIL", "programacao.xlsx")).toBe("Civil / Hidráulica");
    expect(inferMaintenanceArea("HIDRÁULICA", "programacao.xlsx")).toBe("Civil / Hidráulica");
    expect(inferMaintenanceArea("ELÉTRICA", "programacao.xlsx")).toBe("Elétrica");
    expect(inferMaintenanceArea("", "REFRIGERAÇÃO 1 - SEMANA 41.xlsx")).toBe("Refrigeração 1");
    expect(inferMaintenanceArea("REFRIGERAÇÃO 2", "arquivo.xlsx")).toBe("Refrigeração 2");
    expect(inferMaintenanceArea("HVAC 3", "arquivo.xlsx")).toBe("Refrigeração 3");
  });

  it("recognizes a Monday-to-Friday sheet with Civil and Hydraulic blocks like the real weekly programming", () => {
    const days = [
      ["SEGUNDA-FEIRA", "05/10/2026"],
      ["TERÇA-FEIRA", "06/10/2026"],
      ["QUARTA-FEIRA", "07/10/2026"],
      ["QUINTA-FEIRA", "08/10/2026"],
      ["SEXTA-FEIRA", "09/10/2026"],
    ];
    const matrix: unknown[][] = [];
    let os = 1000;

    for (const [weekday, date] of days) {
      matrix.push([`${weekday} • ${date} • CIVIL • 10 OS (1 CORRETIVAS)`]);
      matrix.push(["OS", "Nome", "Prédio", "Andar", "Espaço", "Atividade", "Término SLA", "Equipe", "Ativo", "Equipamento"]);
      for (let index = 0; index < 9; index += 1) {
        matrix.push([String(os++), "ROTINA CIVIL", "A160", "", "", "Preventiva", "28/10/2026", "CIVIL", "DEMPA", ""]);
      }
      matrix.push([String(os++), "CORRETIVA CIVIL", "A160", "", "", "Corretiva", "21/09/2026", "CIVIL", "DEM", "SOLICITANTE"]);

      matrix.push([`${weekday} • ${date} • HIDRÁULICA • 9 OS (2 CORRETIVAS)`]);
      matrix.push(["OS", "Nome", "Prédio", "Andar", "Espaço", "Atividade", "Término SLA", "Equipe", "Ativo", "Equipamento"]);
      for (let index = 0; index < 7; index += 1) {
        matrix.push([String(os++), "ROTINA HIDRÁULICA", "A220", "", "", "Preventiva", "28/10/2026", "HIDRÁULICA", "DEMPC", ""]);
      }
      matrix.push([String(os++), "CORRETIVA HIDRÁULICA 1", "E35", "", "", "Corretiva", "23/09/2026", "HIDRÁULICA", "DEMRC", "SOLICITANTE"]);
      matrix.push([String(os++), "CORRETIVA HIDRÁULICA 2", "E210", "", "", "Corretiva", "11/09/2026", "HIDRÁULICA", "DEMERT", "SOLICITANTE"]);
    }

    const rows = parseScheduleMatrix(matrix, "CIVIL SEMANA 41.xlsx");
    const summary = summarizeScheduleRows(rows);

    expect(rows).toHaveLength(95);
    expect(summary).toHaveLength(5);
    expect(summary.every((day) => day.total === 19)).toBe(true);
    expect(summary.every((day) => day.preventive === 16)).toBe(true);
    expect(summary.every((day) => day.corrective === 3)).toBe(true);
    expect(summary[0].teams).toEqual(["CIVIL", "HIDRÁULICA"]);
    expect(summary[0].areas).toEqual(["Civil / Hidráulica"]);
  });

  it("keeps preventive and corrective rows organized inside each refrigeration group", () => {
    const rows = parseScheduleMatrix(
      [
        ["SEGUNDA-FEIRA • 05/10/2026 • REFRIGERAÇÃO 2"],
        ["OS", "Nome", "Atividade", "Equipe"],
        ["9001", "PM FAN COIL", "Preventiva", "REFRIGERAÇÃO 2"],
        ["9002", "VAZAMENTO", "Corretiva", "REFRIGERAÇÃO 2"],
      ],
      "REFRIGERAÇÃO 2.xlsx",
    );

    expect(rows.map((row) => row.area)).toEqual(["Refrigeração 2", "Refrigeração 2"]);
    expect(rows.map((row) => row.activity)).toEqual(["Preventiva", "Corretiva"]);
  });

  it("deduplicates the same programmed OS and team when files are reimported", () => {
    const base = parseScheduleMatrix(
      [["SEGUNDA-FEIRA • 05/10/2026"], ["OS", "Atividade", "Equipe"], ["123.0", "Preventiva", "Civil"]],
      "a.xlsx",
    );
    const again = parseScheduleMatrix(
      [["SEGUNDA-FEIRA • 05/10/2026"], ["OS", "Atividade", "Equipe"], ["123", "Preventiva", "Civil"]],
      "b.xlsx",
    );
    expect(normalizeOs("123.0")).toBe("123");
    expect(mergeSchedules(base, again)).toHaveLength(1);
  });
});
