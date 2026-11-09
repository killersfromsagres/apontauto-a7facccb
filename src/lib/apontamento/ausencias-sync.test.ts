import { describe, expect, it } from "vitest";
import {
  acknowledgeAusenciasQueue,
  initialAusenciasQueue,
  mergeAusenciasWithPending,
  withPendingAusencia,
} from "./ausencias-sync";
import type { Ausencia } from "./ausencias";

const ferias: Ausencia = {
  id: "f-1",
  matricula: "100",
  tipo: "ferias",
  inicio: "2026-11-10",
  fim: "2026-11-20",
  criadoEm: "2026-11-01T10:00:00.000Z",
};
const falta: Ausencia = {
  ...ferias,
  id: "a-2",
  tipo: "falta",
};

describe("sincronização de férias e faltas", () => {
  it("não restaura uma exclusão do banco durante a sincronização", () => {
    const queue = withPendingAusencia(initialAusenciasQueue([ferias]), ferias.id, "delete");
    expect(mergeAusenciasWithPending([ferias], [], queue)).toEqual([]);
    expect(Object.keys(queue.upserts)).toEqual([]);
  });

  it("preserva uma exclusão enquanto o banco está indisponível", () => {
    const queue = withPendingAusencia(initialAusenciasQueue([ferias, falta]), ferias.id, "delete");
    const merged = mergeAusenciasWithPending([ferias], [falta], queue);
    expect(merged.map((item) => item.id)).toEqual([falta.id]);
  });

  it("não limpa uma edição nova ao confirmar uma gravação antiga", () => {
    const first = withPendingAusencia(initialAusenciasQueue([]), ferias.id, "upsert");
    const second = withPendingAusencia(first, ferias.id, "upsert");
    const acknowledged = acknowledgeAusenciasQueue(second, "upserts", {
      [ferias.id]: first.upserts[ferias.id],
    });
    expect(acknowledged.upserts[ferias.id]).toBe(second.upserts[ferias.id]);
  });

  it("mantém uma exclusão nova quando um upsert anterior termina", () => {
    const saving = withPendingAusencia(initialAusenciasQueue([]), ferias.id, "upsert");
    const deleting = withPendingAusencia(saving, ferias.id, "delete");
    const acknowledged = acknowledgeAusenciasQueue(deleting, "upserts", {
      [ferias.id]: saving.upserts[ferias.id],
    });
    expect(acknowledged.deletes[ferias.id]).toBe(deleting.deletes[ferias.id]);
    expect(mergeAusenciasWithPending([ferias], [], acknowledged)).toEqual([]);
  });

  it("considera o banco autoridade para registros já sincronizados", () => {
    const queue = {
      ...initialAusenciasQueue([]),
      initialized: true,
    };
    expect(mergeAusenciasWithPending([], [ferias], queue)).toEqual([]);
    expect(mergeAusenciasWithPending([falta], [ferias], queue)).toEqual([falta]);
  });
});
