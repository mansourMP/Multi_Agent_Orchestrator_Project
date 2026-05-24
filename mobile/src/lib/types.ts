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
  uri_or_path?: string;
};

export type MachineSummary = {
  runtime_id: string;
  display_name: string;
  status: string;
  online: boolean;
  current_lease_holder?: string;
  current_task_id?: string;
  platform?: string;
  last_seen_at?: string;
};

export type ConnectorSummary = {
  id: string;
  label: string;
  connector: string;
  status: string;
  connected: boolean;
  runtime_usable?: boolean | null;
  summary?: string;
};

export type NotificationSummary = {
  id: string;
  text: string;
  action?: string;
  channel?: string;
  ts?: string;
  run_id?: string;
  read_at?: string;
};

export type RuntimeAttachmentSummary = {
  attachment_id?: string;
  attachment_kind?: string;
  label?: string;
  runtime_id?: string;
  machine_id?: string;
  runtime_access_mode?: string;
  runtime_access_label?: string;
  online?: boolean;
  healthy?: boolean;
  status?: string;
  control_state?: string;
  runtime_profile_label?: string;
  note?: string;
};

export type ActivityArtifactSummary = {
  path?: string;
  label?: string;
  preview_url?: string;
  review_required?: boolean;
};

export type ActivitySummary = {
  id: string;
  actor_type?: string;
  actor_id?: string;
  event_class?: string;
  action?: string;
  title?: string;
  summary?: string;
  created_at?: string;
  review_required?: boolean;
  artifacts: ActivityArtifactSummary[];
};

export type UnifiedMemorySummary = {
  layerOrder: string[];
  summary: Record<string, any>;
  boundaryMap: {
    neverSyncByDefault: string[];
    cloudSyncedByDefault: string[];
    explicitOptIn: string[];
  };
};

export type SchedulerSummary = {
  policy: Record<string, any>;
  wakeQueue: Record<string, any>;
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
  authScheme?: "api_key" | "bearer";
  tenantId?: string;
  workspaceId?: string;
  platformUrl?: string;
  platformKey?: string;
  refreshToken?: string;
  refreshExpiresAt?: number;
  authSessionId?: string;
  userEmail?: string;
  userDisplayName?: string;
  pairingMethod?: "manual" | "pairing_qr" | "pairing_code";
  pairedAt?: string;
  pairingId?: string;
  pairingExpiresAt?: string;
  pairingLabel?: string;
  deviceId?: string;
  sessionLinkedAt?: string;
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
