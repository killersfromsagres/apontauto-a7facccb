import { describe, expect, it } from "vitest";
import { weeksBetween } from "./capacity";
import {
  buildPreventiveExecutionQueue,
  formatMinutes,
  isCorrectiveBackorder,
  isPreventiveSlaPriority,
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

  it("prioriza SLA fora do dia 28 em blocos de prédio e mantém a sequência física dos andares", () => {
    const equipe: Equipe = "ELÉTRICA";
    const rows = [
      {
        ...os("PADRAO-A", equipe, "Preventiva", "2026-09-28"),
        predio: "A100",
        andar: "1º Andar",
      },
      {
        ...os("URG-B-2", equipe, "Preventiva", "2026-09-16"),
        predio: "B200",
        andar: "2º Andar",
      },
      {
        ...os("URG-A-T", equipe, "Preventiva", "2026-09-20"),
        predio: "A100",
        andar: "Térreo",
      },
      {
        ...os("URG-B-1", equipe, "Preventiva", "2026-09-15"),
        predio: "B200",
        andar: "1º Andar",
      },
      {
        ...os("PADRAO-B", equipe, "Preventiva", "2026-09-28"),
        predio: "B200",
        andar: "Térreo",
      },
    ];

    expect(isPreventiveSlaPriority(rows[0])).toBe(false);
    expect(isPreventiveSlaPriority(rows[1])).toBe(true);

    const queue = buildPreventiveExecutionQueue(rows);
    expect(queue.map((item) => item.os)).toEqual([
      "URG-B-1",
      "URG-B-2",
      "URG-A-T",
      "PADRAO-A",
      "PADRAO-B",
    ]);
    expect(queue.slice(0, 3).every((item) => item.raw.programacaoSLAPrioritaria === true)).toBe(true);

    const result = scheduleTeamMonth({
      equipe,
      preventivas: rows,
      corretivas: [],
      weeks,
      from: monday,
      until: friday,
      minutosPorOS: 60,
    });
    const scheduled = result.buckets[0].porDia.flat().map((item) => item.os);
    expect(scheduled).toEqual(queue.map((item) => item.os));
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
