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

export type AgentTurnPolicyContext = {
  trust_mode?: 'auto' | 'guarded' | 'strict' | 'cost_guard' | 'sensitive_guard';
  session_mode?: 'copilot' | 'agent';
  approval_ui?: 'card';
  interactive_approvals?: boolean;
  [key: string]: unknown;
};

export type AgentTurnApprovalRequest = {
  approval_id?: string | null;
  run_id?: string | null;
  prompt: string;
  labels?: string[];
  capabilities?: string[];
  actions?: string[];
  target?: string | null;
  scope?: 'once';
  reusable?: boolean;
  consequence?: string | null;
  status?: 'waiting' | 'approved' | 'rejected';
};

export type AgentTurnInterventionKind =
  | 'system_notice'
  | 'system_error'
  | 'connect_required'
  | 'run_offer'
  | 'workflow_offer'
  | 'run_handoff'
  | 'loop_detected';

export type AgentTurnIntervention = {
  kind: AgentTurnInterventionKind;
  title: string;
  detail?: string | null;
  severity?: 'info' | 'warning' | 'error';
  status?: 'ready' | 'waiting' | 'active' | 'completed' | 'failed';
  code?: string | null;
  run_id?: string | null;
  metadata?: Record<string, unknown>;
};

export type AgentTurnRequest = {
  tenant_id?: string;
  workspace_id: string;
  thread_id?: string;
  session_id: string;
  channel?: string;
  actor: ApiTurnActor;
  message: string;
  attachments?: ApiTurnAttachment[];
  context_hints?: Record<string, unknown>;
  execution_mode?: 'sync' | 'durable';
  response_mode?: 'stream' | 'artifact' | 'channel_reply';
  machine_target?: string | null;
  policy_context?: AgentTurnPolicyContext;
};

export type AgentTurnResponse = {
  ok?: boolean;
  status: string;
  reply?: string;
  run_id?: string | null;
  thread_id?: string | null;
  session_id?: string | null;
  artifacts?: Array<Record<string, unknown>>;
  approvals?: AgentTurnApprovalRequest[];
  interventions?: AgentTurnIntervention[];
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

export type ThreadTurnRecord = {
  id: string;
  tenant_id?: string;
  workspace_id?: string;
  thread_id: string;
  session_id?: string | null;
  request_id?: string | null;
  role: 'user' | 'assistant';
  status?: string | null;
  content: string;
  run_id?: string | null;
  actor?: Record<string, unknown>;
  approvals?: AgentTurnApprovalRequest[];
  interventions?: AgentTurnIntervention[];
  metadata?: Record<string, unknown>;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ThreadRecord = {
  id: string;
  tenant_id?: string;
  workspace_id?: string;
  owner_user_id?: string | null;
  channel?: string | null;
  title: string;
  status?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string | null;
  updated_at?: string | null;
  last_turn_at?: string | null;
  turns?: ThreadTurnRecord[];
};

export type ThreadListResponse = {
  items: ThreadRecord[];
  count: number;
  workspace_id?: string;
  tenant_id?: string | null;
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
  machine_id?: string | null;
  runtime_id?: string | null;
  interrupt_requested?: boolean;
  interrupt_requested_at?: string | null;
  interrupt_reason?: string | null;
  interrupt_scope?: string | null;
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

export type ComputerActionEventPayload = {
  schema?: 'empyralis.computer_action.v1';
  mode?: 'observing' | 'acting' | 'paused' | 'takeover' | string;
  phase?: 'planned' | 'completed' | 'failed' | 'paused' | string;
  step_number?: number | null;
  step_total?: number | null;
  tool?: string | null;
  action_type?: string | null;
  label?: string | null;
  reason?: string | null;
  detail?: string | null;
  status?: string | null;
  success?: boolean | null;
  x?: number | null;
  y?: number | null;
  text_summary?: string | null;
  file_path?: string | null;
  url?: string | null;
  error?: string | null;
  confidence?: number | null;
  certainty?: string | null;
  retry_count?: number | null;
  replanned?: boolean | null;
  readiness_state?: string | null;
  readiness_summary?: string | null;
  grounding_summary?: string | null;
  recovery_strategy?: string | null;
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

export type ApprovalItem = Record<string, unknown> & {
  approval_id?: string | null;
  run_id?: string | null;
  workspace_id?: string | null;
  status?: string | null;
  action?: string | null;
  summary?: string | null;
  requested_at?: string | null;
  expires_at?: string | null;
  correlation_id?: string | null;
};

export type ApprovalListResponse = {
  items: ApprovalItem[];
  pending?: ApprovalItem[];
  count?: number;
  total?: number;
  workspace_id?: string;
};

export type ApprovalResolveRequest = {
  approval_id?: string | null;
  resolution: "approved" | "rejected";
  actor?: string;
  reason?: string | null;
};

export type ApprovalResolveResponse = Record<string, unknown> & {
  status?: string;
  approval_id: string;
  run_id?: string | null;
  resolution: "approved" | "rejected";
  actor?: string;
  reason?: string;
  outbox_event?: Record<string, unknown>;
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
  title?: string | null;
  channel?: string | null;
  direction?: string | null;
  event_type?: string | null;
  tenant_id?: string | null;
  workspace_id?: string | null;
  session_key?: string | null;
  session_id?: string | null;
  message_id?: string | null;
  parent_id?: string | null;
  run_id?: string | null;
  machine_id?: string | null;
  trace_id?: string | null;
  action?: string | null;
  text?: string | null;
  read_at?: string | null;
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

export type NotificationReadRequest = {
  notification_ids?: string[];
  workspace_id?: string;
  mark_all?: boolean;
};

export type NotificationReadResponse = {
  status?: string;
  marked_count: number;
  marked_ids: string[];
  read_at?: string | null;
};

export type NotificationDeviceRegistrationRequest = {
  workspace_id: string;
  device_id: string;
  push_token: string;
  provider?: string;
  platform?: string | null;
  device_name?: string | null;
  app_id?: string | null;
  capabilities?: string[];
};

export type NotificationDeviceRegistrationResponse = {
  ok: boolean;
  device_id: string;
  workspace_id: string;
  tenant_id?: string | null;
  status: string;
  registered_at?: string | null;
  provider?: string | null;
};

export type HealthResponse = Record<string, unknown> & {
  ok?: boolean;
  status?: string | null;
  detail?: string | null;
  model?: string | null;
  codex_model?: string | null;
  model_name?: string | null;
  model_id?: string | null;
  modelId?: string | null;
};
