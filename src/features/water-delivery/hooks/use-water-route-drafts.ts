import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface RouteDraft {
  id: string;
  data: any;
  updatedAt: number;
}

interface RouteState {
  drafts: Record<string, RouteDraft>;
  setDraft: (id: string, data: any) => void;
  getDraft: (id: string) => RouteDraft | undefined;
  removeDraft: (id: string) => void;
  clearDrafts: () => void;
}

export const useWaterRouteDrafts = create<RouteState>()(
  persist(
    (set, get) => ({
      drafts: {},
      setDraft: (id, data) => 
        set((state) => ({
          drafts: {
            ...state.drafts,
            [id]: { id, data, updatedAt: Date.now() }
          }
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
      name: 'water-route-drafts-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
