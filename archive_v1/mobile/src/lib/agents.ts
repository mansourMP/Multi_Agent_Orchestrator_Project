import type { AgentSummary } from "./types";

export type AgentThread = {
  id: string;
  label: string;
  runtimeRole?: string;
  subtitle?: string;
  icon: string;
  avatarColor: string;
  intro: string;
};

export const PRIMARY_AGENT: AgentThread = {
  id: "assistant",
  label: "Sage",
  runtimeRole: "private-assistant",
  subtitle: "Pinned master channel for your workspace, context, and specialist routing.",
  icon: "sparkles",
  avatarColor: "#111827",
  intro: "I can coordinate work across specialists, approvals, context changes, and active runs without leaking power between them.",
};

const BUILT_IN_AGENTS: AgentThread[] = [
  PRIMARY_AGENT,
  {
    id: "personal-assistant",
    label: "Personal Assistant",
    runtimeRole: "private-assistant",
    subtitle: "General help, planning, and daily tasks",
    icon: "sparkles",
    avatarColor: "#6D28D9",
    intro: "I can help you plan, write, summarize, and take actions when needed.",
  },
  {
    id: "finance-agent",
    label: "Finance Agent",
    runtimeRole: "private-assistant",
    subtitle: "Budgets, expenses, and financial summaries",
    icon: "wallet",
    avatarColor: "#16A34A",
    intro: "I can help you review spending, organize financial notes, and summarize money-related work.",
  },
  {
    id: "research-agent",
    label: "Research Agent",
    runtimeRole: "builder",
    subtitle: "Research, synthesis, and structured output",
    icon: "search",
    avatarColor: "#F97316",
    intro: "I can help you research a topic, compare options, and turn findings into something usable.",
  },
  {
    id: "health-agent",
    label: "Health Agent",
    runtimeRole: "health-agent",
    subtitle: "Health logs, habits, and wellbeing check-ins",
    icon: "heart",
    avatarColor: "#E85D75",
    intro: "I can help you track health notes, routines, and daily wellbeing check-ins.",
  },
  {
    id: "travel-agent",
    label: "Travel Agent",
    runtimeRole: "travel-agent",
    subtitle: "Trips, itineraries, and travel planning",
    icon: "airplane",
    avatarColor: "#2563EB",
    intro: "I can help you plan trips, organize travel details, and summarize itineraries.",
  },
];

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function pickTemplate(value: string) {
  const token = normalize(value);
  return (
    BUILT_IN_AGENTS.find((item) => normalize(item.id) === token || normalize(item.label) === token) ||
    BUILT_IN_AGENTS.find((item) => token.includes("finance") && item.id === "finance-agent") ||
    BUILT_IN_AGENTS.find((item) => token.includes("health") && item.id === "health-agent") ||
    BUILT_IN_AGENTS.find((item) => token.includes("travel") && item.id === "travel-agent") ||
    BUILT_IN_AGENTS.find((item) => token.includes("research") && item.id === "research-agent") ||
    BUILT_IN_AGENTS.find((item) => token.includes("assistant") && item.id === "personal-assistant") ||
    null
  );
}

function builtInMatches(agent: Pick<AgentSummary, "id" | "label">, target: AgentThread) {
  const id = normalize(agent.id);
  const label = normalize(agent.label);

  if (target.id === PRIMARY_AGENT.id) {
    return (
      id === "assistant" ||
      id === "private-assistant" ||
      label.includes("kin") ||
      label.includes("personal assistant") ||
      label.includes("private assistant")
    );
  }

  if (target.id === "personal-assistant") {
    return (
      id === "private-assistant" ||
      label.includes("personal assistant") ||
      label.includes("private assistant")
    );
  }

  if (target.id === "finance-agent") {
    return (
      id === "finance-agent" ||
      label.includes("finance agent") ||
      label.includes("finance")
    );
  }

  if (target.id === "health-agent") {
    return id === "health-agent" || label.includes("health agent") || label.includes("health");
  }

  if (target.id === "travel-agent") {
    return id === "travel-agent" || label.includes("travel agent") || label.includes("travel");
  }

  return (
    id === "research-agent" ||
    id === "builder" ||
    label.includes("research agent") ||
    label.includes("research") ||
    label.includes("builder")
  );
}

export function getBuiltInAgents() {
  return BUILT_IN_AGENTS;
}

export function getPrimaryAgent() {
  return PRIMARY_AGENT;
}

export function getFallbackSpecialists() {
  return BUILT_IN_AGENTS.filter((agent) => agent.id !== PRIMARY_AGENT.id);
}

export function buildAgentThreadFromInstall(install: Record<string, any>): AgentThread {
  const metadata = install?.metadata && typeof install.metadata === "object" ? install.metadata : {};
  const manifest = metadata.manifest && typeof metadata.manifest === "object" ? metadata.manifest : {};
  const identity = manifest.identity && typeof manifest.identity === "object" ? manifest.identity : {};
  const label = String(install?.label || identity.name || "Specialist").trim();
  const role = String(identity.role || install?.runtime_role || install?.status || "").trim();
  const summary = String(identity.summary || role || "Specialist channel").trim();
  const template = pickTemplate(`${label} ${role}`) || getFallbackSpecialists()[0] || PRIMARY_AGENT;

  return {
    id: String(install?.id || template.id || label).trim(),
    label,
    runtimeRole: role || template.runtimeRole,
    subtitle: summary || template.subtitle,
    icon: template.icon,
    avatarColor: template.avatarColor,
    intro: template.intro,
  };
}

export function buildAgentDirectory(discovered: AgentSummary[] = []) {
  const matchedPrimary = discovered.find((item) => builtInMatches(item, PRIMARY_AGENT));
  const visiblePrimary = matchedPrimary
    ? {
        ...PRIMARY_AGENT,
        runtimeRole: matchedPrimary.id || PRIMARY_AGENT.runtimeRole,
        subtitle: matchedPrimary.subtitle || PRIMARY_AGENT.subtitle,
      }
    : PRIMARY_AGENT;

  return [visiblePrimary];
}

export function getAgentById(id: string, discovered: AgentSummary[] = []) {
  return buildAgentDirectory(discovered).find((agent) => agent.id === id);
}
