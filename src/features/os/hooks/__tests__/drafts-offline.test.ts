import { beforeEach, describe, expect, it } from "vitest";

/** Stub de localStorage (ambiente de teste é Node, sem DOM). */
class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null;
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

const storage = new MemoryStorage();
(globalThis as any).localStorage = storage;

const { useOSDraftStore } = await import("../use-os-drafts");
const { useFleetDrafts } = await import("@/features/fleet/hooks/use-fleet-drafts");
const { useWaterDrafts } = await import("@/features/water-delivery/hooks/use-water-drafts");

beforeEach(() => {
  storage.clear();
  useOSDraftStore.setState({ drafts: {} });
  useFleetDrafts.setState({ drafts: {} });
  useWaterDrafts.setState({ drafts: {} });
});

describe("rascunho offline de OS", () => {
  it("acumula campos sem perder o que já foi digitado", () => {
    const { setDraft } = useOSDraftStore.getState();
    setDraft("os-1", { descricao: "Vazamento no 3º andar" } as any);
    setDraft("os-1", { status: "em_execucao" } as any);

    const draft = useOSDraftStore.getState().drafts["os-1"] as any;
    expect(draft.descricao).toBe("Vazamento no 3º andar");
    expect(draft.status).toBe("em_execucao");
  });

  it("isola rascunhos por OS e limpa apenas o alvo", () => {
    const { setDraft, clearDraft } = useOSDraftStore.getState();
    setDraft("os-1", { descricao: "A" } as any);
    setDraft("os-2", { descricao: "B" } as any);
    clearDraft("os-1");

    const drafts = useOSDraftStore.getState().drafts;
    expect(drafts["os-1"]).toBeUndefined();
    expect((drafts["os-2"] as any).descricao).toBe("B");
  });

  it("persiste no armazenamento local para retomar após fechar o app", () => {
    useOSDraftStore.getState().setDraft("os-9", { descricao: "Retomar" } as any);
    const raw = storage.getItem("os-drafts-storage");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.drafts["os-9"].descricao).toBe("Retomar");
  });
});

describe("rascunho offline de checklist de frota", () => {
  it("retoma o checklist do ponto onde parou", () => {
    const { setDraft } = useFleetDrafts.getState();
    setDraft("veic-1", "checklist_diario", { etapa: 3, itens: { pneus: "ok" } });
    setDraft("veic-1", "checklist_diario", { etapa: 4, itens: { pneus: "ok", freio: "ok" } });

    const draft = useFleetDrafts.getState().getDraft("veic-1");
    expect(draft?.type).toBe("checklist_diario");
    expect(draft?.data.etapa).toBe(4);
    expect(draft?.data.itens.freio).toBe("ok");
    expect(draft?.updatedAt).toBeGreaterThan(0);
  });

  it("remove o rascunho somente após o envio concluído", () => {
    const { setDraft, removeDraft } = useFleetDrafts.getState();
    setDraft("veic-2", "abastecimento", { litros: 40 });
    expect(useFleetDrafts.getState().getDraft("veic-2")).toBeDefined();
    removeDraft("veic-2");
    expect(useFleetDrafts.getState().getDraft("veic-2")).toBeUndefined();
  });
});

describe("rascunho offline de execução de água", () => {
  it("mantém a visita por id e não mistura pontos da rota", () => {
    const { setDraft } = useWaterDrafts.getState();
    setDraft("visita-1", { bebedouro_ok: true, bags: 1 });
    setDraft("visita-2", { bebedouro_ok: false, motivo: "acesso bloqueado" });

    expect(useWaterDrafts.getState().getDraft("visita-1")?.data.bags).toBe(1);
    expect(useWaterDrafts.getState().getDraft("visita-2")?.data.motivo).toBe("acesso bloqueado");
  });

  it("sobrescreve o rascunho da mesma visita em vez de duplicar", () => {
    const { setDraft } = useWaterDrafts.getState();
    setDraft("visita-3", { bags: 1 });
    setDraft("visita-3", { bags: 2 });

    expect(Object.keys(useWaterDrafts.getState().drafts)).toHaveLength(1);
    expect(useWaterDrafts.getState().getDraft("visita-3")?.data.bags).toBe(2);
  });
});
