import { describe, expect, it } from "vitest";
import { mergeSchedules, normalizeOs, parseScheduleMatrix } from "./daily-maintenance";

describe("daily maintenance schedule parser", () => {
  it("keeps the programmed day even when rows contain SLA dates", () => {
    const rows = parseScheduleMatrix(
      [
        ["SEGUNDA-FEIRA • 05/10/2026 • ELÉTRICA • 2 OS"],
        ["OS", "Nome", "Prédio", "Andar", "Espaço", "Atividade", "Término SLA", "Equipe", "Ativo"],
        ["1771633", "ROTINA ELÉTRICA", "A160", "4º ANDAR", "LAB", "Preventiva", "28/10/2026", "ELÉTRICA", "DEMPA04LAB09"],
        ["224246", "ADEQUAÇÃO DE TOMADAS", "C70", "", "", "Corretiva", "21/09/2026", "ELÉTRICA", "DEMPR"],
        ["TERÇA-FEIRA • 06/10/2026 • ELÉTRICA • 1 OS"],
        ["OS", "Nome", "Prédio", "Andar", "Espaço", "Atividade", "Término SLA", "Equipe", "Ativo"],
        ["1770533.0", "INSPEÇÃO", "A160", "", "", "Preventiva", "23/10/2026", "ELÉTRICA", "DEMPA"],
      ],
      "ELÉTRICA SEMANA 41.xlsx",
    );

    expect(rows).toHaveLength(3);
    expect(rows[0].date).toBe("2026-10-05");
    expect(rows[1].date).toBe("2026-10-05");
    expect(rows[2].date).toBe("2026-10-06");
    expect(rows[2].os).toBe("1770533");
    expect(rows.map((row) => row.activity)).toEqual(["Preventiva", "Corretiva", "Preventiva"]);
  });

  it("supports Denominação and SLA header variants", () => {
    const rows = parseScheduleMatrix(
      [
        ["QUARTA-FEIRA • 07/10/2026 • CIVIL"],
        ["OS", "Denominação", "Prédio", "Andar", "Espaço", "Atividade", "SLA", "Equipe", "Ativo", "Equipamento", "Observação"],
        ["7009417", "REPARO", "P01", "TÉRREO", "SALA", "Corretiva", "09/10/2026", "CIVIL", "34516", "OUTROS", "Prioridade"],
      ],
      "CIVIL SEMANA 41.xlsx",
    );

    expect(rows[0]).toMatchObject({ os: "7009417", name: "REPARO", sla: "09/10/2026", observation: "Prioridade" });
  });

  it("deduplicates the same programmed OS and team when files are reimported", () => {
    const base = parseScheduleMatrix(
      [["SEGUNDA-FEIRA • 05/10/2026"], ["OS", "Atividade", "Equipe"], ["123.0", "Preventiva", "Civil"]],
      "a.xlsx",
    );
    const again = parseScheduleMatrix(
      [["SEGUNDA-FEIRA • 05/10/2026"], ["OS", "Atividade", "Equipe"], ["123", "Preventiva", "Civil"]],
      "b.xlsx",
    );
    expect(normalizeOs("123.0")).toBe("123");
    expect(mergeSchedules(base, again)).toHaveLength(1);
  });
});
