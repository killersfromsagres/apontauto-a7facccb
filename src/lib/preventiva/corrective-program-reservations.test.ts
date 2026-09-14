import { beforeEach, describe, expect, it, vi } from "vitest";
import {
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
  gravidade: string,
): CorrectiveSourceRow => ({
  id,
  numero_os: numero,
  nome_os: `Corretiva ${numero}`,
  equipe: "CIVIL",
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

  it("reserva 2 por equipe pela prioridade, reutiliza a semana e não duplica em outra semana", () => {
    const rows: CorrectiveSourceRow[] = [
      row("id-backorder", "100", "2026-09-10", "observacao"),
      row("id-critical", "200", "2026-09-18", "critico"),
      row("id-third", "300", "2026-09-25", "falha"),
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
    expect(listCorrectiveProgramReservations()).toHaveLength(2);

    const rerun = selectCorrectiveRowsForWeekTeam({
      rows,
      equipe: "CIVIL",
      periodStart: "2026-09-14",
      periodEnd: "2026-09-18",
      referenceDate: reference,
      limit: 2,
    });
    expect(rerun.map((item) => item.numero_os)).toEqual(["100", "200"]);

    const nextWeek = selectCorrectiveRowsForWeekTeam({
      rows,
      equipe: "CIVIL",
      periodStart: "2026-09-21",
      periodEnd: "2026-09-25",
      referenceDate: new Date(2026, 8, 21),
      limit: 2,
    });
    expect(nextWeek.map((item) => item.numero_os)).toEqual(["300"]);
    expect(listCorrectiveProgramReservations()).toHaveLength(3);
  });

  it("libera uma corretiva para voltar às impressões de Corretiva Novo", () => {
    const rows = [row("id-1", "901", "2026-09-18", "critico")];
    selectCorrectiveRowsForWeekTeam({
      rows,
      equipe: "CIVIL",
      periodStart: "2026-09-14",
      periodEnd: "2026-09-18",
      referenceDate: new Date(2026, 8, 14),
      limit: 2,
    });
    expect(isCorrectiveReserved("id-1", "901")).toBe(true);
    releaseCorrectiveProgramReservation("id-1", "901");
    expect(isCorrectiveReserved("id-1", "901")).toBe(false);
  });
});
