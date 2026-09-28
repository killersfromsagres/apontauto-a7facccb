import { describe, expect, it } from "vitest";

import {
  CHECKLIST_GROUPS,
  OFFICIAL_CHECKLIST_ITEMS,
  overallFrom,
} from "./checklist-items";

describe("checklist oficial da frota", () => {
  it("mantém exatamente os 12 itens do certificado In-Haus", () => {
    expect(OFFICIAL_CHECKLIST_ITEMS.map((item) => item.label)).toEqual([
      "Nível de óleo",
      "Troca de óleo em dia",
      "Kit (chave de roda e macaco)",
      "Estepe",
      "Faróis",
      "Lanternas",
      "Limpador de para-brisa",
      "Pneus",
      "Freios",
      "Documento do veículo",
      "Combustível",
      "Lataria e pintura",
    ]);
    expect(CHECKLIST_GROUPS.flatMap((group) => group.items)).toHaveLength(12);
  });

  it("considera qualquer N/OK como checklist com atenção", () => {
    expect(overallFrom(["ok", "ok"])).toBe("ok");
    expect(overallFrom(["ok", "nok"])).toBe("atencao");
  });
});
