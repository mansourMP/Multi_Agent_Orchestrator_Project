import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "empyralis.mobile.kin.preferences.v1";

export type KinProactivity = "calm" | "balanced" | "proactive";
export type KinMemoryBoundary = "thread" | "app" | "workspace";
export type KinReminderCadence = "important" | "standard" | "frequent";
export type KinMemoryLayers = {
  workContext: string;
  personalContext: string;
  topOfMind: string;
  briefHistory: string;
  earlierContext: string;
  longTermBackground: string;
};

export type KinPreferences = {
  proactivity: KinProactivity;
  memoryBoundary: KinMemoryBoundary;
  reminderCadence: KinReminderCadence;
  activeAppIds: string[];
  memoryLayers: KinMemoryLayers;
};

export const DEFAULT_KIN_PREFERENCES: KinPreferences = {
  proactivity: "balanced",
  memoryBoundary: "app",
  reminderCadence: "standard",
  activeAppIds: ["study", "health", "finance", "travel"],
  memoryLayers: {
    workContext: "",
    personalContext: "",
    topOfMind: "",
    briefHistory: "",
    earlierContext: "",
    longTermBackground: "",
  },
};

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const next = value
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
  return next.length ? Array.from(new Set(next)) : fallback;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMemoryLayers(value: unknown): KinMemoryLayers {
  const raw = value && typeof value === "object" ? (value as Partial<KinMemoryLayers>) : {};
  return {
    workContext: normalizeString(raw.workContext),
    personalContext: normalizeString(raw.personalContext),
    topOfMind: normalizeString(raw.topOfMind),
    briefHistory: normalizeString(raw.briefHistory),
    earlierContext: normalizeString(raw.earlierContext),
    longTermBackground: normalizeString(raw.longTermBackground),
  };
}

function normalizePreferences(value: unknown): KinPreferences {
  const raw = value && typeof value === "object" ? (value as Partial<KinPreferences>) : {};
  const proactivity = raw.proactivity === "calm" || raw.proactivity === "proactive" ? raw.proactivity : "balanced";
  const memoryBoundary =
    raw.memoryBoundary === "thread" || raw.memoryBoundary === "workspace" ? raw.memoryBoundary : "app";
  const reminderCadence =
    raw.reminderCadence === "important" || raw.reminderCadence === "frequent" ? raw.reminderCadence : "standard";

  return {
    proactivity,
    memoryBoundary,
    reminderCadence,
    activeAppIds: normalizeStringArray(raw.activeAppIds, DEFAULT_KIN_PREFERENCES.activeAppIds),
    memoryLayers: normalizeMemoryLayers(raw.memoryLayers),
  };
}

export async function getKinPreferences(): Promise<KinPreferences> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_KIN_PREFERENCES;

  try {
    return normalizePreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_KIN_PREFERENCES;
  }
}

export async function persistKinPreferences(next: KinPreferences) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalizePreferences(next)));
}

export function useKinPreferences() {
  const [preferences, setPreferences] = useState<KinPreferences>(DEFAULT_KIN_PREFERENCES);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    getKinPreferences()
      .then((stored) => {
        if (active) {
          setPreferences(stored);
        }
      })
      .finally(() => {
        if (active) {
          setReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const updatePreferences = useCallback(
    async (nextValue: Partial<KinPreferences> | ((current: KinPreferences) => KinPreferences)) => {
      let nextPreferences = preferences;

      setPreferences((current) => {
        nextPreferences =
          typeof nextValue === "function"
            ? normalizePreferences(nextValue(current))
            : normalizePreferences({ ...current, ...nextValue });
        return nextPreferences;
      });

      await persistKinPreferences(nextPreferences);
    },
    [preferences],
  );

  return {
    preferences,
    ready,
    updatePreferences,
  };
}
