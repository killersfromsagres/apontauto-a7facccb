import { describe, expect, it } from "vitest";

import { maintenanceAreaRank, type ScheduledMaintenance } from "./daily-maintenance";
import {
  buildCompletedReportRows,
  buildReportDaySummaries,
  mapCompletedCorrectives,
  type CorrectiveReportSourceRow,
} from "./corrective-report";

const scheduled: ScheduledMaintenance[] = [
  {
    id: "2026-10-09|100|CIVIL",
    date: "2026-10-09",
    os: "100",
    name: "Ajuste de porta",
    building: "Prédio A",
    floor: "Térreo",
    space: "Recepção",
    activity: "Corretiva",
    sla: "",
    team: "Civil",
    area: "Civil / Hidráulica",
    asset: "",
    equipment: "Porta",
    observation: "",
    sourceFile: "Civil.xlsx",
  },
];

const correctiveRows: CorrectiveReportSourceRow[] = [
  {
    id: "a",
    numero_os: "100",
    status: "concluida",
    fim: "2026-10-09T14:00:00.000Z",
    data_programada: "2026-10-09",
    equipe: "Civil",
    nome_os: "Ajuste de porta concluído",
    predio: "Prédio A",
  },
  {
    id: "b",
    numero_os: "200",
    status: "concluida",
    fim: "2026-10-09T15:00:00.000Z",
    equipe: "Chaveiro",
    nome_os: "Troca de segredo da fechadura",
    predio: "Prédio B",
    local: "Sala 12",
  },
  {
    id: "c",
    numero_os: "300",
    status: "concluida",
    fim: "2026-10-09T16:00:00.000Z",
    equipe: "Refrigeração",
    nome_os: "Ajuste em evaporadora",
  },
  {
    id: "d",
    numero_os: "400",
    status: "concluida",
    fim: "2026-10-09T17:00:00.000Z",
    equipe: "Elétrica",
    nome_os: "Rearme de disjuntor",
  },
  {
    id: "e",
    numero_os: "500",
    status: "aberta",
    fim: "2026-10-09T18:00:00.000Z",
    equipe: "Civil",
    nome_os: "Chamado reaberto",
  },
];

describe("relatório diário + Corretiva Novo", () => {
  it("inclui corretivas realizadas fora da programação, inclusive Chaveiro", () => {
    const reportRows = buildCompletedReportRows({
      scheduledRows: scheduled,
      executions: {},
      correctiveRows,
      selectedDate: "2026-10-09",
    });

    expect(reportRows.map((row) => row.os)).toEqual(["100", "300", "200", "400"]);
    expect(reportRows.find((row) => row.os === "100")?.extraCorrective).toBe(false);
    expect(reportRows.find((row) => row.os === "100")?.programmingSource).toBe("programacao-semanal");
    expect(reportRows.find((row) => row.os === "200")?.extraCorrective).toBe(true);
    expect(reportRows.find((row) => row.os === "200")?.team).toBe("Chaveiro");
    expect(reportRows.find((row) => row.os === "200")?.completionSource).toBe("corretiva-novo");
  });

  it("ignora OS reaberta mesmo que ainda possua fim preenchido", () => {
    const mapped = mapCompletedCorrectives(correctiveRows);
    expect(mapped.some((row) => row.os === "500")).toBe(false);
  });

  it("mantém Civil/Hidráulica primeiro, refrigeração em seguida e Elétrica por último", () => {
    const ordered = [
      "Civil / Hidráulica",
      "Refrigeração 1",
      "Refrigeração 2",
      "Refrigeração 3",
      "Refrigeração",
      "Outros",
      "Elétrica",
    ] as const;

    expect([...ordered].sort((a, b) => maintenanceAreaRank(a) - maintenanceAreaRank(b))).toEqual(ordered);
  });

  it("cria dias de relatório a partir das conclusões do Corretiva Novo", () => {
    const summaries = buildReportDaySummaries({
      scheduledRows: [],
      executions: {},
      correctiveRows,
    });

    const day = summaries.find((item) => item.date === "2026-10-09");
    expect(day?.completed).toBe(4);
    expect(day?.completedCorrective).toBe(4);
    expect(day?.extraCorrective).toBe(3);
  });
});
