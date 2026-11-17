import { describe, expect, it } from "vitest";
import {
  clientAuthIdentity,
  clientIdNumber,
  displayClientId,
  isClientId,
  isValidAccountPassword,
  normalizeClientId,
} from "../../../supabase/functions/_shared/demarchi-login";

describe("Sherwin client authentication", () => {
  it("builds the login from the numeric ID without losing leading zeroes", () => {
    expect(normalizeClientId("001234")).toBe("sherwin001234");
    expect(clientAuthIdentity("001234")).toBe("sherwin001234@cliente.demarchi.local");
  });
  it("authenticates the same ID regardless of prefix case", () => {
    expect(clientAuthIdentity("  Sherwin001234 ")).toBe(clientAuthIdentity("SHERWIN001234"));
    expect(clientAuthIdentity("001234")).toBe(clientAuthIdentity("Sherwin001234"));
  });
  it("shows a fixed branded prefix and extracts only the editable number", () => {
    expect(displayClientId("sherwin0001")).toBe("Sherwin0001");
    expect(clientIdNumber("Sherwin0001")).toBe("0001");
    expect(isClientId(normalizeClientId("1"))).toBe(true);
  });
  it.each([
    "Sherwin",
    "cliente.01",
    "Sherwin12A",
    "Sherwin 123",
    "cliente@email.com",
    "Sherwin" + "1".repeat(34),
  ])("rejects malformed client ID: %s", (id) => {
    expect(() => clientAuthIdentity(id)).toThrow("Informe o ID");
  });
  it("accepts a six-character password and rejects shorter or oversized passwords", () => {
    expect(isValidAccountPassword("abc123")).toBe(true);
    expect(isValidAccountPassword("abc12")).toBe(false);
    expect(isValidAccountPassword("a".repeat(128))).toBe(true);
    expect(isValidAccountPassword("a".repeat(129))).toBe(false);
  });
});
