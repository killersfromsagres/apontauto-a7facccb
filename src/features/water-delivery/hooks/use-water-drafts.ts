import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface WaterDraft {
  visitaId: string;
  data: any;
  updatedAt: number;
}

interface WaterDraftState {
  drafts: Record<string, WaterDraft>;
  setDraft: (visitaId: string, data: any) => void;
  getDraft: (visitaId: string) => WaterDraft | undefined;
  removeDraft: (visitaId: string) => void;
  clearDrafts: () => void;
}

export const useWaterDrafts = create<WaterDraftState>()(
  persist(
    (set, get) => ({
      drafts: {},
      setDraft: (visitaId, data) =>
        set((state) => ({
          drafts: {
            ...state.drafts,
            [visitaId]: { visitaId, data, updatedAt: Date.now() },
          },
        })),
      getDraft: (visitaId) => get().drafts[visitaId],
      removeDraft: (visitaId) =>
        set((state) => {
          const newDrafts = { ...state.drafts };
          delete newDrafts[visitaId];
          return { drafts: newDrafts };
        }),
      clearDrafts: () => set({ drafts: {} }),
    }),
    {
      name: "water-drafts-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
