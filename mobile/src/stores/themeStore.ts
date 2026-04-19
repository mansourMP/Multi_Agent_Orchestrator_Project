import { create } from 'zustand';

type ThemeMode = 'light';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: 'light',
  setMode: (mode) => set({ mode }),
}));
