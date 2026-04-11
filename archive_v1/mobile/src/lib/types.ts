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
  expires_at?: string;
  target?: string;
  labels?: string[];
  capabilities?: string[];
  email_preview?: {
    recipient?: string;
    subject?: string;
    body_preview?: string;
    connector?: string;
    action_id?: string;
    artifact_reference?: string;
  };
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

export type TrustedDeviceSummary = {
  device_id: string;
  user_id?: string;
  workspace_id?: string | null;
  channel?: string | null;
  display_name?: string | null;
  platform?: string | null;
  trust_state?: string | null;
  status?: string | null;
  session_binding_required?: boolean | null;
  metadata?: Record<string, unknown>;
  linked_at?: number | null;
  updated_at?: number | null;
  last_seen_at?: number | null;
  revoked_at?: number | null;
  revoked_reason?: string | null;
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
  online?: boolean;
  healthy?: boolean;
  status?: string;
  control_state?: string;
  runtime_profile_label?: string;
  note?: string;
};

export type RuntimeTargetSummary = {
  target_id?: string;
  label?: string;
  description?: string;
  attachment_kind?: string;
  execution_target?: string;
  connection_mode?: string;
  available?: boolean;
  online?: boolean;
  healthy?: boolean;
  status?: string;
  attachment_count?: number;
  default_for_workspace?: boolean;
  product_default?: boolean;
  routed_through_platform?: boolean;
  direct_mobile_connection_required?: boolean;
  workspace_scoped_identity?: boolean;
  sample_attachment_label?: string;
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
  authMode?: "platform_account" | "runtime_key";
  runtimeUrl: string;
  runtimeKey: string;
  workspaceId: string;
  currentWorkspaceId?: string;
  defaultWorkspaceId?: string;
  currentTenantId?: string;
  defaultTenantId?: string;
  authToken?: string;
  user?: {
    id: string;
    email?: string | null;
    name?: string | null;
    avatar_url?: string | null;
    role?: string | null;
    is_admin?: boolean | null;
  };
  workspaceAccess?: Array<{
    workspace_id: string;
    tenant_id?: string | null;
    role?: string | null;
    capabilities?: Record<string, unknown> | null;
    dangerous_action_classes?: Record<string, unknown> | null;
    trusted_owner_machine_ids?: string[] | null;
  }>;
  tenantAccess?: Array<{
    tenant_id: string;
    role?: string | null;
  }>;
  authSession?: {
    session_id?: string;
    channel?: string | null;
    device_id?: string | null;
    runtime_id?: string | null;
    trust_state?: string | null;
    status?: string | null;
    expires_at?: number | null;
    last_seen_at?: number | null;
  };
  deviceLink?: {
    device_id?: string;
    workspace_id?: string | null;
    channel?: string | null;
    display_name?: string | null;
    platform?: string | null;
    trust_state?: string | null;
    status?: string | null;
    session_binding_required?: boolean | null;
  };
  sessionRecovery?: {
    session_id?: string | null;
    issued_at?: number | null;
    updated_at?: number | null;
    refreshToken?: string;
    refresh_expires_at?: number | null;
    rotated_at?: number | null;
    revoked_at?: number | null;
    revoked_reason?: string | null;
    active?: boolean | null;
    needsReauth?: boolean | null;
    recoveryReason?: string | null;
  };
  identityBoundary?: Record<string, any>;
  enterpriseSecurity?: Record<string, any>;
  platformUrl?: string;
  platformKey?: string;
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
