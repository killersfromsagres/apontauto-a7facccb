import { describe, expect, it } from "vitest";
import { weeksBetween } from "./capacity";
import {
  formatMinutes,
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
      preventivas: Array.from({ length: 80 }, (_, index) =>
        os(`P${index}`, equipe),
      ),
      corretivas: Array.from({ length: 10 }, (_, index) =>
        os(`C${index}`, equipe, "Corretiva"),
      ),
      weeks,
      from: monday,
      until: friday,
      minutosPorOS: 30,
    });
    expect(result.loadsByWeek[0]).toHaveLength(5);
    expect(
      result.loadsByWeek[0].every((load) => load.scheduledMinutes === 540),
    ).toBe(true);
    expect(
      result.loadsByWeek[0].every((load) => load.correctiveCount === 2),
    ).toBe(true);
    expect(result.overflowPreventivas).toHaveLength(0);
  });

  it("fecha 09:00 com 9 OS de 01:00 e duas corretivas por dia", () => {
    const equipe: Equipe = "HIDRÁULICA";
    const result = scheduleTeamMonth({
      equipe,
      preventivas: Array.from({ length: 35 }, (_, index) =>
        os(`P${index}`, equipe),
      ),
      corretivas: Array.from({ length: 10 }, (_, index) =>
        os(`C${index}`, equipe, "Corretiva"),
      ),
      weeks,
      from: monday,
      until: friday,
      minutosPorOS: 60,
    });
    expect(
      result.loadsByWeek[0].every((load) => load.scheduledMinutes === 540),
    ).toBe(true);
    expect(
      result.loadsByWeek[0].every((load) => load.correctiveCount === 2),
    ).toBe(true);
    expect(formatMinutes(result.loadsByWeek[0][0].remainingMinutes)).toBe(
      "00:00",
    );
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
    expect(
      result.loadsByWeek[0]
        .slice(1)
        .every((load) => load.correctiveDeficit === 2),
    ).toBe(true);
    expect(result.loadsByWeek[0][0].remainingMinutes).toBe(510);
  });

  it("coloca na primeira semana todas as OS com Término SLA naquela semana", () => {
    const equipe: Equipe = "ELÉTRICA";
    const twoWeeks = weeksBetween(monday, new Date(2026, 8, 25));
    const dueFirstWeek = Array.from({ length: 20 }, (_, index) =>
      os(`SLA-${index}`, equipe, "Corretiva", "2026-09-18"),
    );
    const dueSecondWeek = Array.from({ length: 10 }, (_, index) =>
      os(`FUT-${index}`, equipe, "Corretiva", "2026-09-25"),
    );
    const result = scheduleTeamMonth({
      equipe,
      preventivas: [],
      corretivas: [...dueSecondWeek, ...dueFirstWeek],
      weeks: twoWeeks,
      from: monday,
      until: new Date(2026, 8, 25),
      minutosPorOS: 30,
    });
    const firstWeekIds = new Set(result.buckets[0].os.map((item) => item.os));
    expect(dueFirstWeek.every((item) => firstWeekIds.has(item.os))).toBe(true);
    expect(
      result.buckets[1].os.some((item) => item.os.startsWith("SLA-")),
    ).toBe(false);
  });
});

describe("prioridade das corretivas", () => {
  it("coloca backorder primeiro, preservando criticidade e Término SLA", () => {
    const reference = new Date(2026, 8, 14);
    const rows: CorrectiveSourceRow[] = [
      {
        numero_os: "normal-atrasada",
        data_sla: "2026-09-01",
        corretiva_problemas: [],
      },
      {
        numero_os: "critica-futura",
        data_sla: "2026-09-20",
        corretiva_problemas: [
          { gravidade: "critico", status_gestor: "aprovado" },
        ],
      },
      {
        numero_os: "critica-atrasada",
        data_sla: "2026-09-02",
        corretiva_problemas: [
          { gravidade: "critico", status_gestor: "pendente" },
        ],
      },
    ];
    expect(
      sortCorrectiveRows(rows, reference).map((row) => row.numero_os),
    ).toEqual(["critica-atrasada", "normal-atrasada", "critica-futura"]);
  });
});
