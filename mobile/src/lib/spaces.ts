import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import type { MobileSpace } from "./types";

const STORAGE_KEY = "empyralis.mobile.spaces.v1";

const DEFAULT_SPACES: MobileSpace[] = [
  {
    id: "study",
    name: "Study",
    purpose: "Notes, revision, explanations, and study plans.",
    defaultAgentId: "private-assistant",
    quickActions: ["Explain this topic", "Quiz me", "Make a study plan"],
    kind: "study",
    system: true,
  },
  {
    id: "meals",
    name: "Meals",
    purpose: "Track meals, estimate calories, and plan food for the day.",
    defaultAgentId: "private-assistant",
    quickActions: ["Log a meal", "Estimate calories", "Plan meals"],
    kind: "meals",
    system: true,
  },
  {
    id: "projects",
    name: "Projects",
    purpose: "Check progress, blockers, and the next useful task.",
    defaultAgentId: "builder",
    quickActions: ["Show progress", "Next tasks", "Summarize blockers"],
    kind: "projects",
    system: true,
  },
  {
    id: "planning",
    name: "Planning",
    purpose: "Structure the day, week, and priorities clearly.",
    defaultAgentId: "private-assistant",
    quickActions: ["Plan my day", "Plan my week", "Set reminders"],
    kind: "planning",
    system: true,
  },
];

function mergeWithDefaults(stored: MobileSpace[] | null | undefined): MobileSpace[] {
  const custom = Array.isArray(stored) ? stored.filter((item) => !item.system) : [];
  return [...DEFAULT_SPACES, ...custom];
}

type SpacesState = {
  spaces: MobileSpace[];
  hydrated: boolean;
  load: () => Promise<void>;
  addSpace: (space: Omit<MobileSpace, "id" | "system">) => Promise<MobileSpace>;
  getSpace: (id: string) => MobileSpace | undefined;
};

export const useSpacesStore = create<SpacesState>((set, get) => ({
  spaces: DEFAULT_SPACES,
  hydrated: false,
  load: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as MobileSpace[]) : [];
    set({ spaces: mergeWithDefaults(parsed), hydrated: true });
  },
  addSpace: async (space) => {
    const next: MobileSpace = {
      ...space,
      id: `space-${Date.now()}`,
      system: false,
    };
    const custom = [...get().spaces.filter((item) => !item.system), next];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
    set({ spaces: mergeWithDefaults(custom) });
    return next;
  },
  getSpace: (id) => get().spaces.find((space) => space.id === id),
}));
