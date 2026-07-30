import { describe, expect, it } from "vitest";

import { STATUS_EXIGE_EVIDENCIA, sanitizarParaCache } from "@/features/water-delivery/offline/offline";
import { backoffDelay, drainOutbox, type OutboxRecord } from "@/lib/offline/outbox-core";

describe("cache offline do módulo Água", () => {
  it("remove CPF, documentos e segredos antes de gravar", () => {
    const limpo = sanitizarParaCache({
      id: "1",
      recebido_por: "Ana",
      cpf: "12345678900",
      api_key: "abc",
      ponto: { nome: "Bloco A", documento: "RG 1", token: "x" },
      fotos: [{ url: "u", senha: "s" }],
    }) as Record<string, any>;

    expect(limpo.recebido_por).toBe("Ana");
    expect(limpo.cpf).toBeUndefined();
    expect(limpo.api_key).toBeUndefined();
    expect(limpo.ponto.documento).toBeUndefined();
    expect(limpo.ponto.token).toBeUndefined();
    expect(limpo.fotos[0].senha).toBeUndefined();
    expect(limpo.fotos[0].url).toBe("u");
  });

  it("exige evidência para conclusão total ou parcial", () => {
    expect(STATUS_EXIGE_EVIDENCIA).toContain("concluida");
    expect(STATUS_EXIGE_EVIDENCIA).toContain("parcial");
    expect(STATUS_EXIGE_EVIDENCIA).not.toContain("pendente");
  });
});

describe("fila com retry, backoff e dead-letter", () => {
  function store(itens: OutboxRecord[]) {
    return {
      all: async () => itens,
      update: async (id: string, patch: Partial<OutboxRecord>) => {
        const i = itens.findIndex((x) => x.id === id);
        itens[i] = { ...itens[i], ...patch };
      },
      remove: async (id: string) => {
        itens.splice(
          itens.findIndex((x) => x.id === id),
          1,
        );
      },
    };
  }

  it("não duplica a entrega quando o envio já foi aplicado", async () => {
    const enviados: string[] = [];
    const itens: OutboxRecord[] = [
      { id: "a", kind: "visita.entrega", payload: {}, createdAt: 1, attempts: 0 },
    ];
    const s = store(itens);
    await drainOutbox(s, async (r) => {
      enviados.push(r.id);
    });
    await drainOutbox(s, async (r) => {
      enviados.push(r.id);
    });
    expect(enviados).toEqual(["a"]);
    expect(itens).toHaveLength(0);
  });

  it("aplica backoff crescente e move para dead-letter após o limite", async () => {
    expect(backoffDelay(1)).toBeLessThan(backoffDelay(3));
    const itens: OutboxRecord[] = [
      { id: "b", kind: "visita.entrega", payload: {}, createdAt: 1, attempts: 5 },
    ];
    const rel = await drainOutbox(store(itens), async () => {
      throw new Error("sem rede");
    });
    expect(rel.deadLetters).toBe(1);
    expect(itens[0].dead).toBe(true);
    expect(itens[0].lastError).toBe("sem rede");
  });
});
