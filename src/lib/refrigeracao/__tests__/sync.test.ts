import { beforeEach, describe, expect, it, vi } from "vitest";

type Item = {
  id: string;
  kind: string;
  osId: string;
  numeroOs: string;
  payload: any;
  attempts: number;
  lastError?: string;
};

const state = {
  items: [] as Item[],
  inserts: [] as { table: string; row: any }[],
  insertError: null as any,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
    from: (table: string) => ({
      insert: async (row: any) => {
        state.inserts.push({ table, row });
        return { error: state.insertError };
      },
      update: () => ({ eq: async () => ({ error: state.insertError }) }),
    }),
  },
}));

vi.mock("@/lib/photo-upload", () => ({
  uploadPhotoWithFallback: async () => ({ url: "https://img/x.jpg", storagePath: null }),
}));

vi.mock("../db", () => ({
  outboxAll: async () => [...state.items],
  outboxRemove: async (id: string) => {
    state.items = state.items.filter((i) => i.id !== id);
  },
  outboxUpdate: async (item: Item) => {
    state.items = state.items.map((i) => (i.id === item.id ? item : i));
  },
  blobGet: async () => new Blob(["x"]),
  blobDelete: async () => {},
}));

const { syncPending } = await import("../sync");

function item(over: Partial<Item> = {}): Item {
  return {
    id: over.id ?? "c-1",
    kind: over.kind ?? "problema",
    osId: "os-1",
    numeroOs: "12345",
    payload: over.payload ?? { descricao: "Não gela" },
    attempts: 0,
    ...over,
  } as Item;
}

beforeEach(() => {
  state.items = [];
  state.inserts = [];
  state.insertError = null;
});

describe("sincronização da fila offline (refrigeração)", () => {
  it("envia os itens pendentes e esvazia a fila", async () => {
    state.items = [
      item({ id: "a" }),
      item({ id: "b", kind: "peca", payload: { descricao: "Capacitor" } }),
    ];

    const r = await syncPending();

    expect(r.sent).toBe(2);
    expect(r.failed).toBe(0);
    expect(r.remaining).toBe(0);
  });

  it("envia o client_uuid para o servidor deduplicar reenvios", async () => {
    state.items = [item({ id: "uuid-fixo" })];
    await syncPending();
    expect(state.inserts[0].row.client_uuid).toBe("uuid-fixo");
  });

  it("trata erro de duplicidade como sucesso (sem duplicar registro)", async () => {
    state.insertError = {
      code: "23505",
      message: "duplicate key value violates unique constraint",
    };
    state.items = [item({ id: "dup" })];

    const r = await syncPending();

    expect(r.sent).toBe(1);
    expect(r.remaining).toBe(0);
  });

  it("mantém o item na fila e conta a tentativa quando falha", async () => {
    state.insertError = { message: "network error" };
    state.items = [item({ id: "falha" })];

    const r = await syncPending();

    expect(r.failed).toBe(1);
    expect(r.remaining).toBe(1);
    expect(state.items[0].attempts).toBe(1);
    expect(state.items[0].lastError).toContain("network");
    expect(r.firstError).toContain("OS 12345");
  });

  it("não dispara duas sincronizações concorrentes", async () => {
    state.items = [item({ id: "x" })];
    const [a, b] = await Promise.all([syncPending(), syncPending()]);
    expect(a).toBe(b);
    expect(state.inserts).toHaveLength(1);
  });

  it("envia foto hospedada e registra a URL", async () => {
    state.items = [
      item({ id: "foto-1", kind: "foto", payload: { blobKey: "k1", legenda: "Antes" } }),
    ];

    const r = await syncPending();

    expect(r.sent).toBe(1);
    expect(state.inserts[0].table).toBe("refrigeracao_fotos");
    expect(state.inserts[0].row.image_url).toBe("https://img/x.jpg");
  });
});
