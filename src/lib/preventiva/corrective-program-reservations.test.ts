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
  tipo = "Corretiva",
  nome?: string,
): CorrectiveSourceRow => ({
  id,
  numero_os: numero,
  nome_os: nome ?? `Corretiva ${numero}`,
  tipo,
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

  it.each([
    { total: 5, expected: [1, 1, 1, 1, 1] },
    { total: 6, expected: [2, 1, 1, 1, 1] },
  ])(
    "com $total OS cobre SEG→SEX antes de ocupar a segunda vaga",
    ({ total, expected }) => {
      const rows = Array.from({ length: total }, (_, index) =>
        row(`id-${index}`, String(2000 + index), "2026-09-30"),
      );

      const allocation = allocateCorrectivesForWeekTeam({
        rows,
        equipe: "CIVIL",
        periodStart: "2026-09-14",
        periodEnd: "2026-09-18",
        referenceDate: new Date(2026, 8, 14),
      });

      expect(allocation.rows).toHaveLength(total);
      expect(allocation.byDay.map((items) => items.length)).toEqual(expected);
      expect(new Set(allocation.rows.map((item) => item.numero_os)).size).toBe(total);
    },
  );

  it("descarta reservas v2 antigas e recalcula a semana de forma balanceada", () => {
    window.localStorage.setItem(
      "apontauto.corrective-program-reservations.v2",
      JSON.stringify(
        Array.from({ length: 5 }, (_, index) => ({
          id: `id-${index}`,
          numeroOs: String(5000 + index),
          equipe: "CIVIL",
          periodStart: "2026-09-14",
          periodEnd: "2026-09-18",
          reservedAt: "2026-09-10T10:00:00.000Z",
          source: "programacao",
          dayIndex: 0,
        })),
      ),
    );

    const rows = Array.from({ length: 5 }, (_, index) =>
      row(`id-${index}`, String(5000 + index), "2026-09-30"),
    );
    const allocation = allocateCorrectivesForWeekTeam({
      rows,
      equipe: "CIVIL",
      periodStart: "2026-09-14",
      periodEnd: "2026-09-18",
      referenceDate: new Date(2026, 8, 14),
    });

    expect(window.localStorage.getItem("apontauto.corrective-program-reservations.v2")).toBeNull();
    expect(allocation.byDay.map((items) => items.length)).toEqual([1, 1, 1, 1, 1]);
    expect(listCorrectiveProgramReservations()).toHaveLength(5);
  });

  it("prioriza Backorder antes das demais corretivas e não duplica em outra semana", () => {
    const rows: CorrectiveSourceRow[] = [
      row("id-backorder", "100", "2026-09-30", "observacao", "CIVIL", "Backorder", "Ajuste de acabamento"),
      row("id-critical", "200", "2026-09-18", "critico", "CIVIL", "Corretiva", "Risco de choque em painel"),
      row("id-third", "300", "2026-09-15", "observacao", "CIVIL", "Corretiva", "Reparo comum"),
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
    expect(first[0].numero_os).toBe("100");
    expect(first).toHaveLength(2);

    const nextWeek = selectCorrectiveRowsForWeekTeam({
      rows,
      equipe: "CIVIL",
      periodStart: "2026-09-21",
      periodEnd: "2026-09-25",
      referenceDate: new Date(2026, 8, 21),
      limit: 2,
    });
    expect(nextWeek).toHaveLength(1);

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

  it("ao regenerar a mesma semana avança para corretivas novas sem reciclar as anteriores", () => {
    const rows = Array.from({ length: 24 }, (_, index) =>
      row(
        `id-rotate-${index}`,
        String(7000 + index),
        "2026-10-30",
        "observacao",
        "CIVIL",
        index < 3 ? "Backorder" : "Corretiva",
      ),
    );

    const first = allocateCorrectivesForWeekTeam({
      rows,
      equipe: "CIVIL",
      periodStart: "2026-09-14",
      periodEnd: "2026-09-18",
      referenceDate: new Date(2026, 8, 14),
    });
    const regenerated = allocateCorrectivesForWeekTeam({
      rows,
      equipe: "CIVIL",
      periodStart: "2026-09-14",
      periodEnd: "2026-09-18",
      referenceDate: new Date(2026, 8, 14),
    });

    const firstIds = new Set(first.rows.map((item) => item.numero_os));
    expect(regenerated.rows).toHaveLength(CORRECTIVES_PER_WEEK);
    expect(regenerated.rows.every((item) => !firstIds.has(item.numero_os))).toBe(true);
    expect(first.rows.filter((item) => item.tipo === "Backorder")).toHaveLength(3);
    expect(
      first.byDay.every((items) => {
        const firstRegular = items.findIndex((item) => item.tipo !== "Backorder");
        const lastBackorder = items.map((item) => item.tipo).lastIndexOf("Backorder");
        return firstRegular === -1 || lastBackorder < firstRegular;
      }),
    ).toBe(true);
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