import { describe, expect, it } from "vitest";
import { weeksBetween } from "./capacity";
import {
  buildPreventiveExecutionQueue,
  formatMinutes,
  isCorrectiveBackorder,
  isPreventiveSlaPriority,
  preventiveExecutionDeadline,
  scheduleTeamMonth,
  sortCorrectiveRows,
  type CorrectiveSourceRow,
} from "./monthly-scheduler";
import type { Equipe, TriagedOS } from "./triage";

function os(
  id: string,
  equipe: Equipe,
  tipo = "Preventiva",
  terminoSLA = "",
): TriagedOS {
  const terminoSLATs = terminoSLA
    ? new Date(`${terminoSLA}T12:00:00`).getTime()
    : Number.MAX_SAFE_INTEGER;
  return {
    arquivo: "teste.xlsx",
    os: id,
    chamado: "",
    tipo,
    nomeOS: `OS ${id}`,
    descricao: "",
    categoria: equipe.startsWith("CLIMAT")
      ? "CLIMATIZAÇÃO E REFRIGERAÇÃO"
      : equipe === "ELÉTRICA"
        ? "ELÉTRICA"
        : "CIVIL",
    criticidade: "",
    unidadeNegocio: "",
    ativo: "",
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
    equipamento: "",
    terminoSLA,
    terminoSLATs,
    dataConclusao: "",
    raw: tipo === "Corretiva" ? { programacaoTipo: "corretiva" } : {},
    equipe,
  };
}

const monday = new Date(2026, 8, 14);
const friday = new Date(2026, 8, 18);
const weeks = weeksBetween(monday, friday);

describe("scheduleTeamMonth", () => {
  it("fecha 09:00 com 18 OS de 00:30 e duas corretivas por dia", () => {
    const equipe: Equipe = "ELÉTRICA";
    const result = scheduleTeamMonth({
      equipe,
      preventivas: Array.from({ length: 80 }, (_, index) => os(`P${index}`, equipe)),
      corretivas: Array.from({ length: 10 }, (_, index) => os(`C${index}`, equipe, "Corretiva")),
      weeks,
      from: monday,
      until: friday,
      minutosPorOS: 30,
    });
    expect(result.loadsByWeek[0]).toHaveLength(5);
    expect(result.loadsByWeek[0].every((load) => load.scheduledMinutes === 540)).toBe(true);
    expect(result.loadsByWeek[0].every((load) => load.correctiveCount === 2)).toBe(true);
    expect(result.overflowPreventivas).toHaveLength(0);
  });

  it("fecha 09:00 com 9 OS de 01:00 e duas corretivas por dia", () => {
    const equipe: Equipe = "HIDRÁULICA";
    const result = scheduleTeamMonth({
      equipe,
      preventivas: Array.from({ length: 35 }, (_, index) => os(`P${index}`, equipe)),
      corretivas: Array.from({ length: 10 }, (_, index) => os(`C${index}`, equipe, "Corretiva")),
      weeks,
      from: monday,
      until: friday,
      minutosPorOS: 60,
    });
    expect(result.loadsByWeek[0].every((load) => load.scheduledMinutes === 540)).toBe(true);
    expect(result.loadsByWeek[0].every((load) => load.correctiveCount === 2)).toBe(true);
    expect(formatMinutes(result.loadsByWeek[0][0].remainingMinutes)).toBe("00:00");
  });

  it("reserva duas vagas diárias para corretivas externas sem estourar 09:00", () => {
    const equipe: Equipe = "HIDRÁULICA";
    const result = scheduleTeamMonth({
      equipe,
      preventivas: Array.from({ length: 50 }, (_, index) => os(`P${index}`, equipe)),
      corretivas: [],
      weeks,
      from: monday,
      until: friday,
      minutosPorOS: 60,
      reserveCorrectiveSlots: true,
    });
    // 9 slots/dia - 2 reservados = no máximo 7 preventivas por dia.
    expect(result.loadsByWeek[0].every((load) => load.preventiveCount <= 7)).toBe(true);
    expect(result.loadsByWeek[0].every((load) => load.scheduledMinutes <= 420)).toBe(true);
  });

  it("informa o déficit quando não existem duas corretivas disponíveis", () => {
    const equipe: Equipe = "CIVIL";
    const result = scheduleTeamMonth({
      equipe,
      preventivas: [],
      corretivas: [os("C1", equipe, "Corretiva")],
      weeks,
      from: monday,
      until: friday,
      minutosPorOS: 30,
    });
    expect(result.loadsByWeek[0][0].correctiveDeficit).toBe(1);
    expect(result.loadsByWeek[0].slice(1).every((load) => load.correctiveDeficit === 2)).toBe(true);
    expect(result.loadsByWeek[0][0].remainingMinutes).toBe(510);
  });

  it("programa cada Término SLA no D-1 útil e preserva prédio/andar dentro do dia", () => {
    const equipe: Equipe = "ELÉTRICA";
    const from = new Date(2026, 9, 1);
    const until = new Date(2026, 9, 9);
    const octoberWeeks = weeksBetween(from, until);
    const rows = [
      {
        ...os("SLA-02-B2", equipe, "Preventiva", "2026-10-02"),
        predio: "B200",
        andar: "2º Andar",
      },
      {
        ...os("SLA-02-A1", equipe, "Preventiva", "2026-10-02"),
        predio: "A100",
        andar: "1º Andar",
      },
      {
        ...os("SLA-09-B1", equipe, "Preventiva", "2026-10-09"),
        predio: "B200",
        andar: "1º Andar",
      },
      {
        ...os("SLA-09-BT", equipe, "Preventiva", "2026-10-09"),
        predio: "B200",
        andar: "Térreo",
      },
    ];

    expect(isPreventiveSlaPriority(rows[0])).toBe(true);
    expect(preventiveExecutionDeadline(rows[0])?.toISOString().slice(0, 10)).toBe(
      "2026-10-01",
    );
    expect(preventiveExecutionDeadline(rows[2])?.toISOString().slice(0, 10)).toBe(
      "2026-10-08",
    );

    const queue = buildPreventiveExecutionQueue(rows);
    expect(queue.map((item) => item.os)).toEqual([
      "SLA-02-A1",
      "SLA-02-B2",
      "SLA-09-BT",
      "SLA-09-B1",
    ]);

    const result = scheduleTeamMonth({
      equipe,
      preventivas: rows,
      corretivas: [],
      weeks: octoberWeeks,
      from,
      until,
      minutosPorOS: 60,
      reserveCorrectiveSlots: true,
    });

    const scheduled = octoberWeeks.flatMap((week, weekIndex) =>
      result.buckets[weekIndex].porDia.flat(),
    );
    const byId = new Map(scheduled.map((item) => [item.os, item]));

    expect(byId.get("SLA-02-A1")?.raw.programacaoDataAgendada).toBe("2026-10-01");
    expect(byId.get("SLA-02-B2")?.raw.programacaoDataAgendada).toBe("2026-10-01");
    expect(byId.get("SLA-09-BT")?.raw.programacaoDataAgendada).toBe("2026-10-08");
    expect(byId.get("SLA-09-B1")?.raw.programacaoDataAgendada).toBe("2026-10-08");
    expect(result.slaOnTimePreventivas).toBe(4);
    expect(result.slaAtRiskPreventivas).toHaveLength(0);

    const dayOne = scheduled
      .filter((item) => item.raw.programacaoDataAgendada === "2026-10-01")
      .map((item) => [item.predio, item.andar]);
    expect(dayOne).toEqual([
      ["A100", "1º Andar"],
      ["B200", "2º Andar"],
    ]);
  });

  it("mantém pelo menos uma preventiva em cada dia útil quando há volume suficiente", () => {
    const equipe: Equipe = "CIVIL";
    const periodStart = new Date(2026, 9, 5);
    const periodEnd = new Date(2026, 9, 9);
    const periodWeeks = weeksBetween(periodStart, periodEnd);

    const slaConcentradas = Array.from({ length: 5 }, (_, index) => ({
      ...os(
        `SLA-${index + 1}`,
        equipe,
        "Preventiva",
        "2026-10-09",
      ),
      predio: "B200",
      andar: `${index + 1}º Andar`,
    }));
    const cicloNormal = Array.from({ length: 10 }, (_, index) => ({
      ...os(`NORMAL-${index + 1}`, equipe),
      predio: index < 5 ? "A160" : "A220",
      andar: `${(index % 5) + 1}º Andar`,
    }));

    const result = scheduleTeamMonth({
      equipe,
      preventivas: [...slaConcentradas, ...cicloNormal],
      corretivas: [],
      weeks: periodWeeks,
      from: periodStart,
      until: periodEnd,
      minutosPorOS: 60,
      reserveCorrectiveSlots: true,
    });

    expect(result.preventiveDaysWithoutWork).toEqual([]);
    expect(result.loadsByWeek[0]).toHaveLength(5);
    expect(
      result.loadsByWeek[0].every((load) => load.preventiveCount >= 1),
    ).toBe(true);
    expect(
      result.buckets[0].porDia.every((items) =>
        items.some((item) => item.tipo !== "Corretiva"),
      ),
    ).toBe(true);
  });

  it("usa a reserva de corretivas quando necessário para proteger SLA D-1", () => {
    const equipe: Equipe = "HIDRÁULICA";
    const from = new Date(2026, 9, 1);
    const until = new Date(2026, 9, 2);
    const octoberWeeks = weeksBetween(from, until);
    const preventivas = Array.from({ length: 8 }, (_, index) => ({
      ...os(`SLA-${index + 1}`, equipe, "Preventiva", "2026-10-02"),
      predio: "A160",
      andar: `${index + 1}º Andar`,
    }));

    const result = scheduleTeamMonth({
      equipe,
      preventivas,
      corretivas: [],
      weeks: octoberWeeks,
      from,
      until,
      minutosPorOS: 60,
      reserveCorrectiveSlots: true,
    });

    const octoberFirst = result.loadsByWeek
      .flat()
      .find((load) => load.dateKey === "2026-10-01");

    expect(octoberFirst?.preventiveCount).toBe(8);
    expect(octoberFirst?.correctiveCapacity).toBe(1);
    expect(result.slaOnTimePreventivas).toBe(8);
    expect(result.slaAtRiskPreventivas).toHaveLength(0);
  });
});

describe("prioridade das corretivas", () => {
  it("usa risco/SLA antes de aging de Backorder e reconhece Backorder pelo tipo", () => {
    const reference = new Date(2026, 8, 14);
    const rows: CorrectiveSourceRow[] = [
      {
        numero_os: "backorder-neutro",
        tipo: "Backorder",
        nome_os: "Ajustar acabamento",
        data_criacao: "2026-08-01",
        data_sla: "2026-09-30",
        corretiva_problemas: [],
      },
      {
        numero_os: "critica-futura",
        tipo: "Corretiva",
        nome_os: "Risco de choque em painel energizado",
        data_sla: "2026-09-20",
        corretiva_problemas: [{ gravidade: "critico", status_gestor: "aprovado" }],
      },
      {
        numero_os: "normal-atrasada",
        tipo: "Corretiva",
        nome_os: "Ajuste de rodapé",
        data_sla: "2026-09-01",
        corretiva_problemas: [],
      },
    ];

    expect(isCorrectiveBackorder(rows[0], reference)).toBe(true);
    expect(isCorrectiveBackorder(rows[2], reference)).toBe(false);
    const ordered = sortCorrectiveRows(rows, reference).map((row) => row.numero_os);
    expect(ordered[0]).toBe("critica-futura");
    expect(new Set(ordered)).toEqual(new Set(["critica-futura", "normal-atrasada", "backorder-neutro"]));
  });
});
