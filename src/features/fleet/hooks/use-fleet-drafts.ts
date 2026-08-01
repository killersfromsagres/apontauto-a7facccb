import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface FleetDraft {
  id: string;
  type: "checklist_diario" | "checklist_mensal" | "abastecimento";
  data: any;
  updatedAt: number;
}

interface FleetDraftState {
  drafts: Record<string, FleetDraft>;
  setDraft: (id: string, type: FleetDraft["type"], data: any) => void;
  getDraft: (id: string) => FleetDraft | undefined;
  removeDraft: (id: string) => void;
  clearDrafts: () => void;
}

export const useFleetDrafts = create<FleetDraftState>()(
  persist(
    (set, get) => ({
      drafts: {},
      setDraft: (id, type, data) =>
        set((state) => ({
          drafts: {
            ...state.drafts,
            [id]: { id, type, data, updatedAt: Date.now() },
          },
        })),
      getDraft: (id) => get().drafts[id],
      removeDraft: (id) =>
        set((state) => {
          const newDrafts = { ...state.drafts };
          delete newDrafts[id];
          return { drafts: newDrafts };
        }),
      clearDrafts: () => set({ drafts: {} }),
    }),
    {
      name: "fleet-drafts-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
