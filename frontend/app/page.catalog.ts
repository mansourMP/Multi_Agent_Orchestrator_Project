export const UI = {
  shell: 'var(--bg-sidebar)',
  surface: 'var(--bg-surface)',
  surfaceAlt: 'var(--bg-element)',
  border: 'var(--border-default)',
  borderSoft: 'var(--border-subtle)',
  text: 'var(--text-primary)',
  textSoft: 'var(--text-primary)',
  textMuted: 'var(--text-secondary)',
  accent: 'var(--primary-base)',
  accentSoft: 'var(--primary-soft)',
  accentBorder: 'var(--primary-border-soft)',
  success: 'var(--success-base)',
  successFg: 'var(--success-fg)',
  successBg: 'var(--success-bg)',
  successBorder: 'var(--success-border)',
  warning: 'var(--warning-base)',
  warningFg: 'var(--warning-fg)',
  warningBg: 'var(--warning-bg)',
  warningBorder: 'var(--warning-border)',
  error: 'var(--error-base)',
  errorFg: 'var(--error-fg)',
  errorBg: 'var(--error-bg)',
  errorBorder: 'var(--error-border)',
  disabled: 'var(--claude-neutral-400)',
};

export type RunStatus = 'idle' | 'queued_local' | 'running' | 'waiting' | 'completed' | 'error';
export type LogLevel = 'info' | 'warn' | 'error';
export type ProviderId = 'openai' | 'anthropic' | 'claude_code_cli' | 'gemini' | 'vertex' | 'qwen' | 'deepseek' | 'mistral' | 'ollama';
export type ConnectorId =
  | 'google_workspace'
  | 'microsoft_365'
  | 'telegram_bot'
  | 'wechat_work'
  | 'whatsapp_twilio'
  | 'discord_bot'
  | 'instagram_business';
export type ConnectorCatalogId =
  | ConnectorId
  | 'discord'
  | 'microsoft_365'
  | 'x_twitter'
  | 'instagram_business'
  | 'youtube'
  | 'tiktok_business'
  | 'custom_api';
export type ProviderOption = {
  id: ProviderId;
  label: string;
  defaultModel: string;
  auth: string[];
  defaultAuthMode?: string;
  authModes?: { id: string; label: string; secretRequired?: boolean }[];
  note?: string;
};
export type ModelAliasOption = {
  alias: string;
  provider: ProviderId;
  model: string;
  resolvedModel: string;
  isGlobalDefault: boolean;
  isProviderDefault: boolean;
};
export type ConnectorOption = {
  id: ConnectorId;
  label: string;
  note: string;
};
export type ConnectorCatalogStatus = 'native_now' | 'provider_next' | 'custom_build';
export type ConnectorCatalogEntry = {
  id: ConnectorCatalogId;
  label: string;
  note: string;
  detail: string;
  status: ConnectorCatalogStatus;
  connector?: ConnectorId;
};
export type ConnectorCatalogSection = {
  id: ConnectorCatalogStatus;
  title: string;
  description: string;
  items: ConnectorCatalogEntry[];
};
export type ConnectorLaunchPlan = {
  id: string;
  label: string;
  audience: string;
  bestFor: string;
  path: string;
  connectorCatalogId: ConnectorCatalogId;
};
export type TrustMode = 'auto' | 'guarded' | 'strict' | 'cost_guard' | 'sensitive_guard';
export type ConnectionMode = 'managed' | 'byok' | 'local_companion';
export type ExecutionTarget = 'auto' | 'cloud' | 'local_companion';
export type DrawerPanel = 'setup' | 'details' | 'metrics' | 'logs';
export type AgentRoleId =
  | 'orchestrator'
  | 'support'
  | 'sales'
  | 'research'
  | 'finance'
  | 'builder'
  | 'private-assistant';
export type AgentRoleOption = {
  id: AgentRoleId;
  label: string;
  description: string;
};

export const DEFAULT_AGENT_ROLE_ID: AgentRoleId = 'orchestrator';
export const AGENT_ROLE_OPTIONS: AgentRoleOption[] = [
  { id: 'orchestrator', label: 'Orchestrator', description: 'route work and approvals' },
  { id: 'support', label: 'Support Inbox', description: 'customer messages and feedback' },
  { id: 'sales', label: 'Sales / Booking', description: 'leads, booking, follow-ups' },
  { id: 'research', label: 'Research / Memory', description: 'briefs, analysis, memory' },
  { id: 'finance', label: 'Finance / Sheets', description: 'spreadsheets and reporting' },
  { id: 'builder', label: 'Builder Ops', description: 'code, design, internal tools' },
  { id: 'private-assistant', label: 'Private Assistant', description: 'study, planning, reminders' },
];

export function isAgentRoleId(value: unknown): value is AgentRoleId {
  return AGENT_ROLE_OPTIONS.some((item) => item.id === value);
}

export function normalizeAgentRoleId(value: unknown): AgentRoleId {
  return isAgentRoleId(value) ? value : DEFAULT_AGENT_ROLE_ID;
}

export type RuntimeMetrics = {
  scheduler?: {
    enabled: boolean;
    poll_seconds: number;
    weekly_schedules: number;
  };
  local_companion?: {
    enabled: boolean;
    lease_seconds: number;
    pending_runs: number;
    claimed_runs: number;
    known_workers?: number;
    online_workers?: number;
  };
  runs: {
    started: number;
    completed: number;
    failed: number;
    timeout: number;
    active: number;
    waiting_for_input: number;
    completion_rate: number;
  };
  kpis: {
    avg_run_duration_ms: number;
    avg_time_to_first_value_ms: number;
    avg_human_wait_ms: number;
  };
};

export type LocalWorkerStatusItem = {
  worker_id: string;
  status: string;
  online: boolean;
  current_run_id?: string | null;
  last_seen_at?: string | null;
  seconds_since_seen?: number | null;
  lease_seconds?: number;
  note?: string | null;
};

export type LocalWorkerStatus = {
  enabled: boolean;
  lease_seconds: number;
  summary: {
    known: number;
    online: number;
    busy: number;
    idle: number;
    offline: number;
    pending_runs: number;
    claimed_runs: number;
  };
  items: LocalWorkerStatusItem[];
};

export type SetupSessionState =
  | 'init'
  | 'configuring'
  | 'provider_selected'
  | 'credential_captured'
  | 'verified'
  | 'complete'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type SetupSession = {
  id: string;
  workspace_id?: string;
  state: SetupSessionState;
  flow?: string;
  next_step?: string;
  allowed_actions?: string[];
  safety?: { risk_acknowledged?: boolean };
  provider?: string | null;
  credential_id?: string | null;
  last_error?: string | null;
  created_at?: string;
  updated_at?: string;
  expires_at?: string;
  config?: Record<string, unknown>;
  events?: Array<{ ts?: string; action?: string; state?: string }>;
};

export type WeeklyScheduleItem = {
  id: string;
  name: string;
  workspace_id?: string | null;
  enabled: boolean;
  day_of_week: string;
  time_hhmm: string;
  timezone: 'local' | 'utc';
  run_request: Record<string, unknown>;
  last_trigger_date?: string | null;
  last_run_id?: string | null;
  last_error?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ExecutionSummary = {
  schema_version?: number;
  trust_mode_applied?: string;
  approval_required?: boolean;
  approval_reason?: string | null;
  risk_level?: 'low' | 'medium' | 'high' | string;
  next_action?: string;
  estimated_time_saved_minutes?: number;
};

export type LogEntry = {
  ts: string;
  level: LogLevel;
  message: string;
  event?: string;
  nodeId?: string;
};

export type StreamPayload = {
  message?: string;
  level?: string;
  event?: string;
  data?: unknown;
};

export type RoutePayload = {
  requested?: string;
  selected?: string;
  reason?: string;
  fallback?: string | null;
  local_companion_enabled?: boolean;
};

export type DoctorCheck = {
  name: string;
  status: 'pass' | 'warn' | 'fail' | string;
  detail?: string;
  recommendation?: string;
};

export type VaultCredentialItem = {
  id: string;
  label: string;
  provider: string;
  metadata?: Record<string, unknown>;
  authMode?: string;
};

export type ConnectorCredentialItem = {
  id: string;
  label: string;
  connector: ConnectorId;
};

export type OutcomeGoal = {
  id: string;
  label: string;
  goal: string;
};

export type OutcomePack = {
  id: string;
  label: string;
  description: string;
  scope: string[];
  defaultGoal: string;
  goals: OutcomeGoal[];
  inputLabels: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  inputPlaceholders: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
};

export type OutcomeContract = {
  inputs: string[];
  actions: string[];
  success: string[];
};

export type LocalExecutionToolId =
  | 'read_write_files'
  | 'capture_screenshot'
  | 'execute_shell_command'
  | 'browser_automation';
export type LocalExecutionFileMode = 'read' | 'write' | 'append';
export type LocalExecutionBrowserMode = 'extract_text' | 'extract_links' | 'save_html' | 'capture_page';
export type LocalExecutionOperationDraft = {
  tool: LocalExecutionToolId;
  fileMode: LocalExecutionFileMode;
  browserMode: LocalExecutionBrowserMode;
  path: string;
  content: string;
  command: string;
  cwd: string;
  url: string;
  browserSessionProfile: string;
  browserActionScript: string;
  waitForSelector: string;
  clickSelector: string;
  typeSelector: string;
  typeText: string;
};
export type LocalExecutionDraft = {
  operations: LocalExecutionOperationDraft[];
  activeOperationIndex: number;
  continueOnError: boolean;
};

export type BusinessPreset = {
  id: string;
  label: string;
  description: string;
  packId: string;
  goal: string;
  inputs: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
};

export type CustomerOpsAction = {
  id: string;
  lead_name?: string;
  message?: string;
  priority?: string;
  category?: string;
  next_action?: string;
  proposed_slot?: string;
  status?: string;
  delivery?: 'sent' | 'draft' | string;
  sent?: boolean;
  sent_message_id?: string;
  send_error?: string;
  draft_created?: boolean;
  draft_id?: string;
  draft_error?: string;
};

export type CustomerOpsResult = {
  pack_id: 'customer-ops-autopilot';
  summary: string;
  result_schema_version?: number;
  trust_mode?: string;
  execution_summary?: ExecutionSummary;
  inputs: {
    inbox_count: number;
    lead_count: number;
    slot_count: number;
  };
  outputs: {
    urgent_count: number;
    outbound_actions: number;
    triage: CustomerOpsAction[];
    follow_ups: CustomerOpsAction[];
    bookings: CustomerOpsAction[];
  };
  connector?: {
    enabled: boolean;
    connector: string;
    account_profile?: { emailAddress?: string | null; displayName?: string | null };
    email_drafts_created: number;
    email_sent_count: number;
    calendar_events_created: number;
    warnings: string[];
  };
  next_steps: string[];
};

export type WeeklyContentPlanItem = {
  id: string;
  day: string;
  channel: string;
  format: string;
  topic: string;
  headline: string;
  cta: string;
  status: string;
};

export type WeeklyContentResult = {
  pack_id: 'weekly-content-studio';
  summary: string;
  result_schema_version?: number;
  trust_mode?: string;
  execution_summary?: ExecutionSummary;
  inputs: {
    topics_count: number;
    channels_count: number;
    offers_count: number;
  };
  outputs: {
    content_plan: WeeklyContentPlanItem[];
    outbound_actions: number;
    urgent_count: number;
  };
  next_steps: string[];
};

export type CompetitorBriefItem = {
  id: string;
  name: string;
  notes: string;
  threat_level: string;
  recommended_play: string;
};

export type CompetitorBriefResult = {
  pack_id: 'competitor-brief-digest';
  summary: string;
  result_schema_version?: number;
  trust_mode?: string;
  execution_summary?: ExecutionSummary;
  inputs: {
    competitors_count: number;
    positioning_points: number;
    objectives_count: number;
  };
  outputs: {
    briefs: CompetitorBriefItem[];
    high_threat_count: number;
    outbound_actions: number;
    urgent_count: number;
  };
  next_steps: string[];
};

export type SpreadsheetOpsAction = {
  action: 'spreadsheet_read' | 'spreadsheet_update' | 'spreadsheet_append' | 'spreadsheet_create' | string;
  file_path: string;
  sheet_name?: string;
  row_limit?: number;
  row_index?: number;
  values?: Record<string, unknown>;
  rows?: Array<Record<string, unknown>>;
  overwrite?: boolean;
  storage?: string;
  connector?: string | null;
};

export type SpreadsheetOpsResult = {
  pack_id: 'spreadsheet-ops-v1';
  summary: string;
  result_schema_version?: number;
  trust_mode?: string;
  execution_summary?: ExecutionSummary;
  inputs: {
    file_path: string;
    operation: string;
    sheet_name: string;
    rows_input: number;
  };
  outputs: {
    operation: string;
    file_path: string;
    sheet_name: string;
    format: string;
    columns: string[];
    preview: Array<Record<string, unknown>>;
    rows_read: number;
    rows_written: number;
    actions: SpreadsheetOpsAction[];
    outbound_actions: number;
    urgent_count: number;
    storage?: string;
    connector?: string | null;
    remote_path?: string | null;
  };
  next_steps: string[];
};

export type DocumentStudioAction = {
  action: 'document_create' | 'document_update' | 'presentation_create' | 'presentation_update' | string;
  file_path: string;
  title?: string;
  sections?: Array<Record<string, unknown>>;
  slides?: Array<Record<string, unknown>>;
  overwrite?: boolean;
  storage?: string;
  connector?: string | null;
};

export type DocumentStudioResult = {
  pack_id: 'document-studio-v1';
  summary: string;
  result_schema_version?: number;
  trust_mode?: string;
  execution_summary?: ExecutionSummary;
  inputs: {
    file_path: string;
    operation: string;
    title: string;
    storage: string;
  };
  outputs: {
    operation: string;
    file_path: string;
    format: string;
    title: string;
    preview: string[];
    items_written: number;
    actions: DocumentStudioAction[];
    outbound_actions: number;
    urgent_count: number;
    storage?: string;
    connector?: string | null;
    remote_path?: string | null;
  };
  next_steps: string[];
};

export type LocalExecutionAction = {
  step_index?: number;
  step_number?: number;
  tool?: LocalExecutionToolId | string;
  status?: 'completed' | 'failed' | string;
  summary?: string;
  action: LocalExecutionToolId | string;
  mode?: string;
  path?: string;
  file_path?: string;
  bytes_read?: number;
  bytes_written?: number;
  content_preview?: string;
};

export type LocalExecutionArtifact = {
  step_index?: number;
  step_number?: number;
  tool?: LocalExecutionToolId | string;
  kind: string;
  file_path: string;
  label: string;
};

export type LocalExecutionStepResult = {
  step_index: number;
  step_number: number;
  tool: LocalExecutionToolId | string;
  summary: string;
  status: 'completed' | 'failed' | string;
  artifact_file_path?: string;
  message?: string;
};

export type LocalExecutionResult = {
  pack_id: 'local-execution-v1';
  summary: string;
  result_schema_version?: number;
  trust_mode?: string;
  execution_summary?: ExecutionSummary;
  inputs: {
    operations_requested: number;
    local_root: string;
    continue_on_error: boolean;
  };
  outputs: {
    operations_requested: number;
    operations_executed: number;
    outbound_actions: number;
    urgent_count: number;
    steps: LocalExecutionStepResult[];
    actions: LocalExecutionAction[];
    artifacts: LocalExecutionArtifact[];
    errors: Array<{
      tool: string;
      message: string;
      index: number;
      step_index?: number;
      step_number?: number;
      summary?: string;
    }>;
  };
  next_steps: string[];
};

export type PackResult = CustomerOpsResult | WeeklyContentResult | CompetitorBriefResult | SpreadsheetOpsResult | DocumentStudioResult | LocalExecutionResult;

export const OUTCOME_PACKS: OutcomePack[] = [
  {
    id: 'customer-ops-autopilot',
    label: 'Client Workflow Autopilot',
    description: 'Inbox triage + client follow-up + scheduling, with approval only for risky actions.',
    scope: ['Inbox triage', 'Lead follow-up', 'Booking coordination'],
    defaultGoal:
      'Run client workflow autopilot for this week: triage inbound requests, follow up warm leads, and move qualified contacts to scheduling.',
    goals: [
      { id: 'inbox', label: 'Inbox Triage', goal: 'Triage incoming customer messages and draft clear replies.' },
      { id: 'followup', label: 'Client Follow-up', goal: 'Follow up warm leads and move them to a confirmed next step.' },
      { id: 'booking', label: 'Scheduling Assistant', goal: 'Handle scheduling questions, propose slots, and confirm details.' },
    ],
    inputLabels: {
      primary: 'Inbox messages',
      secondary: 'Leads',
      tertiary: 'Booking slots',
    },
    inputPlaceholders: {
      primary: 'Need to reschedule my appointment\nI want a refund for last order',
      secondary: 'Maya | warm | asked for price\nOmar | hot | wants to book today',
      tertiary: 'Mon 10:00 AM\nTue 11:30 AM\nWed 3:00 PM',
    },
  },
  {
    id: 'weekly-content-studio',
    label: 'Weekly Content',
    description: 'Generate a channel-ready weekly content schedule with CTA briefs.',
    scope: ['Content schedule', 'Channel formatting', 'CTA recommendations'],
    defaultGoal:
      'Build next week content plan for my business with actionable post ideas and CTAs.',
    goals: [
      { id: 'plan', label: 'Build Weekly Plan', goal: 'Generate 7 post ideas for the upcoming week.' },
      { id: 'channels', label: 'Channel Mix', goal: 'Adapt content ideas for Instagram, Facebook, and email.' },
      { id: 'cta', label: 'Stronger CTAs', goal: 'Write post headlines and CTAs that drive bookings.' },
    ],
    inputLabels: {
      primary: 'Topics',
      secondary: 'Channels',
      tertiary: 'Offers / CTAs',
    },
    inputPlaceholders: {
      primary: 'Before/after transformations\nCustomer FAQ answers\nSeasonal tips',
      secondary: 'Instagram\nFacebook\nEmail',
      tertiary: 'Book this week for priority slots\nReply for a quick quote',
    },
  },
  {
    id: 'competitor-brief-digest',
    label: 'Competitor Brief Digest',
    description: 'Analyze competitors and produce practical response plays.',
    scope: ['Threat scoring', 'Play recommendations', 'Weekly brief'],
    defaultGoal:
      'Analyze key competitors and tell me the top actions to defend leads this week.',
    goals: [
      { id: 'scan', label: 'Scan Competitors', goal: 'Scan 3 competitors and summarize their strengths.' },
      { id: 'threat', label: 'Threat Ranking', goal: 'Rank competitors by threat and suggest immediate responses.' },
      { id: 'playbook', label: 'Response Plays', goal: 'Create simple response plays for each competitor.' },
    ],
    inputLabels: {
      primary: 'Competitors',
      secondary: 'Our positioning',
      tertiary: 'Objectives',
    },
    inputPlaceholders: {
      primary: 'Competitor A | strong reviews | discount pricing\nCompetitor B | heavy social ads | fast booking',
      secondary: 'Reliable service quality\nFast response\nClear pricing',
      tertiary: 'Increase qualified leads\nProtect margin',
    },
  },
  {
    id: 'spreadsheet-ops-v1',
    label: 'Spreadsheet Ops',
    description: 'Read, append, update, or create local or OneDrive CSV/XLSX files with approval-aware writes.',
    scope: ['CSV/XLSX read', 'OneDrive sync', 'Safe updates', 'Append/create rows'],
    defaultGoal:
      'Work with my spreadsheet safely: read a local or OneDrive file, then update or append rows only when approved.',
    goals: [
      { id: 'read', label: 'Read Sheet', goal: 'Read spreadsheet rows and summarize the current state.' },
      { id: 'append', label: 'Append Rows', goal: 'Append new rows into my spreadsheet file.' },
      { id: 'update', label: 'Update Row', goal: 'Update one existing row in my spreadsheet file.' },
    ],
    inputLabels: {
      primary: 'Spreadsheet path',
      secondary: 'Operation config',
      tertiary: 'Payload rows/values',
    },
    inputPlaceholders: {
      primary: 'data/customers.csv or onedrive:/Sales/customers.xlsx',
      secondary: '{"operation":"append","sheet_name":"Sheet1"}',
      tertiary: '[{"name":"Ali","phone":"+123","status":"warm"}]',
    },
  },
  {
    id: 'document-studio-v1',
    label: 'Document Studio',
    description: 'Create or update Word and PowerPoint files on local disk or OneDrive through one native document workflow.',
    scope: ['DOCX create/update', 'PPTX create/update', 'OneDrive sync', 'Structured outlines'],
    defaultGoal:
      'Create or update a Word document or PowerPoint deck safely, using a local path or a OneDrive path through Microsoft 365.',
    goals: [
      { id: 'docx', label: 'Write Word Doc', goal: 'Create a structured Word document from headings and body sections.' },
      { id: 'pptx', label: 'Build Deck', goal: 'Create a PowerPoint deck from slide titles and bullets.' },
      { id: 'update', label: 'Update File', goal: 'Append new sections or slides into an existing Word or PowerPoint file.' },
    ],
    inputLabels: {
      primary: 'Document path',
      secondary: 'Operation config',
      tertiary: 'Content outline',
    },
    inputPlaceholders: {
      primary: 'docs/q2-review.docx or onedrive:/Decks/board-update.pptx',
      secondary: '{"operation":"create","title":"Q2 Review"}',
      tertiary: '{"title":"Q2 Review","sections":[{"heading":"Summary","body":["Revenue up 18%","Hiring ahead of plan"]}]} or {"title":"Board Update","slides":[{"title":"Summary","bullets":["Revenue up 18%","Margins stable"]}]}',
    },
  },
  {
    id: 'local-execution-v1',
    label: 'Local Companion Tools',
    description: 'Run one local file, browser, screenshot, or shell task through the local companion with policy-aware gating.',
    scope: ['File operations', 'Browser page fetch', 'Screenshots', 'Shell allowlist'],
    defaultGoal:
      'Use the local companion to execute one controlled local task and return artifacts or previews.',
    goals: [
      { id: 'read', label: 'Read File', goal: 'Read a local text file and return a safe preview.' },
      { id: 'browser', label: 'Fetch Page', goal: 'Fetch a web page and extract text or links into local artifacts.' },
      { id: 'shot', label: 'Capture Screenshot', goal: 'Capture one local screenshot and return the artifact path.' },
      { id: 'shell', label: 'Run Shell Command', goal: 'Run one allowlisted shell command and return its transcript.' },
    ],
    inputLabels: {
      primary: 'Operation',
      secondary: 'Target',
      tertiary: 'Content / options',
    },
    inputPlaceholders: {
      primary: 'read_write_files',
      secondary: 'server.py',
      tertiary: 'Optional content or JSON options',
    },
  },
];

export const OUTCOME_CONTRACTS: Record<string, OutcomeContract> = {
  'customer-ops-autopilot': {
    inputs: ['Inbox messages', 'Lead list', 'Available booking slots'],
    actions: ['Triage messages', 'Draft follow-ups', 'Propose booking slots', 'Escalate risky outbound actions'],
    success: ['Urgent items flagged', 'Follow-ups drafted/sent', 'Qualified leads moved toward booking'],
  },
  'weekly-content-studio': {
    inputs: ['Topics', 'Preferred channels', 'Offers / CTA constraints'],
    actions: ['Build 7-day content plan', 'Adapt copy per channel', 'Generate CTA-ready post ideas'],
    success: ['Weekly plan produced', 'Content mapped by channel/day', 'Clear next publishing actions'],
  },
  'competitor-brief-digest': {
    inputs: ['Competitor list', 'Your positioning', 'Business objectives'],
    actions: ['Score threat level', 'Summarize competitor moves', 'Recommend response plays'],
    success: ['Top threats identified', 'Response plays generated', 'Prioritized next actions'],
  },
  'spreadsheet-ops-v1': {
    inputs: ['Spreadsheet path', 'Operation config', 'Rows/values payload'],
    actions: ['Read preview rows', 'Append rows', 'Update rows', 'Create local or OneDrive sheet files'],
    success: ['Requested operation completed', 'Preview returned', 'OneDrive sync supported', 'Write actions tracked for approval'],
  },
  'document-studio-v1': {
    inputs: ['Document path', 'Operation config', 'Content outline'],
    actions: ['Create Word document', 'Update Word document', 'Create PowerPoint deck', 'Sync local or OneDrive files'],
    success: ['Requested file created or updated', 'Preview titles returned', 'OneDrive sync supported', 'Structured actions tracked for approval'],
  },
  'local-execution-v1': {
    inputs: ['Local operation plan', 'Paths, commands, URLs, or screenshot targets', 'Optional file content or working directories'],
    actions: ['Read or write local files', 'Fetch or capture browser pages', 'Capture screenshots', 'Run allowlisted shell commands'],
    success: ['Operations executed locally', 'Artifacts recorded', 'Preview data returned', 'Approval gating enforced before risky execution'],
  },
};

export const DEFAULT_OUTCOME_PACK_ID = OUTCOME_PACKS[0].id;
export const DEFAULT_LOCAL_EXECUTION_OPERATION: LocalExecutionOperationDraft = {
  tool: 'read_write_files',
  fileMode: 'read',
  browserMode: 'extract_text',
  path: 'server.py',
  content: '',
  command: 'pwd',
  cwd: '',
  url: 'https://example.com',
  browserSessionProfile: '',
  browserActionScript: '',
  waitForSelector: '',
  clickSelector: '',
  typeSelector: '',
  typeText: '',
};
export const DEFAULT_LOCAL_EXECUTION_DRAFT: LocalExecutionDraft = {
  operations: [{ ...DEFAULT_LOCAL_EXECUTION_OPERATION }],
  activeOperationIndex: 0,
  continueOnError: false,
};

export const BUSINESS_PRESETS: BusinessPreset[] = [
  {
    id: "salon-bookings",
    label: "Universal Business",
    description: "Handle inbound requests, follow up warm contacts, and fill open schedule slots.",
    packId: "customer-ops-autopilot",
    goal:
      "Run client workflow autopilot for my business this week: triage inbound requests, follow up warm leads, and convert them into confirmed appointments.",
    inputs: {
      primary: "Can I book for Friday?\nNeed to reschedule my appointment\nDo you offer bundled services?",
      secondary: "Maya | warm | requested pricing\nNora | hot | asked for earliest availability",
      tertiary: "Mon 10:00 AM\nTue 11:30 AM\nWed 3:00 PM",
    },
  },
  {
    id: "dental-clinic",
    label: "Appointments Team",
    description: "Triage appointment inquiries and drive confirmations for open slots.",
    packId: "customer-ops-autopilot",
    goal:
      "Run client workflow autopilot for my appointments team: triage inbound requests, follow up qualified leads, and confirm bookings this week.",
    inputs: {
      primary: "I need an appointment this week\nCan you explain pricing options?\nI missed my last appointment",
      secondary: "Omar | hot | wants consultation\nLina | warm | asked for morning slot",
      tertiary: "Tue 9:00 AM\nThu 1:00 PM\nSat 10:30 AM",
    },
  },
  {
    id: "local-ecommerce",
    label: "Local E-commerce",
    description: "Plan weekly content and push high-intent customers toward checkout.",
    packId: "weekly-content-studio",
    goal:
      "Build next week content plan for my local store and include strong CTAs that convert views into orders.",
    inputs: {
      primary: "New arrivals\nBefore/after customer stories\nFAQ answers",
      secondary: "Instagram\nTikTok\nEmail",
      tertiary: "Order this week for free shipping\nReply for quick quote",
    },
  },
  {
    id: "agency-intel",
    label: "Agency Competitor Intel",
    description: "Track competitors and generate response plays for your team.",
    packId: "competitor-brief-digest",
    goal:
      "Analyze key competitors this week and produce practical response plays to protect leads and pricing.",
    inputs: {
      primary: "Competitor A | aggressive discounts\nCompetitor B | heavy social ads\nCompetitor C | fast support",
      secondary: "Premium quality\nFast response\nTransparent pricing",
      tertiary: "Protect margin\nIncrease qualified leads\nReduce churn",
    },
  },
  {
    id: "spreadsheet-ops",
    label: "Spreadsheet Operations",
    description: "Read and update local CSV/XLSX files with controlled write actions.",
    packId: "spreadsheet-ops-v1",
    goal:
      "Review my spreadsheet and apply safe updates or appends with approval.",
    inputs: {
      primary: "data/customers.csv",
      secondary: "{\"operation\":\"read\",\"sheet_name\":\"Sheet1\",\"row_limit\":30}",
      tertiary: "[]",
    },
  },
];

export const DEFAULT_BUSINESS_PRESET_ID = BUSINESS_PRESETS[0].id;

export const DEFAULT_OPENAI_CODEX_MODELS = [
  'gpt-5.4',
  'gpt-5.3-codex',
  'gpt-5.3-codex-spark',
  'gpt-5.2',
  'gpt-5.2-codex',
  'gpt-5.1-codex',
] as const;

export const DEFAULT_PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: DEFAULT_OPENAI_CODEX_MODELS[0],
    auth: ['api_key', 'access_token', 'oauth_token'],
    defaultAuthMode: 'api_key',
    authModes: [
      { id: 'api_key', label: 'API Key', secretRequired: true },
      { id: 'access_token', label: 'OpenAI access token', secretRequired: true },
      { id: 'oauth_token', label: 'Saved OpenAI / Codex token', secretRequired: true },
    ],
    note: 'Use a direct OpenAI credential, or sign in with ChatGPT in your browser on the connect page and import the local session from this Mac.',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-sonnet',
    auth: ['api_key', 'local_cli'],
    defaultAuthMode: 'api_key',
    authModes: [
      { id: 'api_key', label: 'API Key', secretRequired: true },
      { id: 'local_cli', label: 'Claude Subscription', secretRequired: false },
    ],
    note: 'Use a direct Anthropic API key or the Claude subscription already signed into the local CLI on this machine.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-flash',
    auth: ['api_key'],
    defaultAuthMode: 'api_key',
    authModes: [{ id: 'api_key', label: 'API Key', secretRequired: true }],
    note: 'Direct Gemini API key only.',
  },
  {
    id: 'vertex',
    label: 'Google Vertex AI',
    defaultModel: 'vertex-gemini-flash',
    auth: ['access_token', 'project_id', 'location'],
    defaultAuthMode: 'access_token',
    authModes: [{ id: 'access_token', label: 'Access Token', secretRequired: true }],
    note: 'Direct Vertex AI access token with project and region.',
  },
  {
    id: 'qwen',
    label: 'Qwen',
    defaultModel: 'qwen-turbo',
    auth: ['api_key'],
    defaultAuthMode: 'api_key',
    authModes: [{ id: 'api_key', label: 'API Key', secretRequired: true }],
    note: 'Direct Qwen API key using Alibaba DashScope.',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    auth: ['api_key'],
    defaultAuthMode: 'api_key',
    authModes: [{ id: 'api_key', label: 'API Key', secretRequired: true }],
    note: 'Direct DeepSeek API key.',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    defaultModel: 'mistral-small-latest',
    auth: ['api_key'],
    defaultAuthMode: 'api_key',
    authModes: [{ id: 'api_key', label: 'API Key', secretRequired: true }],
    note: 'Direct Mistral API key.',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    defaultModel: 'llama3',
    auth: ['none'],
    defaultAuthMode: 'none',
    authModes: [{ id: 'none', label: 'No auth required', secretRequired: false }],
    note: 'Use a local Ollama server running on this machine.',
  },
];

export const DEFAULT_PROVIDER_MODELS: Record<ProviderId, string[]> = {
  openai: [...DEFAULT_OPENAI_CODEX_MODELS],
  anthropic: ['claude-sonnet', 'claude-haiku'],
  claude_code_cli: ['sonnet', 'opus'],
  gemini: ['gemini-flash', 'gemini-pro'],
  vertex: ['vertex-gemini-flash'],
  qwen: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  mistral: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest'],
  ollama: ['llama3', 'mistral', 'gemma', 'phi3'],
};

export const DEFAULT_MODEL_ALIAS_OPTIONS: ModelAliasOption[] = [
  {
    alias: 'gpt-5.4',
    provider: 'openai',
    model: 'gpt-5.4',
    resolvedModel: 'gpt-5.4',
    isGlobalDefault: true,
    isProviderDefault: true,
  },
  {
    alias: 'gpt-5.3-codex',
    provider: 'openai',
    model: 'gpt-5.3-codex',
    resolvedModel: 'gpt-5.3-codex',
    isGlobalDefault: false,
    isProviderDefault: false,
  },
  {
    alias: 'gpt-5.3-codex-spark',
    provider: 'openai',
    model: 'gpt-5.3-codex-spark',
    resolvedModel: 'gpt-5.3-codex-spark',
    isGlobalDefault: false,
    isProviderDefault: false,
  },
  {
    alias: 'gpt-5.2',
    provider: 'openai',
    model: 'gpt-5.2',
    resolvedModel: 'gpt-5.2',
    isGlobalDefault: false,
    isProviderDefault: false,
  },
  {
    alias: 'gpt-5.2-codex',
    provider: 'openai',
    model: 'gpt-5.2-codex',
    resolvedModel: 'gpt-5.2-codex',
    isGlobalDefault: false,
    isProviderDefault: false,
  },
  {
    alias: 'gpt-5.1-codex',
    provider: 'openai',
    model: 'gpt-5.1-codex',
    resolvedModel: 'gpt-5.1-codex',
    isGlobalDefault: false,
    isProviderDefault: false,
  },
  {
    alias: 'gpt-4.1',
    provider: 'openai',
    model: 'gpt-4.1',
    resolvedModel: 'gpt-4.1',
    isGlobalDefault: false,
    isProviderDefault: false,
  },
  {
    alias: 'gpt-4o',
    provider: 'openai',
    model: 'gpt-4o',
    resolvedModel: 'gpt-4o',
    isGlobalDefault: false,
    isProviderDefault: false,
  },
  {
    alias: 'gpt-4o-mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    resolvedModel: 'gpt-4o-mini',
    isGlobalDefault: false,
    isProviderDefault: false,
  },
  {
    alias: 'gpt-4.1-mini',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    resolvedModel: 'gpt-4.1-mini',
    isGlobalDefault: false,
    isProviderDefault: false,
  },
  {
    alias: 'claude-sonnet',
    provider: 'anthropic',
    model: 'anthropic/claude-3-5-sonnet-20241022',
    resolvedModel: 'anthropic/claude-3-5-sonnet-20241022',
    isGlobalDefault: false,
    isProviderDefault: true,
  },
  {
    alias: 'claude-haiku',
    provider: 'anthropic',
    model: 'anthropic/claude-3-haiku-20240307',
    resolvedModel: 'anthropic/claude-3-haiku-20240307',
    isGlobalDefault: false,
    isProviderDefault: false,
  },
  {
    alias: 'gemini-flash',
    provider: 'gemini',
    model: 'gemini/gemini-2.0-flash',
    resolvedModel: 'gemini/gemini-2.0-flash',
    isGlobalDefault: false,
    isProviderDefault: true,
  },
  {
    alias: 'gemini-pro',
    provider: 'gemini',
    model: 'gemini/gemini-1.5-pro',
    resolvedModel: 'gemini/gemini-1.5-pro',
    isGlobalDefault: false,
    isProviderDefault: false,
  },
  {
    alias: 'vertex-gemini-flash',
    provider: 'vertex',
    model: 'vertex_ai/gemini-2.0-flash-001',
    resolvedModel: 'vertex_ai/gemini-2.0-flash-001',
    isGlobalDefault: false,
    isProviderDefault: true,
  },
  {
    alias: 'qwen-turbo',
    provider: 'qwen',
    model: 'qwen-turbo',
    resolvedModel: 'qwen-turbo',
    isGlobalDefault: false,
    isProviderDefault: true,
  },
  {
    alias: 'qwen-plus',
    provider: 'qwen',
    model: 'qwen-plus',
    resolvedModel: 'qwen-plus',
    isGlobalDefault: false,
    isProviderDefault: false,
  },
  {
    alias: 'qwen-max',
    provider: 'qwen',
    model: 'qwen-max',
    resolvedModel: 'qwen-max',
    isGlobalDefault: false,
    isProviderDefault: false,
  },
  {
    alias: 'deepseek-chat',
    provider: 'deepseek',
    model: 'deepseek-chat',
    resolvedModel: 'deepseek-chat',
    isGlobalDefault: false,
    isProviderDefault: true,
  },
  {
    alias: 'deepseek-reasoner',
    provider: 'deepseek',
    model: 'deepseek-reasoner',
    resolvedModel: 'deepseek-reasoner',
    isGlobalDefault: false,
    isProviderDefault: false,
  },
  {
    alias: 'mistral-small-latest',
    provider: 'mistral',
    model: 'mistral-small-latest',
    resolvedModel: 'mistral-small-latest',
    isGlobalDefault: false,
    isProviderDefault: true,
  },
  {
    alias: 'mistral-medium-latest',
    provider: 'mistral',
    model: 'mistral-medium-latest',
    resolvedModel: 'mistral-medium-latest',
    isGlobalDefault: false,
    isProviderDefault: false,
  },
  {
    alias: 'mistral-large-latest',
    provider: 'mistral',
    model: 'mistral-large-latest',
    resolvedModel: 'mistral-large-latest',
    isGlobalDefault: false,
    isProviderDefault: false,
  },
  {
    alias: 'llama3',
    provider: 'ollama',
    model: 'llama3',
    resolvedModel: 'llama3',
    isGlobalDefault: false,
    isProviderDefault: true,
  },
  {
    alias: 'mistral',
    provider: 'ollama',
    model: 'mistral',
    resolvedModel: 'mistral',
    isGlobalDefault: false,
    isProviderDefault: false,
  },
  {
    alias: 'gemma',
    provider: 'ollama',
    model: 'gemma',
    resolvedModel: 'gemma',
    isGlobalDefault: false,
    isProviderDefault: false,
  },
  {
    alias: 'phi3',
    provider: 'ollama',
    model: 'phi3',
    resolvedModel: 'phi3',
    isGlobalDefault: false,
    isProviderDefault: false,
  },
];

export const DEFAULT_PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: 'My OpenAI Key',
  anthropic: 'My Anthropic Key',
  claude_code_cli: 'My Claude Subscription',
  gemini: 'My Gemini Key',
  vertex: 'My Vertex Key',
  qwen: 'My Qwen Key',
  deepseek: 'My DeepSeek Key',
  mistral: 'My Mistral Key',
  ollama: 'My Ollama Server',
};

export function normalizeProviderId(value: unknown): ProviderId {
  if (value === 'claude_code_cli') return 'anthropic';
  return isProviderId(String(value || '').trim()) ? (value as ProviderId) : 'openai';
}

function normalizeModelToken(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed.includes('/') ? trimmed.split('/').pop() || trimmed : trimmed;
}

function aliasesForProvider(provider: ProviderId, aliases: ModelAliasOption[]): ModelAliasOption[] {
  const normalized = normalizeProviderId(provider);
  return aliases
    .filter((item) => normalizeProviderId(item.provider) === normalized)
    .sort((left, right) => {
      if (left.isProviderDefault !== right.isProviderDefault) return left.isProviderDefault ? -1 : 1;
      if (left.isGlobalDefault !== right.isGlobalDefault) return left.isGlobalDefault ? -1 : 1;
      return left.alias.localeCompare(right.alias);
    });
}

export function resolveModelAlias(
  provider: ProviderId,
  model: string,
  aliases: ModelAliasOption[] = DEFAULT_MODEL_ALIAS_OPTIONS,
): string | null {
  const normalizedModel = normalizeModelToken(model);
  if (!normalizedModel) return null;
  const match = aliasesForProvider(provider, aliases).find((item) => {
    return [item.alias, item.model, item.resolvedModel]
      .map((value) => normalizeModelToken(value))
      .includes(normalizedModel);
  });
  return match?.alias ?? null;
}

export function mapModelOptionsToAliases(
  provider: ProviderId,
  rawModels: string[],
  aliases: ModelAliasOption[] = DEFAULT_MODEL_ALIAS_OPTIONS,
): string[] {
  const providerAliases = aliasesForProvider(provider, aliases);
  if (rawModels.length === 0) {
    return providerAliases.map((item) => item.alias);
  }

  const normalizedRaw = new Set(rawModels.map((item) => normalizeModelToken(item)).filter(Boolean));
  const matchedAliases = providerAliases
    .filter((item) =>
      [item.alias, item.model, item.resolvedModel]
        .map((value) => normalizeModelToken(value))
        .some((value) => normalizedRaw.has(value)),
    );
  const representedRaw = new Set(
    matchedAliases
      .flatMap((item) => [item.alias, item.model, item.resolvedModel])
      .map((item) => normalizeModelToken(item))
      .filter(Boolean),
  );
  const unmatchedRaw = rawModels.filter((item) => !representedRaw.has(normalizeModelToken(item)));
  return Array.from(new Set([...matchedAliases.map((item) => item.alias), ...unmatchedRaw]));
}

export function getProviderAuthModes(option: ProviderOption | null | undefined): { id: string; label: string; secretRequired?: boolean }[] {
  if (option?.authModes && option.authModes.length > 0) return option.authModes;
  return (option?.auth || []).map((id) => ({ id, label: id, secretRequired: id !== 'local_cli' }));
}

export const DEFAULT_CONNECTOR_OPTIONS: ConnectorOption[] = [
  { id: 'google_workspace', label: 'Google Workspace', note: 'Gmail + Calendar actions' },
  { id: 'microsoft_365', label: 'Microsoft 365', note: 'Outlook + Graph-backed docs and files' },
  { id: 'telegram_bot', label: 'Telegram Bot', note: 'Bot token + chat delivery' },
  { id: 'wechat_work', label: 'WeChat Work', note: 'Webhook alert delivery' },
  { id: 'whatsapp_twilio', label: 'WhatsApp (Twilio)', note: 'Twilio WhatsApp messaging' },
  { id: 'discord_bot', label: 'Discord Bot', note: 'Bot token + channel routing' },
  { id: 'instagram_business', label: 'Instagram Business', note: 'Business token + account routing' },
];

export const DEFAULT_CONNECTOR_LABELS: Record<ConnectorId, string> = {
  google_workspace: 'My Google Workspace',
  microsoft_365: 'My Microsoft 365',
  telegram_bot: 'My Telegram Bot',
  wechat_work: 'My WeChat Work',
  whatsapp_twilio: 'My WhatsApp Twilio',
  discord_bot: 'My Discord Bot',
  instagram_business: 'My Instagram Business',
};

export const CONNECTOR_CATALOG: ConnectorCatalogSection[] = [
  {
    id: 'native_now',
    title: 'Available now',
    description: 'Built into the current runtime with create, test, pause, and remove support.',
    items: [
      {
        id: 'google_workspace',
        label: 'Google Workspace',
        note: 'Gmail + Calendar actions',
        detail: 'Best for inbox triage, scheduling, and workflow execution.',
        status: 'native_now',
        connector: 'google_workspace',
      },
      {
        id: 'telegram_bot',
        label: 'Telegram Bot',
        note: 'Bot token + chat delivery',
        detail: 'Useful for alerts, approvals, and direct assistant delivery.',
        status: 'native_now',
        connector: 'telegram_bot',
      },
      {
        id: 'wechat_work',
        label: 'WeChat Work',
        note: 'Webhook alert delivery',
        detail: 'Useful for operational alerts and live notifications inside WeChat Work.',
        status: 'native_now',
        connector: 'wechat_work',
      },
      {
        id: 'whatsapp_twilio',
        label: 'WhatsApp (Twilio)',
        note: 'Twilio WhatsApp messaging',
        detail: 'Best for operational messaging when you already run on Twilio.',
        status: 'native_now',
        connector: 'whatsapp_twilio',
      },
      {
        id: 'discord',
        label: 'Discord',
        note: 'Bot token + channel routing',
        detail: 'Good for approvals, community operations, and shared channel-based workflows.',
        status: 'native_now',
        connector: 'discord_bot',
      },
      {
        id: 'instagram_business',
        label: 'Instagram Business',
        note: 'Business token + account routing',
        detail: 'Connect business accounts now, then deepen publishing and inbox workflows as usage grows.',
        status: 'native_now',
        connector: 'instagram_business',
      },
    ],
  },
  {
    id: 'provider_next',
    title: 'Provider-backed next',
    description: 'Fastest expansion path: ship through a connector platform first, then deepen the native UX later.',
    items: [
      {
        id: 'microsoft_365',
        label: 'Microsoft 365',
        note: 'Outlook, Excel, Word, PowerPoint, OneDrive',
        detail: 'Best for Microsoft-first teams that need email, docs, spreadsheets, decks, and file workflows through Microsoft Graph before a deeper native layer exists.',
        status: 'provider_next',
        connector: 'microsoft_365',
      },
      {
        id: 'x_twitter',
        label: 'X / Twitter',
        note: 'Posts, replies, listening',
        detail: 'Useful for publishing and social-response workflows before building your own deep native layer.',
        status: 'provider_next',
      },
      {
        id: 'youtube',
        label: 'YouTube',
        note: 'Channel monitoring + publishing workflows',
        detail: 'Good for new-video triggers, comment workflows, and publishing support.',
        status: 'provider_next',
      },
    ],
  },
  {
    id: 'custom_build',
    title: 'Custom build',
    description: 'Keep these visible in the product, but be honest that they need custom auth, policy work, or deeper API handling.',
    items: [
      {
        id: 'tiktok_business',
        label: 'TikTok Business',
        note: 'Publishing + campaign workflows',
        detail: 'Worth planning, but ship it as a deliberate business integration instead of pretending it is one click away.',
        status: 'custom_build',
      },
      {
        id: 'custom_api',
        label: 'Custom API / Webhook',
        note: 'Any partner or internal platform',
        detail: 'Critical escape hatch for companies with niche platforms or internal tools.',
        status: 'custom_build',
      },
    ],
  },
];

export const PRIORITY_LAUNCH_CONNECTORS: ConnectorLaunchPlan[] = [
  {
    id: 'discord-launch',
    label: 'Discord',
    audience: 'Communities, approvals, support rooms',
    bestFor: 'Route messages, request approvals in-channel, and let agents coordinate in one shared operating room.',
    path: 'Connect it now for channel routing and access, then deepen native moderation and workflow actions only if Discord becomes a core operating surface.',
    connectorCatalogId: 'discord',
  },
  {
    id: 'instagram-launch',
    label: 'Instagram Business',
    audience: 'Brand publishing and response workflows',
    bestFor: 'Create a clean business-only path for publishing, content ops, and inbox workflows tied to professional accounts.',
    path: 'Connect business accounts now, then layer publishing, response, and review workflows on top once your account model is stable.',
    connectorCatalogId: 'instagram_business',
  },
];

export function isProviderId(value: string): value is ProviderId {
  return value === 'openai'
    || value === 'anthropic'
    || value === 'claude_code_cli'
    || value === 'gemini'
    || value === 'vertex'
    || value === 'qwen'
    || value === 'deepseek'
    || value === 'mistral'
    || value === 'ollama';
}

export function isConnectorId(value: string): value is ConnectorId {
  return (
    value === 'google_workspace'
    || value === 'microsoft_365'
    || value === 'telegram_bot'
    || value === 'wechat_work'
    || value === 'whatsapp_twilio'
    || value === 'discord_bot'
    || value === 'instagram_business'
  );
}

export const WORKSPACE_ID = 'default';
export const SETUP_STORAGE_KEY = `empyralis_setup_state_${WORKSPACE_ID}`;
export const LEGACY_SETUP_STORAGE_KEY = `orion_setup_state_${WORKSPACE_ID}`;
export const SETUP_STORAGE_KEYS = [SETUP_STORAGE_KEY, LEGACY_SETUP_STORAGE_KEY] as const;

export const RUNTIME_KEY_STORAGE_KEY = 'empyralis_runtime_api_key';
export const LEGACY_RUNTIME_KEY_STORAGE_KEY = 'orion_runtime_api_key';
export const RUNTIME_KEY_STORAGE_KEYS = [RUNTIME_KEY_STORAGE_KEY, LEGACY_RUNTIME_KEY_STORAGE_KEY] as const;

export const SETUP_SESSION_ID_STORAGE_KEY = `empyralis_setup_session_id_${WORKSPACE_ID}`;
export const LEGACY_SETUP_SESSION_ID_STORAGE_KEY = `orion_setup_session_id_${WORKSPACE_ID}`;
export const SETUP_SESSION_ID_STORAGE_KEYS = [
  SETUP_SESSION_ID_STORAGE_KEY,
  LEGACY_SETUP_SESSION_ID_STORAGE_KEY,
] as const;

export function fmtTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString([], { hour12: false });
}

export function parseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

export function normalizeTrustMode(raw: string | undefined | null): TrustMode {
  const value = (raw || '').trim().toLowerCase();
  if (value === 'auto') return 'auto';
  if (value === 'cost_guard' || value === 'cost') return 'cost_guard';
  if (value === 'sensitive_guard' || value === 'sensitive') return 'sensitive_guard';
  if (value === 'strict' || value === 'review') return 'strict';
  return 'guarded';
}

export function normalizeConnectionMode(raw: string | undefined | null): ConnectionMode {
  const value = (raw || '').trim().toLowerCase();
  if (value === 'byok') return 'byok';
  if (value === 'local_companion' || value === 'local') return 'local_companion';
  return 'managed';
}

export function executionTargetFromConnectionMode(mode: ConnectionMode): ExecutionTarget {
  if (mode === 'local_companion') return 'local_companion';
  return 'cloud';
}

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '--';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}
