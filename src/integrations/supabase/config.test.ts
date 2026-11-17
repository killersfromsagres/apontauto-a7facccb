import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("deployment backend configuration", () => {
  it("keeps browser, server and migration project on the same backend", () => {
    const root = new URL("../../../", import.meta.url);
    const env = Object.fromEntries(
      readFileSync(new URL(".env", root), "utf8")
        .trim()
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const separator = line.indexOf("=");
          return [line.slice(0, separator), line.slice(separator + 1).replace(/^"|"$/g, "")];
        }),
    );
    const config = readFileSync(new URL("supabase/config.toml", root), "utf8");
    const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1];
    expect(projectId).toBeTruthy();
    expect(env.SUPABASE_PROJECT_ID).toBe(projectId);
    expect(env.VITE_SUPABASE_PROJECT_ID).toBe(projectId);
    expect(env.SUPABASE_URL).toBe(`https://${projectId}.supabase.co`);
    expect(env.VITE_SUPABASE_URL).toBe(env.SUPABASE_URL);
    expect(env.VITE_SUPABASE_PUBLISHABLE_KEY).toBe(env.SUPABASE_PUBLISHABLE_KEY);
    expect(env.SUPABASE_PUBLISHABLE_KEY).toMatch(/^sb_publishable_/);
  });
});
