import { describe, expect, it } from "vitest";

import type { ScheduledMaintenance } from "./daily-maintenance";
import { buildWeeklyPlanning, type WeeklyCorrectiveSourceRow } from "./weekly-planning";

const preventive: ScheduledMaintenance = {
  id: "2026-10-19|P1",
  date: "2026-10-19",
  os: "P1",
  name: "Preventiva semanal",
  building: "C120",
  floor: "Térreo",
  space: "Área técnica",
  activity: "Preventiva",
  sla: "",
  team: "Elétrica",
  area: "Elétrica",
  asset: "",
  equipment: "",
  observation: "",
  sourceFile: "PROGRAMACAO_SEMANAL.xlsx",
};

const completedProgrammed: WeeklyCorrectiveSourceRow = {
  id: "corrective-224620",
  numero_os: "224620",
  status: "concluida",
  programacao_status: "em_programacao",
  programacao_periodo_inicio: "2026-10-19",
  programacao_periodo_fim: "2026-10-23",
  programacao_dia_indice: 0,
  programacao_equipe: "Civil",
  equipe: "Civil",
  nome_os: "Cobertura para balança",
  predio: "C70",
  data_sla: "2026-10-23",
};

describe("histórico de corretivas programadas no relatório diário", () => {
  it("mantém a OS no dia planejado depois que o status oficial vira concluído", () => {
    const result = buildWeeklyPlanning({
      scheduledRows: [preventive],
      correctiveRows: [completedProgrammed],
      targetCorrectivesPerTeamPerDay: 1,
    });

    const row = result.rows.find((item) => item.os === "224620");
    expect(row).toBeDefined();
    expect(row?.date).toBe("2026-10-19");
    expect(row?.programmedCorrective).toBe(true);
    expect(row?.planningOrigin).toBe("corretiva-programada");
  });
});
