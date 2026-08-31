import { describe, expect, it } from "vitest";

import {
  ASSIGNABLE_MENU_KEYS,
  MENU_KEYS,
  PERMISSION_GROUPS,
} from "./permission-catalog";

describe("permission catalog", () => {
  it("mantém chaves únicas e grupos preenchidos", () => {
    expect(new Set(MENU_KEYS).size).toBe(MENU_KEYS.length);
    expect(PERMISSION_GROUPS.every((group) => group.modules.length > 0)).toBe(true);
  });

  it("inclui as seções adicionadas recentemente", () => {
    expect(MENU_KEYS).toEqual(
      expect.arrayContaining([
        "mensageria",
        "central-materiais-unificada",
        "refrigeracao-historico-permanente",
      ]),
    );
  });

  it("não permite atribuir o gerenciamento de usuários a conta comum", () => {
    expect(ASSIGNABLE_MENU_KEYS).not.toContain("usuarios");
    expect(MENU_KEYS).toContain("usuarios");
  });
});
