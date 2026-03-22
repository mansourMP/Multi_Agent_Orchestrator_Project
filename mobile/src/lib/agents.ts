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

const BUILT_IN_AGENTS: AgentThread[] = [
  {
    id: "personal-assistant",
    label: "Personal Assistant",
    runtimeRole: "private-assistant",
    subtitle: "General help, planning, and daily tasks",
    icon: "sparkles",
    avatarColor: "#4F46E5",
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
    avatarColor: "#DC2626",
    intro: "I can help you track health notes, routines, and daily wellbeing check-ins.",
  },
  {
    id: "travel-agent",
    label: "Travel Agent",
    runtimeRole: "travel-agent",
    subtitle: "Trips, itineraries, and travel planning",
    icon: "airplane",
    avatarColor: "#F97316",
    intro: "I can help you plan trips, organize travel details, and summarize itineraries.",
  },
];

const AGENT_COLORS = ["#0EA5E9", "#14B8A6", "#F59E0B", "#EC4899", "#8B5CF6", "#22C55E"];

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function hashColor(value: string) {
  let total = 0;
  for (let i = 0; i < value.length; i += 1) {
    total += value.charCodeAt(i);
  }
  return AGENT_COLORS[total % AGENT_COLORS.length];
}

function builtInMatches(agent: Pick<AgentSummary, "id" | "label">, target: AgentThread) {
  const id = normalize(agent.id);
  const label = normalize(agent.label);

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

export function buildAgentDirectory(discovered: AgentSummary[] = []) {
  const merged = BUILT_IN_AGENTS.map((agent) => {
    const matched = discovered.find((item) => builtInMatches(item, agent));
    if (!matched) return agent;
    return {
      ...agent,
      runtimeRole: matched.id || agent.runtimeRole,
      subtitle: matched.subtitle || agent.subtitle,
    };
  });

  const customAgents = discovered
    .filter((agent) => !merged.some((item) => builtInMatches(agent, item)))
    .map((agent) => ({
      id: agent.id,
      label: agent.label,
      runtimeRole: agent.id,
      subtitle: agent.subtitle || "User-created agent",
      icon: "person",
      avatarColor: hashColor(agent.id),
      intro: `${agent.label} is ready.`,
    }));

  return [...merged, ...customAgents];
}

export function getAgentById(id: string, discovered: AgentSummary[] = []) {
  return buildAgentDirectory(discovered).find((agent) => agent.id === id);
}
