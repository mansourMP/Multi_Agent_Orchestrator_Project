export type CatalogApp = {
  id: string;
  name: string;
  description?: string;
  icon: string;
  iconBackground: string;
  iconForeground?: string;
  iconAccent?: string;
  category?: string;
  publisher?: "core" | "community";
  // Semver-ish strings used only for display.
  version?: string;
  latestVersion?: string;
  // Static default used when the core is offline or not configured yet.
  defaultStatus?: "installed" | "available";
};

export const APP_CATALOG: CatalogApp[] = [
  {
    id: "nutrition",
    name: "Nutrition",
    description: "Photo-based meal tracking",
    icon: "restaurant",
    iconBackground: "#22C55E",
    iconForeground: "#FFFFFF",
    iconAccent: "rgba(255,255,255,0.28)",
    category: "Health & Habit",
    publisher: "core",
    version: "1.0.0",
    latestVersion: "1.1.0",
    defaultStatus: "available",
  },
  {
    id: "finance",
    name: "Finance",
    description: "Income and expense tracking",
    icon: "wallet",
    iconBackground: "#111827",
    iconForeground: "#F8FAFC",
    iconAccent: "#F59E0B",
    category: "Productivity",
    publisher: "core",
    version: "1.0.0",
    defaultStatus: "available",
  },
  {
    id: "health",
    name: "Health",
    description: "Vitals and health logs",
    icon: "fitness",
    iconBackground: "#EF4444",
    iconForeground: "#FFFFFF",
    iconAccent: "rgba(255,255,255,0.26)",
    category: "Health & Habit",
    publisher: "core",
    version: "1.0.0",
    latestVersion: "1.0.1",
    defaultStatus: "available",
  },
  {
    id: "study",
    name: "Study",
    description: "Notes and flashcards",
    icon: "book",
    iconBackground: "#2563EB",
    iconForeground: "#FFFFFF",
    iconAccent: "rgba(255,255,255,0.22)",
    category: "Learning",
    publisher: "core",
    version: "1.0.0",
    defaultStatus: "available",
  },
  {
    id: "language",
    name: "Language Coach",
    description: "Speaking practice and drills",
    icon: "language",
    iconBackground: "#7C3AED",
    iconForeground: "#FFFFFF",
    iconAccent: "rgba(255,255,255,0.24)",
    category: "Learning",
    publisher: "core",
    version: "1.0.0",
    defaultStatus: "available",
  },
  {
    id: "travel",
    name: "Travel",
    description: "Trips and itineraries",
    icon: "airplane",
    iconBackground: "#06B6D4",
    iconForeground: "#FFFFFF",
    iconAccent: "rgba(255,255,255,0.22)",
    category: "Lifestyle",
    publisher: "community",
    version: "0.9.0",
    defaultStatus: "available",
  },
  {
    id: "home",
    name: "Home",
    description: "Smart home routines",
    icon: "home",
    iconBackground: "#F97316",
    iconForeground: "#FFFFFF",
    iconAccent: "rgba(255,255,255,0.22)",
    category: "Lifestyle",
    publisher: "community",
    version: "0.9.0",
    defaultStatus: "available",
  },
  {
    id: "notes",
    name: "Notes",
    description: "Capture and organize notes",
    icon: "document-text",
    iconBackground: "#0EA5E9",
    iconForeground: "#FFFFFF",
    iconAccent: "rgba(255,255,255,0.22)",
    category: "Productivity",
    publisher: "core",
    version: "1.0.0",
    defaultStatus: "available",
  },
  {
    id: "planner",
    name: "Planner",
    description: "Daily planning and checklists",
    icon: "calendar",
    iconBackground: "#F43F5E",
    iconForeground: "#FFFFFF",
    iconAccent: "rgba(255,255,255,0.22)",
    category: "Productivity",
    publisher: "core",
    version: "1.0.0",
    defaultStatus: "available",
  },
  {
    id: "focus",
    name: "Focus",
    description: "Pomodoro and deep work",
    icon: "timer",
    iconBackground: "#0F172A",
    iconForeground: "#FBBF24",
    iconAccent: "rgba(255,255,255,0.16)",
    category: "Productivity",
    publisher: "core",
    version: "1.0.0",
    defaultStatus: "available",
  },
  {
    id: "reading",
    name: "Reading",
    description: "Summaries and highlights",
    icon: "reader",
    iconBackground: "#14B8A6",
    iconForeground: "#FFFFFF",
    iconAccent: "rgba(255,255,255,0.22)",
    category: "Learning",
    publisher: "core",
    version: "1.0.0",
    defaultStatus: "available",
  },
  {
    id: "writing",
    name: "Writing",
    description: "Drafts and rewrites",
    icon: "create",
    iconBackground: "#8B5CF6",
    iconForeground: "#FFFFFF",
    iconAccent: "rgba(255,255,255,0.22)",
    category: "Productivity",
    publisher: "core",
    version: "1.0.0",
    defaultStatus: "available",
  },
  {
    id: "habits",
    name: "Habits",
    description: "Track habits and streaks",
    icon: "checkmark-circle",
    iconBackground: "#10B981",
    iconForeground: "#FFFFFF",
    iconAccent: "rgba(255,255,255,0.22)",
    category: "Health & Habit",
    publisher: "core",
    version: "1.0.0",
    defaultStatus: "available",
  },
];

export function getCatalogApp(appId: string) {
  return APP_CATALOG.find((app) => app.id === appId);
}

export function getDefaultInstalledApps() {
  return APP_CATALOG.filter((app) => app.defaultStatus === "installed");
}

export function getDefaultStoreApps() {
  return APP_CATALOG.filter((app) => app.defaultStatus !== "installed");
}
