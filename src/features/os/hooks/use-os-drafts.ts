import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OSBase } from "../schemas/os-base";

interface OSDraftState {
  drafts: Record<string, Partial<OSBase>>;
  setDraft: (osId: string, draft: Partial<OSBase>) => void;
  clearDraft: (osId: string) => void;
}

export const useOSDraftStore = create<OSDraftState>()(
  persist(
    (set) => ({
      drafts: {},
      setDraft: (osId: string, draft: Partial<OSBase>) =>
        set((state: OSDraftState) => ({
          drafts: {
            ...state.drafts,
            [osId]: { ...state.drafts[osId], ...draft },
          },
        })),
      clearDraft: (osId: string) =>
        set((state: OSDraftState) => {
          const newDrafts = { ...state.drafts };
          delete newDrafts[osId];
          return { drafts: newDrafts };
        }),
    }),
    {
      name: "os-drafts-storage",
    }
  )
);
