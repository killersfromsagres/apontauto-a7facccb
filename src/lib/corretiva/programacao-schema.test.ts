import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "drizzle/migrations/0000_repair_corretiva_os_programacao_columns.sql",
  "utf8",
);

describe("corretiva_os: campos usados na conclusão", () => {
  it("define programação disponível para OS existentes sem remover dados", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS programacao_status text NOT NULL DEFAULT 'disponivel'/);
    expect(migration).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i);
  });

  it.each([
    ["programacao_periodo_inicio", "date"],
    ["programacao_periodo_fim", "date"],
    ["programacao_dia_indice", "smallint"],
    ["programacao_equipe", "text"],
    ["programacao_reservada_em", "timestamptz"],
  ])("permite limpar %s na conclusão sem coluna inexistente", (column, type) => {
    expect(migration).toContain(`ADD COLUMN IF NOT EXISTS ${column} ${type}`);
  });
});