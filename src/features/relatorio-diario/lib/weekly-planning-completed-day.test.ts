import { describe, expect, it } from "vitest";

import type { ScheduledMaintenance } from "./daily-maintenance";
import { buildWeeklyPlanning, type WeeklyCorrectiveSourceRow } from "./weekly-planning";

const scheduled = (
  date: string,
  os: string,
  name: string,
  activity: ScheduledMaintenance["activity"] = "Corretiva",
): ScheduledMaintenance => ({
  id: `${date}|${os}|CIVIL`,
  date,
  os,
  name,
  building: "Prédio A",
  floor: "Térreo",
  space: "Recepção",
  activity,
  sla: "",
  team: "Civil",
  area: "Civil / Hidráulica",
  asset: "",
  equipment: "",
  observation: "",
  sourceFile: "Programacao.xlsx",
});

describe("relatório diário - respeita o dia marcado", () => {
  it("mantém uma corretiva no dia programado mesmo quando ela é concluída em outro dia", () => {
    const scheduledRows: ScheduledMaintenance[] = [
      scheduled("2026-10-05", "BASE", "Atividade base", "Preventiva"),
      scheduled("2026-10-06", "100", "Ajuste de porta"),
      scheduled("2026-10-07", "300", "Troca de registro"),
      scheduled("2026-10-09", "FIM", "Atividade final", "Preventiva"),
    ];

    const correctiveRows: WeeklyCorrectiveSourceRow[] = [
      {
        id: "a",
        numero_os: "100",
        status: "concluida",
        fim: "2026-10-07T14:00:00-03:00",
        updated_at: "2026-10-07T14:00:00-03:00",
        equipe: "Civil",
        nome_os: "Ajuste de porta",
        observacao_conclusao: "Reguladas as dobradiças e testado o fechamento.",
      },
      {
        id: "b",
        numero_os: "200",
        status: "concluida",
        fim: "2026-10-07T15:00:00-03:00",
        updated_at: "2026-10-07T15:00:00-03:00",
        equipe: "Elétrica",
        nome_os: "Falha no circuito",
        observacao_conclusao: "Rearmado o disjuntor e normalizada a alimentação.",
      },
      {
        id: "c",
        numero_os: "300",
        status: "concluida",
        fim: "2026-10-07T16:00:00-03:00",
        updated_at: "2026-10-07T16:00:00-03:00",
        equipe: "Civil",
        nome_os: "Troca de registro",
        observacao_conclusao: "Registro substituído e vazamento eliminado.",
      },
    ];

    const planning = buildWeeklyPlanning({
      scheduledRows,
      correctiveRows,
      targetCorrectivesPerTeamPerDay: 1,
    });

    const os100 = planning.rows.filter((row) => row.os === "100");
    expect(os100).toHaveLength(1);
    expect(os100[0].date).toBe("2026-10-06");
    expect(os100[0].completedAt).toBe("2026-10-07");
    expect(os100[0].name).toContain("Realizado: Reguladas as dobradiças");

    const os300 = planning.rows.filter((row) => row.os === "300");
    expect(os300).toHaveLength(1);
    expect(os300[0].date).toBe("2026-10-07");
    expect(os300[0].name).toContain("Realizado: Registro substituído");

    // Uma conclusão que nunca foi marcada/programada para a semana não é
    // injetada automaticamente no relatório do dia da conclusão.
    expect(planning.rows.some((row) => row.os === "200")).toBe(false);
  });

  it("mantém a corretiva programada pelo sistema no dia marcado, não no dia da conclusão", () => {
    const planning = buildWeeklyPlanning({
      scheduledRows: [
        scheduled("2026-10-19", "BASE", "Base", "Preventiva"),
        scheduled("2026-10-23", "FIM", "Fim", "Preventiva"),
      ],
      correctiveRows: [
        {
          id: "programada",
          numero_os: "500",
          status: "concluida",
          fim: "2026-10-21T10:00:00-03:00",
          equipe: "Civil",
          nome_os: "Ajuste de fechadura",
          observacao_conclusao: "Fechadura ajustada.",
          programacao_status: "em_programacao",
          programacao_periodo_inicio: "2026-10-19",
          programacao_periodo_fim: "2026-10-23",
          programacao_dia_indice: 0,
          programacao_equipe: "Civil",
        },
      ],
      targetCorrectivesPerTeamPerDay: 1,
    });

    const rows500 = planning.rows.filter((row) => row.os === "500");
    expect(rows500).toHaveLength(1);
    expect(rows500[0].date).toBe("2026-10-19");
    expect(rows500[0].completedAt).toBe("2026-10-21");
    expect(planning.rows.some((row) => row.os === "500" && row.date === "2026-10-21")).toBe(false);
  });
});
