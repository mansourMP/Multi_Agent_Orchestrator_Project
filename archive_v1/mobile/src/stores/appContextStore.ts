import { create } from "zustand";

type AppContext = {
  id: string;
  name: string;
};

type AppContextState = {
  activeApp: AppContext | null;
  setActiveApp: (app: AppContext) => void;
  clearActiveApp: () => void;
};

export const useAppContextStore = create<AppContextState>((set) => ({
  activeApp: null,
  setActiveApp: (app) => set({ activeApp: app }),
  clearActiveApp: () => set({ activeApp: null }),
}));
