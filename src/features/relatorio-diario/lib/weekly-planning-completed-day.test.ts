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

describe("relatório diário - conclusões reais do Corretiva Novo", () => {
  it("inclui no dia real da conclusão, preserva o que foi feito e evita duplicidade no mesmo dia", () => {
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
      {
        id: "reopened",
        numero_os: "400",
        status: "aberta",
        fim: "2026-10-07T17:00:00-03:00",
        updated_at: "2026-10-07T18:00:00-03:00",
        equipe: "Civil",
        nome_os: "Chamado reaberto",
        observacao_conclusao: "Não deve aparecer como concluído.",
      },
    ];

    const planning = buildWeeklyPlanning({
      scheduledRows,
      correctiveRows,
      targetCorrectivesPerTeamPerDay: 1,
    });

    const dayRows = planning.rows.filter((row) => row.date === "2026-10-07");
    const os100 = dayRows.find((row) => row.os === "100");
    const os200 = dayRows.find((row) => row.os === "200");
    const os300 = dayRows.filter((row) => row.os === "300");

    expect(os100?.completedAt).toBe("2026-10-07");
    expect(os100?.name).toContain("Realizado: Reguladas as dobradiças");
    expect(os100?.observation).toBe(
      "Reguladas as dobradiças e testado o fechamento.",
    );

    expect(os200?.completedAt).toBe("2026-10-07");
    expect(os200?.extraCorrective).toBe(true);
    expect(os200?.name).toContain(
      "Realizado: Rearmado o disjuntor e normalizada a alimentação.",
    );

    expect(os300).toHaveLength(1);
    expect(os300[0].extraCorrective).toBe(false);
    expect(os300[0].name).toContain(
      "Realizado: Registro substituído e vazamento eliminado.",
    );

    expect(dayRows.some((row) => row.os === "400")).toBe(false);
  });

  it("usa texto neutro quando a conclusão não possui observação", () => {
    const planning = buildWeeklyPlanning({
      scheduledRows: [
        scheduled("2026-10-05", "BASE", "Base", "Preventiva"),
        scheduled("2026-10-09", "FIM", "Fim", "Preventiva"),
      ],
      correctiveRows: [
        {
          id: "sem-observacao",
          numero_os: "500",
          status: "concluida",
          fim: "2026-10-08T10:00:00-03:00",
          equipe: "Chaveiro",
          nome_os: "Ajuste de fechadura",
        },
      ],
      targetCorrectivesPerTeamPerDay: 1,
    });

    const row = planning.rows.find(
      (item) => item.date === "2026-10-08" && item.os === "500",
    );

    expect(row?.observation).toBe("Conclusão registrada sem observação.");
    expect(row?.name).toContain("Realizado: Conclusão registrada sem observação.");
  });
});
