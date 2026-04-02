export type KinCapability = {
  id: string;
  label: string;
  icon: string;
  color: string;
  appId?: string;
};

const CAPABILITIES: KinCapability[] = [
  {
    id: "finance",
    label: "Finance",
    icon: "wallet",
    color: "#111827",
    appId: "finance",
  },
  {
    id: "health",
    label: "Health",
    icon: "fitness",
    color: "#EF4444",
    appId: "health",
  },
  {
    id: "study",
    label: "Study",
    icon: "book",
    color: "#2563EB",
    appId: "study",
  },
  {
    id: "travel",
    label: "Travel",
    icon: "airplane",
    color: "#06B6D4",
    appId: "travel",
  },
  {
    id: "research",
    label: "Research",
    icon: "search",
    color: "#F97316",
  },
];

const GENERAL_CAPABILITY: KinCapability = {
  id: "general",
  label: "General",
  icon: "sparkles",
  color: "#0F172A",
};

function hasAnyMatch(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

export function inferKinCapability(...sources: (string | undefined | null)[]) {
  const haystack = sources
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(" ");

  if (!haystack.trim()) {
    return GENERAL_CAPABILITY;
  }

  if (hasAnyMatch(haystack, ["finance", "budget", "expense", "wallet", "spend", "money", "invoice"])) {
    return CAPABILITIES[0];
  }

  if (hasAnyMatch(haystack, ["health", "nutrition", "sleep", "habit", "fitness", "wellness", "calorie"])) {
    return CAPABILITIES[1];
  }

  if (hasAnyMatch(haystack, ["study", "language", "reading", "learning", "flashcard", "lesson", "quiz"])) {
    return CAPABILITIES[2];
  }

  if (hasAnyMatch(haystack, ["travel", "trip", "flight", "hotel", "itinerary", "airline"])) {
    return CAPABILITIES[3];
  }

  if (hasAnyMatch(haystack, ["research", "builder", "compare", "source", "analysis", "web"])) {
    return CAPABILITIES[4];
  }

  return GENERAL_CAPABILITY;
}

export function formatRelativeTime(value?: string) {
  if (!value) return "Just now";
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return "Recent";
  const diffMinutes = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

export function isActiveRunStatus(status?: string) {
  const normalized = String(status || "").toLowerCase();
  return normalized === "queued" || normalized === "pending" || normalized === "running" || normalized === "waiting_approval";
}

export function isCompletedRunStatus(status?: string) {
  const normalized = String(status || "").toLowerCase();
  return normalized === "completed" || normalized === "failed";
}

export function formatRunStatus(status?: string) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "waiting_approval") return "Waiting approval";
  if (normalized === "completed") return "Completed";
  if (normalized === "failed") return "Failed";
  if (!normalized) return "Unknown";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).replace(/_/g, " ");
}
