import { describe, expect, it } from "vitest";

import { canSeeMenuItem, isRestrictedModule, type MenuItem } from "@/lib/nav-config";

const item = (key: string): MenuItem =>
  ({ key, title: key, url: `/${key}`, icon: (() => null) as unknown }) as unknown as MenuItem;

const abastecimento = item("abastecimento");

describe("permissões do módulo abastecimento", () => {
  it("abastecimento é um módulo restrito", () => {
    expect(isRestrictedModule("abastecimento")).toBe(true);
  });

  it("admin sempre enxerga", () => {
    expect(canSeeMenuItem(abastecimento, { isAdmin: true, allowed: null })).toBe(true);
  });

  it("usuário com permissão explícita enxerga", () => {
    expect(canSeeMenuItem(abastecimento, { isAdmin: false, allowed: ["abastecimento"] })).toBe(
      true,
    );
  });

  it("usuário de corretiva não enxerga frota/abastecimento", () => {
    const ctx = { isAdmin: false, allowed: ["corretiva", "corretiva-historico"] };
    expect(canSeeMenuItem(abastecimento, ctx)).toBe(false);
    expect(canSeeMenuItem(item("frota-checklist"), ctx)).toBe(false);
    expect(canSeeMenuItem(item("frota-gestao"), ctx)).toBe(false);
  });

  it("usuário de climatização não enxerga frota/abastecimento", () => {
    const ctx = { isAdmin: false, allowed: ["refrigeracao", "preventiva-ac"] };
    expect(canSeeMenuItem(abastecimento, ctx)).toBe(false);
    expect(canSeeMenuItem(item("frota-historico"), ctx)).toBe(false);
  });

  it("lista ausente nega por padrão (nunca libera módulo restrito)", () => {
    expect(canSeeMenuItem(abastecimento, { isAdmin: false, allowed: null })).toBe(false);
    expect(canSeeMenuItem(abastecimento, { isAdmin: false, allowed: undefined })).toBe(false);
    expect(canSeeMenuItem(abastecimento, { isAdmin: false, allowed: [] })).toBe(false);
  });

  it("configurações e telas de gestor continuam exclusivas de admin", () => {
    const ctx = { isAdmin: false, allowed: ["configuracoes", "corretiva-gestor"] };
    expect(canSeeMenuItem(item("configuracoes"), ctx)).toBe(false);
    expect(canSeeMenuItem(item("corretiva-gestor"), ctx)).toBe(false);
  });
});
