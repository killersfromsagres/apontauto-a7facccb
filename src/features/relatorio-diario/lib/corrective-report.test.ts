import { describe, expect, it } from "vitest";

import { maintenanceAreaRank, type ScheduledMaintenance } from "./daily-maintenance";
import {
  buildCompletedReportRows,
  buildReportDaySummaries,
  shouldReplaceSchedule,
  consolidateCorrectiveCompletionSources,
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
    updated_at: "2026-10-09T14:00:00.000Z",
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
    updated_at: "2026-10-09T15:00:00.000Z",
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

  it("reconhece variações legítimas de status finalizado", () => {
    const mapped = mapCompletedCorrectives([
      {
        id: "legacy",
        numero_os: "600",
        status: "Finalizada",
        updated_at: "2026-10-09T18:30:00.000Z",
        equipe: "Civil",
        nome_os: "Registro legado concluído",
      },
    ]);

    expect(mapped).toHaveLength(1);
    expect(mapped[0].os).toBe("600");
    expect(mapped[0].completedAt).toBe("2026-10-09");
  });

  it("inclui imediatamente uma conclusão offline ainda pendente de sincronização", () => {
    const consolidated = consolidateCorrectiveCompletionSources({
      remoteRows: [
        {
          id: "offline-1",
          numero_os: "700",
          status: "aberta",
          updated_at: "2026-10-09T10:00:00.000Z",
          equipe: "Chaveiro",
          nome_os: "Ajuste de fechadura",
        },
      ],
      cachedRows: [
        {
          id: "offline-1",
          numero_os: "700",
          status: "concluida",
          fim: "2026-10-09T19:00:00.000Z",
          updated_at: "2026-10-09T19:00:00.000Z",
          equipe: "Chaveiro",
          nome_os: "Ajuste de fechadura",
        },
      ],
      pendingStatusUpdates: [
        {
          osId: "offline-1",
          numeroOs: "700",
          status: "concluida",
          fim: "2026-10-09T19:00:00.000Z",
          createdAt: new Date("2026-10-09T19:00:00.000Z").getTime(),
        },
      ],
    });

    const mapped = mapCompletedCorrectives(consolidated);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].os).toBe("700");
    expect(mapped[0].completionSource).toBe("corretiva-novo");
  });

  it("uma reabertura local mais recente remove a OS das concluídas", () => {
    const consolidated = consolidateCorrectiveCompletionSources({
      remoteRows: [
        {
          id: "reopen-1",
          numero_os: "800",
          status: "concluida",
          fim: "2026-10-09T17:00:00.000Z",
          updated_at: "2026-10-09T17:00:00.000Z",
          equipe: "Elétrica",
        },
      ],
      pendingStatusUpdates: [
        {
          osId: "reopen-1",
          numeroOs: "800",
          status: "aberta",
          createdAt: new Date("2026-10-09T18:00:00.000Z").getTime(),
        },
      ],
    });

    expect(mapCompletedCorrectives(consolidated)).toHaveLength(0);
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

  it("com programação importada, limita os dias ao período das planilhas", () => {
    const week = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"].map((date, i) => ({
      ...scheduled[0],
      id: `${date}|${i}`,
      date,
      os: `9${i}`,
    }));
    const summaries = buildReportDaySummaries({
      scheduledRows: week,
      executions: {},
      correctiveRows: [
        ...correctiveRows,
        { id: "ago", numero_os: "AG1", status: "concluida", fim: "2026-08-12T15:00:00.000Z", equipe: "Civil" },
        { id: "ago2", numero_os: "AG2", status: "concluida", fim: "2026-08-20T15:00:00.000Z", equipe: "Elétrica" },
      ],
    });
    const dates = summaries.map((item) => item.date);
    expect(dates).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(summaries.find((item) => item.date === "2026-10-09")?.extraCorrective).toBe(3);
  });

  it("mantém Chaveiro, Pintura e Limpeza como equipes próprias nas conclusões do dia", () => {
    const supportRows: CorrectiveReportSourceRow[] = [
      { id: "ch", numero_os: "901", status: "concluida", fim: "2026-10-06T12:00:00.000Z", equipe: "CHAVEIRO - APOIO", nome_os: "Troca de miolo" },
      { id: "pi", numero_os: "902", status: "concluida", fim: "2026-10-06T13:00:00.000Z", equipe: "PINTURA", nome_os: "Retoque de parede" },
      { id: "li", numero_os: "903", status: "concluida", fim: "2026-10-06T14:00:00.000Z", equipe: "Limpeza / Conservação", nome_os: "Limpeza técnica" },
    ];

    const reportRows = buildCompletedReportRows({
      scheduledRows: [],
      executions: {},
      correctiveRows: supportRows,
      selectedDate: "2026-10-06",
    });

    expect(reportRows.map((row) => row.os).sort()).toEqual(["901", "902", "903"]);
    expect(reportRows.map((row) => row.team).sort()).toEqual(["Chaveiro", "Limpeza", "Pintura"]);
    expect(reportRows.every((row) => row.activity === "Corretiva")).toBe(true);
  });

  it("não cria dias antigos para equipes de apoio fora do período importado", () => {
    const week = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"].map((date, i) => ({
      ...scheduled[0],
      id: `support-${date}-${i}`,
      date,
      os: `S${i}`,
    }));
    const summaries = buildReportDaySummaries({
      scheduledRows: week,
      executions: {},
      correctiveRows: [
        { id: "old-paint", numero_os: "904", status: "concluida", fim: "2026-09-29T12:00:00.000Z", equipe: "Pintura" },
        { id: "old-clean", numero_os: "905", status: "concluida", fim: "2026-09-29T13:00:00.000Z", equipe: "Limpeza" },
        { id: "current-key", numero_os: "906", status: "concluida", fim: "2026-10-05T14:00:00.000Z", equipe: "Chaveiro" },
      ],
    });

    expect(summaries.some((item) => item.date === "2026-09-29")).toBe(false);
    expect(summaries.find((item) => item.date === "2026-10-05")?.completedCorrective).toBe(1);
  });

  it("nova semana sem sobreposição substitui; mesmo período mescla", () => {
    const w40 = [{ ...scheduled[0], date: "2026-09-28" }, { ...scheduled[0], date: "2026-10-02" }];
    const w41 = [{ ...scheduled[0], date: "2026-10-05" }];
    const w41b = [{ ...scheduled[0], date: "2026-10-07" }];
    expect(shouldReplaceSchedule(w40, w41)).toBe(true);
    expect(shouldReplaceSchedule([...w41, { ...scheduled[0], date: "2026-10-09" }], w41b)).toBe(false);
    expect(shouldReplaceSchedule([], w41)).toBe(false);
  });
});
