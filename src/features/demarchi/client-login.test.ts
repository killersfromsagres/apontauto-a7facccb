import { describe, expect, it } from "vitest";
import {
  clientAuthIdentity,
  isClientId,
  normalizeClientId,
} from "../../../supabase/functions/_shared/demarchi-login";

describe("client ID authentication", () => {
  it("preserves leading zeroes in IDs", () => {
    expect(clientAuthIdentity("001234")).toBe("001234@cliente.demarchi.local");
  });
  it("uses the same identity for uppercase, lowercase and pasted edge whitespace", () => {
    expect(clientAuthIdentity("  CLIENTE.01 ")).toBe(clientAuthIdentity("cliente.01"));
  });
  it("accepts numeric IDs and named IDs", () => {
    expect(isClientId("1024")).toBe(true);
    expect(isClientId("cliente_dem-01")).toBe(true);
  });
  it.each(["ab", "cliente@email.com", "cliente com espaço", "../cliente", "a".repeat(41)])(
    "rejects invalid IDs before authentication: %s",
    (id) => {
      expect(() => clientAuthIdentity(id)).toThrow("Informe um ID");
    },
  );
  it("never coerces a numeric-looking ID into a number", () => {
    expect(normalizeClientId("000100")).toBe("000100");
  });
});
