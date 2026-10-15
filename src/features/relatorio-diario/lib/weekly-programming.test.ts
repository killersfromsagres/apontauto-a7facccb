import { describe, expect, it } from "vitest";

import type { ScheduledMaintenance } from "./daily-maintenance";
import {
  buildWeeklyPlanning,
  isAvailableCorrectiveForPlanning,
  isCorrectiveProgrammedForWeek,
  type WeeklyCorrectiveSourceRow,
} from "./weekly-planning";

const baseRow = (overrides: Partial<ScheduledMaintenance> = {}): ScheduledMaintenance => ({
  id: "2026-10-12|P1|CIVIL",
  date: "2026-10-12",
  os: "P1",
  name: "Preventiva de rotina",
  building: "A100",
  floor: "Térreo",
  space: "Sala",
  activity: "Preventiva",
  sla: "",
  team: "Civil",
  area: "Civil / Hidráulica",
  asset: "",
  equipment: "",
  observation: "",
  sourceFile: "programacao.xlsx",
  ...overrides,
});

const corrective = (
  numero: string,
  equipe: string,
  overrides: Partial<WeeklyCorrectiveSourceRow> = {},
): WeeklyCorrectiveSourceRow => ({
  id: `id-${numero}`,
  numero_os: numero,
  status: "aberta",
  programacao_status: "disponivel",
  equipe,
  nome_os: `Chamado ${numero}`,
  data_criacao: "2026-10-01",
  data_sla: "2026-10-20",
  tipo_importacao: "padrao",
  ...overrides,
});

describe("programação semanal com encaixes reais", () => {
  it("aceita meta maior que 2 por equipe e distribui em rodízio pelos dias", () => {
    const schedule = [baseRow()];
    const portfolio = [
      corrective("101", "Civil"),
      corrective("102", "Civil"),
      corrective("103", "Civil"),
      corrective("104", "Civil"),
      corrective("105", "Civil"),
      corrective("106", "Civil"),
      corrective("201", "Elétrica"),
      corrective("202", "Elétrica"),
      corrective("203", "Elétrica"),
      corrective("204", "Elétrica"),
      corrective("205", "Elétrica"),
    ];

    const planning = buildWeeklyPlanning({
      scheduledRows: schedule,
      correctiveRows: portfolio,
      targetCorrectivesPerTeamPerDay: 3,
    });

    expect(planning.targetCorrectivesPerTeamPerDay).toBe(3);
    expect(planning.days).toHaveLength(5);
    expect(planning.suggestedCount).toBe(11);

    const civilDates = planning.rows
      .filter((row) => row.supplementalCorrective && row.team === "Civil")
      .map((row) => row.date);

    expect(new Set(civilDates).size).toBe(5);
    expect(civilDates.filter((date) => date === "2026-10-12")).toHaveLength(2);
  });

  it("mantém uma corretiva já programada na semana como Programado e não a sugere novamente", () => {
    const programmed = corrective("300", "Hidráulica", {
      programacao_status: "em_programacao",
      programacao_periodo_inicio: "2026-10-12",
      programacao_periodo_fim: "2026-10-16",
      programacao_dia_indice: 2,
      programacao_equipe: "Hidráulica",
    });

    const planning = buildWeeklyPlanning({
      scheduledRows: [baseRow()],
      correctiveRows: [programmed],
      targetCorrectivesPerTeamPerDay: 2,
    });

    const row = planning.rows.find((item) => item.os === "300");
    expect(row?.date).toBe("2026-10-14");
    expect(row?.programmedCorrective).toBe(true);
    expect(row?.planningOrigin).toBe("corretiva-programada");
    expect(planning.programmedCount).toBe(1);
    expect(planning.suggestedCount).toBe(0);
  });

  it("não usa concluída, backorder mensal ou OS já em outra programação como nova sugestão", () => {
    const rows: WeeklyCorrectiveSourceRow[] = [
      corrective("401", "Civil", { status: "concluida" }),
      corrective("402", "Civil", { tipo_importacao: "backorder_mensal" }),
      corrective("403", "Civil", { programacao_status: "em_programacao" }),
      corrective("404", "Civil", { programacao_status: "reprogramacao_pendente" }),
      corrective("405", "Civil"),
    ];

    expect(rows.map(isAvailableCorrectiveForPlanning)).toEqual([false, false, false, false, true]);
  });

  it("reconhece como programada somente a OS reservada no mesmo período semanal", () => {
    const currentWeek = corrective("501", "Chaveiro", {
      programacao_status: "em_programacao",
      programacao_periodo_inicio: "2026-10-12",
      programacao_periodo_fim: "2026-10-16",
      programacao_dia_indice: 4,
    });
    const oldWeek = corrective("502", "Chaveiro", {
      programacao_status: "em_programacao",
      programacao_periodo_inicio: "2026-10-05",
      programacao_periodo_fim: "2026-10-09",
      programacao_dia_indice: 4,
    });

    expect(isCorrectiveProgrammedForWeek(currentWeek, "2026-10-12", "2026-10-16")).toBe(true);
    expect(isCorrectiveProgrammedForWeek(oldWeek, "2026-10-12", "2026-10-16")).toBe(false);
  });

  it("conta corretivas da própria planilha dentro da meta da equipe", () => {
    const schedule = [
      baseRow({
        id: "2026-10-12|900|CIVIL",
        os: "900",
        activity: "Corretiva",
      }),
    ];
    const planning = buildWeeklyPlanning({
      scheduledRows: schedule,
      correctiveRows: [corrective("901", "Civil"), corrective("902", "Civil")],
      targetCorrectivesPerTeamPerDay: 2,
    });

    const mondayCivil = planning.rows.filter(
      (row) => row.date === "2026-10-12" && row.activity === "Corretiva" && row.team === "Civil",
    );
    expect(mondayCivil).toHaveLength(2);
  });
});
