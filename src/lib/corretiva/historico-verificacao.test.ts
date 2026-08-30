import { describe, expect, it } from "vitest";
import {
  loadVerifiedOsIds,
  saveVerifiedOsIds,
  verifiedOsStorageKey,
  withVerifiedOs,
} from "./historico-verificacao";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("controle de OS verificadas", () => {
  it("mantém as marcações separadas por usuário", () => {
    const storage = createStorage();

    expect(
      saveVerifiedOsIds("usuario-a", new Set(["os-2", "os-1"]), storage),
    ).toBe(true);
    expect([...loadVerifiedOsIds("usuario-a", storage)]).toEqual([
      "os-1",
      "os-2",
    ]);
    expect([...loadVerifiedOsIds("usuario-b", storage)]).toEqual([]);
  });

  it("ignora conteúdo inválido sem quebrar o histórico", () => {
    const storage = createStorage();
    storage.setItem(verifiedOsStorageKey("usuario-a"), "{invalido");

    expect([...loadVerifiedOsIds("usuario-a", storage)]).toEqual([]);
  });

  it("marca e desmarca uma OS sem alterar o conjunto original", () => {
    const original = new Set(["os-1"]);
    const marked = withVerifiedOs(original, "os-2", true);
    const unmarked = withVerifiedOs(marked, "os-1", false);

    expect([...original]).toEqual(["os-1"]);
    expect([...marked]).toEqual(["os-1", "os-2"]);
    expect([...unmarked]).toEqual(["os-2"]);
  });
});
