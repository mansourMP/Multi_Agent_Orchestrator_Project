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
  version?: string;
  latestVersion?: string;
  defaultStatus?: "installed" | "available";
};

export const APP_CATALOG: CatalogApp[] = [
  {
    id: "flashcards",
    name: "Flashcards",
    description: "Build decks, review cards, and study with a focused flow.",
    icon: "layers",
    iconBackground: "#2563EB",
    iconForeground: "#FFFFFF",
    iconAccent: "rgba(255,255,255,0.22)",
    category: "Learning",
    publisher: "core",
    version: "1.0.0",
    defaultStatus: "available",
  },
  {
    id: "calorie_tracking",
    name: "Calories",
    description: "Track meals, macros, and your daily calorie target.",
    icon: "restaurant",
    iconBackground: "#F97316",
    iconForeground: "#FFFFFF",
    iconAccent: "rgba(255,255,255,0.22)",
    category: "Health",
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
