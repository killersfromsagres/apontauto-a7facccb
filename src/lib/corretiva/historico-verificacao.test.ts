import { describe, expect, it } from "vitest";
import {
  legacyIdsToMigrate,
  loadVerifiedOsIds,
  pendingOsIds,
  saveVerifiedOsIds,
  verificacaoAutorLabel,
  verifiedOsStorageKey,
  withVerificacao,
  withVerifiedOs,
  type VerificacaoRegistro,
} from "./historico-verificacao";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

function registro(
  osId: string,
  nome: string | null = "Gabriel",
): VerificacaoRegistro {
  return {
    osId,
    numeroOs: osId.replace("os-", ""),
    verificadoEm: "2026-09-03T12:00:00.000Z",
    verificadoPor: "user-1",
    verificadoPorNome: nome,
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

  it("adiciona e remove verificações sem mutar o mapa original", () => {
    const original = new Map<string, VerificacaoRegistro>([["os-1", registro("os-1")]]);
    const withSecond = withVerificacao(original, "os-2", registro("os-2"));
    const withoutFirst = withVerificacao(withSecond, "os-1", null);

    expect([...original.keys()]).toEqual(["os-1"]);
    expect([...withSecond.keys()]).toEqual(["os-1", "os-2"]);
    expect([...withoutFirst.keys()]).toEqual(["os-2"]);
  });

  it("mantém na exportação somente IDs ainda não verificados", () => {
    const verificacoes = new Map<string, VerificacaoRegistro>([
      ["os-2", registro("os-2")],
      ["os-4", registro("os-4")],
    ]);

    expect(pendingOsIds(["os-1", "os-2", "os-3", "os-4"], verificacoes)).toEqual([
      "os-1",
      "os-3",
    ]);
  });

  it("migra somente IDs legados que ainda não existem no banco", () => {
    const verificacoes = new Map<string, VerificacaoRegistro>([["os-2", registro("os-2")]]);
    const legacy = new Set(["os-1", "os-2", "", "os-3"]);

    expect(legacyIdsToMigrate(legacy, verificacoes)).toEqual(["os-1", "os-3"]);
  });

  it("formata a autoria da conferência quando há nome disponível", () => {
    expect(verificacaoAutorLabel(registro("os-1", "Gabriel Vitor"))).toBe("por Gabriel Vitor");
    expect(verificacaoAutorLabel(registro("os-1", "   "))).toBeNull();
    expect(verificacaoAutorLabel(registro("os-1", null))).toBeNull();
  });
});
