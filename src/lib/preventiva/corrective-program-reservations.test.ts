import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  allocateCorrectivesForWeekTeam,
  CORRECTIVES_PER_DAY,
  CORRECTIVES_PER_WEEK,
  isCorrectiveReserved,
  listCorrectiveProgramReservations,
  releaseCorrectiveProgramReservation,
  selectCorrectiveRowsForWeekTeam,
} from "./corrective-program-reservations";
import type { CorrectiveSourceRow } from "./monthly-scheduler";

function installWindowStorage() {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
  vi.stubGlobal("window", {
    localStorage,
    dispatchEvent: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  vi.stubGlobal(
    "CustomEvent",
    class {
      type: string;
      detail: unknown;
      constructor(type: string, options?: { detail?: unknown }) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
  );
}

const row = (
  id: string,
  numero: string,
  dataSla: string,
  gravidade = "observacao",
  equipe = "CIVIL",
): CorrectiveSourceRow => ({
  id,
  numero_os: numero,
  nome_os: `Corretiva ${numero}`,
  equipe,
  status: "aberta",
  predio: "A160",
  andar: "Térreo",
  local: "Sala",
  data_criacao: "2026-09-01",
  data_sla: dataSla,
  corretiva_problemas: [{ gravidade, status_gestor: "aprovado" }],
});

describe("corrective program reservations", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    installWindowStorage();
  });

  it("reserva até 10 corretivas e distribui exatamente 2 por dia útil", () => {
    const rows = Array.from({ length: 14 }, (_, index) =>
      row(
        `id-${index + 1}`,
        String(1000 + index),
        `2026-09-${String(14 + (index % 5)).padStart(2, "0")}`,
      ),
    );

    const allocation = allocateCorrectivesForWeekTeam({
      rows,
      equipe: "CIVIL",
      periodStart: "2026-09-14",
      periodEnd: "2026-09-18",
      referenceDate: new Date(2026, 8, 14),
    });

    expect(allocation.rows).toHaveLength(CORRECTIVES_PER_WEEK);
    expect(allocation.byDay).toHaveLength(5);
    expect(allocation.byDay.map((items) => items.length)).toEqual([2, 2, 2, 2, 2]);
    expect(
      allocation.byDay.every((items) => items.length <= CORRECTIVES_PER_DAY),
    ).toBe(true);
    expect(listCorrectiveProgramReservations()).toHaveLength(10);
    expect(
      listCorrectiveProgramReservations()
        .map((item) => item.dayIndex)
        .sort(),
    ).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("com menos de 10 OS distribui de forma balanceada entre os dias", () => {
    const rows = Array.from({ length: 7 }, (_, index) =>
      row(`id-${index}`, String(2000 + index), "2026-09-30"),
    );

    const allocation = allocateCorrectivesForWeekTeam({
      rows,
      equipe: "CIVIL",
      periodStart: "2026-09-14",
      periodEnd: "2026-09-18",
      referenceDate: new Date(2026, 8, 14),
    });

    expect(allocation.rows).toHaveLength(7);
    expect(allocation.byDay.map((items) => items.length)).toEqual([2, 2, 1, 1, 1]);
  });

  it("prioriza backorder e criticidade antes de SLA e não duplica em outra semana", () => {
    const rows: CorrectiveSourceRow[] = [
      row("id-backorder", "100", "2026-09-10", "observacao"),
      row("id-critical", "200", "2026-09-18", "critico"),
      row("id-third", "300", "2026-09-15", "observacao"),
    ];
    const reference = new Date(2026, 8, 14);

    const first = selectCorrectiveRowsForWeekTeam({
      rows,
      equipe: "CIVIL",
      periodStart: "2026-09-14",
      periodEnd: "2026-09-18",
      referenceDate: reference,
      limit: 2,
    });
    expect(first.map((item) => item.numero_os)).toEqual(["100", "200"]);

    const nextWeek = selectCorrectiveRowsForWeekTeam({
      rows,
      equipe: "CIVIL",
      periodStart: "2026-09-21",
      periodEnd: "2026-09-25",
      referenceDate: new Date(2026, 8, 21),
      limit: 2,
    });
    expect(nextWeek.map((item) => item.numero_os)).toEqual(["300"]);

    const ids = listCorrectiveProgramReservations().map((item) => item.numeroOs);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("não reutiliza uma OS já reservada por outra equipe/semana", () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      row(`id-${index}`, String(3000 + index), "2026-09-30"),
    );
    const first = allocateCorrectivesForWeekTeam({
      rows,
      equipe: "CIVIL",
      periodStart: "2026-09-14",
      periodEnd: "2026-09-18",
      referenceDate: new Date(2026, 8, 14),
    });
    const second = allocateCorrectivesForWeekTeam({
      rows,
      equipe: "CIVIL",
      periodStart: "2026-09-21",
      periodEnd: "2026-09-25",
      referenceDate: new Date(2026, 8, 21),
    });

    const firstIds = new Set(first.rows.map((item) => item.id));
    expect(second.rows.every((item) => !firstIds.has(item.id))).toBe(true);
    expect(second.rows).toHaveLength(2);
  });

  it("libera uma corretiva para voltar às programações e exportações", () => {
    const rows = [row("id-1", "901", "2026-09-18", "critico")];
    allocateCorrectivesForWeekTeam({
      rows,
      equipe: "CIVIL",
      periodStart: "2026-09-14",
      periodEnd: "2026-09-18",
      referenceDate: new Date(2026, 8, 14),
    });
    expect(isCorrectiveReserved("id-1", "901")).toBe(true);
    releaseCorrectiveProgramReservation("id-1", "901");
    expect(isCorrectiveReserved("id-1", "901")).toBe(false);
  });
});
