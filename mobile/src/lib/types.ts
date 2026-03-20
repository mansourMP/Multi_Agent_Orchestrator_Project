export type AgentSummary = {
  id: string;
  label: string;
  subtitle?: string;
  status?: string;
};

export type RunSummary = {
  run_id: string;
  status: string;
  summary?: string;
  agent_role?: string;
  started_at?: string;
};

export type ApprovalSummary = {
  approval_id: string;
  run_id: string;
  action: string;
  status: string;
  summary?: string;
  requested_at?: string;
};

export type ArtifactSummary = {
  id: string;
  run_id?: string;
  label: string;
  kind?: string;
  preview_url?: string;
};

export type AppRecordSource = "core" | "platform" | "preview";

export type AppRecord = {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  publisher?: string;
  status: "installed" | "available" | "pending";
  version: string;
  latestVersion?: string;
  permissions: string[];
  source: AppRecordSource;
  packageId?: string;
  releaseChannel?: string;
};

export type MobileSession = {
  runtimeUrl: string;
  runtimeKey: string;
  workspaceId: string;
  platformUrl?: string;
  platformKey?: string;
};

export type MobileSpace = {
  id: string;
  name: string;
  purpose: string;
  defaultAgentId: string;
  quickActions: string[];
  kind: "study" | "meals" | "projects" | "planning" | "custom";
  system?: boolean;
};
