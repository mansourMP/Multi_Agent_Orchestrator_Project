export type ApiTurnActor = {
  type: string;
  id: string;
  display_name: string;
};

export type ApiTurnAttachment = {
  kind: string;
  uri: string;
  name?: string;
  metadata?: Record<string, unknown>;
};

export type AgentTurnRequest = {
  tenant_id?: string;
  workspace_id: string;
  session_id: string;
  channel?: string;
  actor: ApiTurnActor;
  message: string;
  attachments?: ApiTurnAttachment[];
  context_hints?: Record<string, unknown>;
  execution_mode?: 'sync' | 'durable';
  response_mode?: 'stream' | 'artifact' | 'channel_reply';
  machine_target?: string | null;
  policy_context?: Record<string, unknown>;
};

export type AgentTurnResponse = {
  ok?: boolean;
  status: string;
  reply?: string;
  run_id?: string | null;
  session_id?: string | null;
  artifacts?: Array<Record<string, unknown>>;
  approvals?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
};

export type SessionCreateRequest = {
  tenant_id?: string;
  workspace_id: string;
  channel?: string;
  actor: ApiTurnActor;
  metadata?: Record<string, unknown>;
  session_id?: string | null;
};

export type SessionResponse = {
  ok?: boolean;
  session_id: string;
  workspace_id?: string;
  tenant_id?: string;
  channel?: string;
  actor?: Record<string, unknown>;
  created_at?: string | null;
  expires_at?: string | null;
  metadata?: Record<string, unknown>;
  status?: string;
};

export type RunListItem = {
  run_id?: string | null;
  engine?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
  workspace_id?: string | null;
  owner_user_id?: string | null;
  owner_email?: string | null;
  workflow_id?: string | null;
  pack_id?: string | null;
  agent_role?: string | null;
  parent_run_id?: string | null;
  execution_target_selected?: string | null;
  result_summary?: string | null;
  source?: 'live' | 'history' | null;
  raw?: Record<string, unknown>;
  [key: string]: unknown;
};

export type RunListResponse = {
  items: RunListItem[];
  count: number;
  total: number;
  limit: number;
  offset: number;
  next_offset?: number | null;
};

export type RunDetailResponse = Record<string, unknown> & {
  run_id?: string | null;
  status?: string | null;
  result?: string | null;
  result_data?: unknown;
  pending_confirmation?: Record<string, unknown> | null;
  pending_approval?: Record<string, unknown> | null;
  route?: Record<string, unknown> | null;
};

export type RunReplayResponse = {
  item?: {
    status?: string | null;
    result_data?: unknown;
    events?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  } | null;
};

export type ArtifactItem = Record<string, unknown> & {
  id?: string | null;
  run_id?: string | null;
  kind?: string | null;
  uri_or_path?: string | null;
  focus_target?: string | null;
};

export type ArtifactListResponse = {
  ok?: boolean;
  workspace_id?: string;
  updated_at?: string | null;
  summary?: Record<string, unknown>;
  items: ArtifactItem[];
};

export type MachineListResponse = Record<string, unknown> & {
  items?: Array<Record<string, unknown>>;
  runtimes?: Array<Record<string, unknown>>;
};

export type ConnectorListResponse = Record<string, unknown> & {
  items?: Array<Record<string, unknown>>;
  connectors?: Array<Record<string, unknown>>;
};

export type NotificationItem = {
  id?: string | null;
  ts?: string | null;
  channel?: string | null;
  direction?: string | null;
  event_type?: string | null;
  workspace_id?: string | null;
  session_key?: string | null;
  session_id?: string | null;
  message_id?: string | null;
  parent_id?: string | null;
  run_id?: string | null;
  trace_id?: string | null;
  action?: string | null;
  text?: string | null;
  metadata?: Record<string, unknown>;
};

export type NotificationListResponse = {
  items: NotificationItem[];
  count: number;
  total: number;
  sessions: Array<Record<string, unknown>>;
  session_count: number;
  stream?: boolean;
};
