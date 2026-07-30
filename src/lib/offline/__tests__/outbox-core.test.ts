import { describe, expect, it } from "vitest";
import {
  backoffDelay,
  drainOutbox,
  retryDeadLetters,
  type OutboxRecord,
  type OutboxStore,
} from "../outbox-core";

function makeStore(items: OutboxRecord[]): OutboxStore & { items: OutboxRecord[] } {
  const state = [...items];
  return {
    items: state,
    all: async () => [...state],
    update: async (id, patch) => {
      const i = state.findIndex((r) => r.id === id);
      if (i >= 0) state[i] = { ...state[i], ...patch };
    },
    remove: async (id) => {
      const i = state.findIndex((r) => r.id === id);
      if (i >= 0) state.splice(i, 1);
    },
  };
}

const rec = (id: string, extra: Partial<OutboxRecord> = {}): OutboxRecord => ({
  id,
  kind: "foto",
  payload: {},
  createdAt: 0,
  attempts: 0,
  ...extra,
});

describe("outbox core", () => {
  it("envia e remove itens com sucesso", async () => {
    const store = makeStore([rec("1"), rec("2")]);
    const report = await drainOutbox(store, async () => {});
    expect(report.sent).toBe(2);
    expect(report.remaining).toBe(0);
  });

  it("aplica backoff exponencial com teto", () => {
    expect(backoffDelay(1, 1000)).toBe(1000);
    expect(backoffDelay(3, 1000)).toBe(4000);
    expect(backoffDelay(50, 1000)).toBe(5 * 60_000);
  });

  it("agenda nova tentativa após falha", async () => {
    const store = makeStore([rec("1")]);
    const report = await drainOutbox(
      store,
      async () => {
        throw new Error("rede indisponível");
      },
      { now: () => 1000 },
    );
    expect(report.failed).toBe(1);
    expect(store.items[0].attempts).toBe(1);
    expect(store.items[0].nextAttemptAt).toBe(2000);
    expect(store.items[0].lastError).toContain("rede");
  });

  it("respeita a janela de espera", async () => {
    const store = makeStore([rec("1", { nextAttemptAt: 10_000 })]);
    let calls = 0;
    const report = await drainOutbox(
      store,
      async () => {
        calls += 1;
      },
      { now: () => 1000 },
    );
    expect(calls).toBe(0);
    expect(report.skipped).toBe(1);
  });

  it("move para dead-letter após o limite e permite retry manual", async () => {
    const store = makeStore([rec("1", { attempts: 2 })]);
    await drainOutbox(
      store,
      async () => {
        throw new Error("falha");
      },
      { maxAttempts: 3, now: () => 0 },
    );
    expect(store.items[0].dead).toBe(true);

    const restored = await retryDeadLetters(store);
    expect(restored).toBe(1);
    expect(store.items[0].dead).toBe(false);
    expect(store.items[0].attempts).toBe(0);
  });

  it("é idempotente: o mesmo id não é enviado duas vezes", async () => {
    const store = makeStore([rec("1")]);
    const seen = new Set<string>();
    await drainOutbox(store, async (r) => {
      expect(seen.has(r.id)).toBe(false);
      seen.add(r.id);
    });
    await drainOutbox(store, async (r) => {
      seen.add(r.id);
    });
    expect(seen.size).toBe(1);
  });
});
