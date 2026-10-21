import { describe, expect, it } from "vitest";
import {
  correctiveDailyItemKey,
  dailyCorrectiveItemKey,
  filterDailyCorrectives,
} from "./daily-report-correctives";
import type { ScheduledMaintenance } from "./daily-maintenance";

const scheduled: ScheduledMaintenance = {
  id: "linha-programada-224917",
  date: "2026-10-21",
  os: "224917",
  name: "Desentupimento banheiro feminino",
  building: "A220",
  floor: "",
  space: "Banheiro feminino",
  activity: "Corretiva",
  sla: "",
  team: "Hidráulica",
  area: "Civil / Hidráulica",
  asset: "",
  equipment: "",
  observation: "",
  sourceFile: "CIVIL SEMANA 43.xlsx",
};

describe("catálogo de corretivas do relatório diário", () => {
  it("gera identidade estável por data + OS para corretiva não programada", () => {
    expect(correctiveDailyItemKey("2026-10-21", "224917")).toBe(
      "relatorio-diario:corretiva-dia:2026-10-21:224917",
    );
    expect(correctiveDailyItemKey("2026-10-21", "224917.0")).toBe(
      "relatorio-diario:corretiva-dia:2026-10-21:224917",
    );
  });

  it("reutiliza a identidade de uma corretiva já programada no mesmo dia", () => {
    expect(dailyCorrectiveItemKey([scheduled], "2026-10-21", "224917")).toBe(
      "linha-programada-224917",
    );
    expect(dailyCorrectiveItemKey([scheduled], "2026-10-22", "224917")).toBe(
      "relatorio-diario:corretiva-dia:2026-10-22:224917",
    );
  });

  it("filtra por prédio e nome do solicitante sem usar localização para equipe", () => {
    const rows = [
      {
        numero_os: "1",
        nome_os: "Fixar prateleira",
        predio: "B290",
        solicitante: "Rodrigo Silva",
        equipe: "Civil",
        status: "aberta",
      },
      {
        numero_os: "2",
        nome_os: "Tomada sem energia",
        predio: "A220",
        solicitante: "Isabelle Costa",
        equipe: "Elétrica",
        status: "em_andamento",
      },
      {
        numero_os: "3",
        nome_os: "Chamado mensal",
        predio: "B290",
        solicitante: "Rodrigo Silva",
        equipe: "Hidráulica",
        status: "aberta",
        tipo_importacao: "backorder_mensal",
      },
    ];

    expect(
      filterDailyCorrectives(rows, {
        building: "B290",
        requester: "rodrigo",
        team: "todos",
        status: "todos",
      }).map((row) => row.numero_os),
    ).toEqual(["1"]);

    expect(
      filterDailyCorrectives(rows, {
        search: "isabelle tomada",
        building: "todos",
        team: "todos",
        status: "todos",
      }).map((row) => row.numero_os),
    ).toEqual(["2"]);
  });
});
