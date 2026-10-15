import { describe, expect, it } from "vitest";

import type { ScheduledMaintenance } from "./daily-maintenance";
import {
  buildWeeklyPlanning,
  isAvailableCorrectiveForPlanning,
  planningWeekDates,
  type WeeklyCorrectiveSourceRow,
} from "./weekly-planning";

const scheduledRow = (
  date: string,
  os: string,
  activity: "Preventiva" | "Corretiva" = "Preventiva",
): ScheduledMaintenance => ({
  id: `${date}|${os}`,
  date,
  os,
  name: activity === "Corretiva" ? "Corretiva da planilha" : "Preventiva semanal",
  building: "A100",
  floor: "Térreo",
  space: "Área técnica",
  activity,
  sla: "",
  team: activity === "Corretiva" ? "Civil" : "Elétrica",
  area: activity === "Corretiva" ? "Civil / Hidráulica" : "Elétrica",
  asset: "",
  equipment: "",
  observation: "",
  sourceFile: "PROGRAMACAO_SEMANAL.xlsx",
});

const candidate = (
  os: string,
  overrides: Partial<WeeklyCorrectiveSourceRow> = {},
): WeeklyCorrectiveSourceRow => ({
  id: `id-${os}`,
  numero_os: os,
  status: "aberta",
  programacao_status: "disponivel",
  tipo_importacao: "padrao",
  data_criacao: "2026-10-01",
  data_sla: "2026-10-20",
  equipe: "Civil",
  nome_os: `Chamado ${os}`,
  predio: "A100",
  ...overrides,
});

describe("programação semanal do relatório diário", () => {
  it("expande a semana para segunda a sexta mesmo quando nem todos os dias têm OS", () => {
    const dates = planningWeekDates([
      scheduledRow("2026-10-12", "P1"),
      scheduledRow("2026-10-14", "P2"),
    ]);

    expect(dates).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
    ]);
  });

  it("encaixa corretivas abertas até garantir ao menos uma por dia", () => {
    const scheduled = [
      scheduledRow("2026-10-12", "P1"),
      scheduledRow("2026-10-13", "C1", "Corretiva"),
      scheduledRow("2026-10-14", "P2"),
      scheduledRow("2026-10-15", "P3"),
      scheduledRow("2026-10-16", "P4"),
    ];

    const result = buildWeeklyPlanning({
      scheduledRows: scheduled,
      correctiveRows: [candidate("C2"), candidate("C3"), candidate("C4"), candidate("C5")],
      minimumCorrectivesPerDay: 1,
    });

    expect(result.days).toHaveLength(5);
    expect(result.days.every((day) => day.corrective >= 1)).toBe(true);
    expect(result.supplementalCount).toBe(4);
    expect(result.daysWithoutCorrective).toEqual([]);
    expect(result.rows.filter((row) => row.supplementalCorrective).every((row) => row.activity === "Corretiva")).toBe(true);
  });

  it("não duplica OS já presente na programação e ignora concluídas, backorder mensal e OS já reservadas", () => {
    const result = buildWeeklyPlanning({
      scheduledRows: [scheduledRow("2026-10-12", "100", "Corretiva")],
      correctiveRows: [
        candidate("100"),
        candidate("200", { status: "concluida" }),
        candidate("300", { tipo_importacao: "backorder_mensal" }),
        candidate("400", { programacao_status: "em_programacao" }),
        candidate("500"),
        candidate("600"),
        candidate("700"),
        candidate("800"),
      ],
      minimumCorrectivesPerDay: 1,
    });

    const supplementalOs = result.rows
      .filter((row) => row.supplementalCorrective)
      .map((row) => row.os);

    expect(supplementalOs).not.toContain("100");
    expect(supplementalOs).not.toContain("200");
    expect(supplementalOs).not.toContain("300");
    expect(supplementalOs).not.toContain("400");
    expect(new Set(supplementalOs).size).toBe(supplementalOs.length);
  });

  it("prioriza SLA mais próximo e depois chamado mais antigo", () => {
    const result = buildWeeklyPlanning({
      scheduledRows: [scheduledRow("2026-10-12", "P1")],
      correctiveRows: [
        candidate("900", { data_sla: "2026-10-30", data_criacao: "2026-09-01" }),
        candidate("901", { data_sla: "2026-10-16", data_criacao: "2026-10-10" }),
        candidate("902", { data_sla: "2026-10-16", data_criacao: "2026-10-01" }),
      ],
      minimumCorrectivesPerDay: 1,
    });

    const supplemental = result.rows.filter((row) => row.supplementalCorrective);
    expect(supplemental[0]?.os).toBe("902");
  });

  it("permite aumentar o mínimo de corretivas por dia", () => {
    const result = buildWeeklyPlanning({
      scheduledRows: [scheduledRow("2026-10-12", "P1")],
      correctiveRows: Array.from({ length: 10 }, (_, index) => candidate(`A${index + 1}`)),
      minimumCorrectivesPerDay: 2,
    });

    expect(result.days.every((day) => day.corrective === 2)).toBe(true);
    expect(result.supplementalCount).toBe(10);
  });

  it("considera somente status realmente disponíveis para encaixe", () => {
    expect(isAvailableCorrectiveForPlanning(candidate("1"))).toBe(true);
    expect(isAvailableCorrectiveForPlanning(candidate("2", { status: "em_andamento" }))).toBe(true);
    expect(isAvailableCorrectiveForPlanning(candidate("3", { status: "cancelada" }))).toBe(false);
    expect(isAvailableCorrectiveForPlanning(candidate("4", { programacao_status: "reprogramacao_pendente" }))).toBe(false);
  });
});
