import { describe, expect, it } from "vitest";

import { describeMensageriaError } from "./errors";

describe("describeMensageriaError", () => {
  it.each([
    [{ code: "42P01", message: "relation does not exist" }, "schema", false],
    [{ code: "PGRST205", message: "Could not find the table" }, "schema", false],
    [{ code: "42501", message: "permission denied" }, "permission", false],
    [{ code: "PGRST301", message: "JWT expired" }, "session", false],
    [{ code: "23503", message: "foreign key violation" }, "relation", true],
    [{ code: "23505", message: "duplicate key" }, "duplicate", false],
    [{ code: "23514", message: "check violation" }, "validation", false],
  ])("classifica %j como %s", (error, kind, retryable) => {
    expect(describeMensageriaError(error)).toMatchObject({ kind, retryable });
  });

  it("identifica falha de rede sem expor detalhes técnicos", () => {
    const result = describeMensageriaError(
      new TypeError("Failed to fetch https://internal.example"),
    );
    expect(result.kind).toBe("network");
    expect(result.retryable).toBe(true);
    expect(result.message).not.toContain("internal.example");
  });
});
