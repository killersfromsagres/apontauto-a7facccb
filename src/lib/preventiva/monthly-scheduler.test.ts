import { describe, expect, it } from "vitest";
import { weeksBetween } from "./capacity";
import {
  buildPreventiveExecutionQueue,
  formatMinutes,
  isCorrectiveBackorder,
  isPreventiveSlaPriority,
  preventiveExecutionDeadline,
  resolveCorrectiveTeam,
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

  it("mantém a programação principal em sequência alfabética de prédio mesmo quando o SLA é diferente", () => {
    const equipe: Equipe = "ELÉTRICA";
    const from = new Date(2026, 9, 1);
    const until = new Date(2026, 9, 9);
    const octoberWeeks = weeksBetween(from, until);
    const rows = [
      {
        ...os("B-SLA-02", equipe, "Preventiva", "2026-10-02"),
        predio: "B200",
        andar: "2º Andar",
      },
      {
        ...os("A-SLA-09", equipe, "Preventiva", "2026-10-09"),
        predio: "A100",
        andar: "1º Andar",
      },
      {
        ...os("A-TERREO", equipe, "Preventiva", "2026-10-20"),
        predio: "A100",
        andar: "Térreo",
      },
      {
        ...os("C-SLA-05", equipe, "Preventiva", "2026-10-05"),
        predio: "C70",
        andar: "1º Andar",
      },
    ];

    expect(isPreventiveSlaPriority(rows[0])).toBe(true);
    expect(preventiveExecutionDeadline(rows[0])?.toISOString().slice(0, 10)).toBe(
      "2026-10-01",
    );

    const queue = buildPreventiveExecutionQueue(rows);
    expect(queue.map((item) => item.os)).toEqual([
      "A-TERREO",
      "A-SLA-09",
      "B-SLA-02",
      "C-SLA-05",
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
    expect(scheduled.map((item) => item.os)).toEqual(queue.map((item) => item.os));
    expect(result.slaManagedPreventivas).toBe(0);
    expect(result.slaAtRiskPreventivas).toHaveLength(0);
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

  it("preserva duas vagas de corretiva por dia sem quebrar a sequência dos prédios", () => {
    const equipe: Equipe = "HIDRÁULICA";
    const from = new Date(2026, 9, 5);
    const until = new Date(2026, 9, 9);
    const octoberWeeks = weeksBetween(from, until);
    const preventivas = Array.from({ length: 20 }, (_, index) => ({
      ...os(`P-${index + 1}`, equipe),
      predio: index < 10 ? "A160" : "B200",
      andar: `${(index % 5) + 1}º Andar`,
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

    expect(result.loadsByWeek[0].every((load) => load.preventiveCount <= 7)).toBe(true);
    expect(result.loadsByWeek[0].every((load) => load.correctiveCapacity === 2)).toBe(true);
    const flat = result.buckets[0].porDia.flat().map((item) => item.predio);
    expect(flat.indexOf("B200")).toBeGreaterThan(flat.lastIndexOf("A160"));
  });

});

describe("classificação hidráulica operacional", () => {
  it("reconhece entupimento de banheiro e cozinha C70 como Hidráulica", () => {
    expect(
      resolveCorrectiveTeam({
        numero_os: "H-1",
        nome_os: "Entupimento no banheiro",
        predio: "C70",
        local: "Cozinha",
      }),
    ).toBe("HIDRÁULICA");

    expect(
      resolveCorrectiveTeam({
        numero_os: "H-2",
        nome_os: "Vaso sanitário sem escoamento",
        predio: "A160",
      }),
    ).toBe("HIDRÁULICA");
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
