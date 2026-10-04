import { describe, expect, it } from "vitest";

import { weeksBetween } from "../capacity";
import {
  buildSlaConsolidatedPlan,
  normalizeOsKey,
  slaPriorityWeekIndex,
} from "../sla-consolidation";
import type { Equipe, TriagedOS } from "../triage";

function os(
  numero: string,
  terminoSLA: string,
  equipe: Equipe = "CIVIL",
): TriagedOS {
  return {
    os: numero,
    chamado: numero,
    terminoSLA,
    terminoSLATs: new Date(`${terminoSLA}T12:00:00`).getTime(),
    equipe,
    predio: "A100",
    andar: "Térreo",
    local: "Sala",
    nomeOS: `Preventiva ${numero}`,
  } as TriagedOS;
}

describe("consolidação do apontamento por Término SLA", () => {
  const reference = new Date(2026, 9, 1, 12);
  const weeks = weeksBetween(reference, new Date(2026, 9, 31, 12));

  it("manda SLA até 09/10/2026 para a Semana 40", () => {
    const index = slaPriorityWeekIndex(os("100", "2026-10-09"), weeks, reference);
    expect(index).toBe(0);
    expect(weeks[index ?? -1]?.isoWeek).toBe(40);
  });

  it("manda SLA de 23/10/2026 para a Semana 42", () => {
    const index = slaPriorityWeekIndex(os("200", "2026-10-23"), weeks, reference);
    expect(index).toBe(2);
    expect(weeks[index ?? -1]?.isoWeek).toBe(42);
  });

  it("não antecipa pela regra especial vencimentos a partir do dia 28", () => {
    expect(
      slaPriorityWeekIndex(os("300", "2026-10-28"), weeks, reference),
    ).toBeNull();
  });

  it("normaliza OS numérica exportada pelo Excel com .0", () => {
    expect(normalizeOsKey(" 12345.0 ")).toBe("12345");
  });

  it("mantém cada OS uma única vez no arquivo consolidado", () => {
    const plan = buildSlaConsolidatedPlan(
      [
        os("12345", "2026-10-09"),
        os("12345.0", "2026-10-09"),
        os("67890", "2026-10-23"),
      ],
      reference,
    );

    expect(plan.rows.map((row) => normalizeOsKey(row.item.os))).toEqual([
      "12345",
      "67890",
    ]);
    expect(plan.duplicatesRemoved).toBe(1);
    expect(plan.rows[0].week.isoWeek).toBe(40);
    expect(plan.rows[1].week.isoWeek).toBe(42);
  });
});
