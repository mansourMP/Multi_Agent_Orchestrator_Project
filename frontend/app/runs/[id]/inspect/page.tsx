'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ClipboardCheck,
  Eye,
  FileSearch,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Route,
} from 'lucide-react';
import { AGENT_ROLE_OPTIONS, isAgentRoleId } from '@/app/page.catalog';
import {
  AUTH_STREAM_CLOSED,
  openAuthenticatedEventStream,
  type AuthenticatedEventStreamConnection,
} from '@/lib/authenticatedEventStream';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { API_BASE } from '@/lib/config';
import { formatExecutionTargetLabel } from '@/lib/executionTargets';
import { fetchRuntimeArtifactBlob } from '@/lib/runtimeArtifacts';
import { readRuntimeApiKeyFromStorage } from '@/lib/runtimeKey';
import { resolveSkillsByIds } from '@/lib/skills';
import { SINGLE_AGENT_MODE } from '@/lib/appFlags';
import { getLocalExecutionCapabilityTitle } from '@/lib/localExecutionCapabilities';

const ORION_API_URL = API_BASE;

type HistoryItem = {
  run_id: string;
  status?: string;
  created_at?: string;
  completed_at?: string;
  duration_ms?: number;
  time_to_first_value_ms?: number;
  hitl_wait_total_ms?: number;
  result_summary?: string | null;
  execution_target_requested?: string | null;
  execution_target_selected?: string | null;
  execution_target_reason?: string | null;
  execution_target_fallback?: string | null;
  usage_provider?: string | null;
  usage_model?: string | null;
  usage_total_tokens_est?: number | null;
  usage_cost_band?: string | null;
  agent_role?: string | null;
  agent_role_source?: string | null;
  parent_run_id?: string | null;
  delegation_root_run_id?: string | null;
  delegated_by_run_id?: string | null;
  delegated_by_role?: string | null;
  delegation_note?: string | null;
  retry_of_run_id?: string | null;
  retry_root_run_id?: string | null;
  retry_sequence?: number | null;
  connector_binding?: {
    channel?: string | null;
    connector?: string | null;
    label?: string | null;
    identity_label?: string | null;
    routing_scope?: string | null;
  } | null;
};

type RelatedRunSummary = {
  run_id?: string | null;
  status?: string | null;
  agent_role?: string | null;
  agent_role_source?: string | null;
  agent_label?: string | null;
  user_goal?: string | null;
  result_summary?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
  parent_run_id?: string | null;
  delegation_root_run_id?: string | null;
  delegated_by_run_id?: string | null;
  delegated_by_role?: string | null;
  delegation_note?: string | null;
  retry_of_run_id?: string | null;
  retry_root_run_id?: string | null;
  retry_sequence?: number | null;
};

type ReplayEvent = {
  event_id?: string;
  seq?: number;
  run_id?: string;
  ts?: string;
  level?: string;
  event?: string;
  message?: string;
  data?: unknown;
};

type ReplayPayload = {
  item?: {
    run_id?: string;
    status?: string;
    events?: ReplayEvent[];
    result_data?: unknown;
    usage_masked?: Record<string, unknown>;
    context?: Record<string, unknown>;
  };
};

type RunDetailPayload = {
  run_id?: string;
  status?: string;
  context?: {
    user_goal?: string;
    workspace_id?: string;
    metadata?: Record<string, unknown>;
  };
  pending_approval?: {
    approval_id?: string;
    prompt?: string;
    status?: string;
    expires_at?: string;
    metadata?: {
      approval_labels?: string[];
      approval_capabilities?: string[];
    } | null;
  } | null;
  result_data?: unknown;
  tool_policy_precheck?: {
    capability_ids?: string[];
    capabilities?: Array<{
      id?: string;
      title?: string;
      tool_id?: string;
      platform_supported?: boolean;
    }>;
    browser_automation_policy?: {
      profile?: string;
      interactive_actions?: string[];
      privileged_actions?: string[];
      requires_approval?: boolean;
      reason?: string;
    };
    skill_contract?: {
      declared_runtime_tools?: string[];
      undeclared_tools?: string[];
      preferred_targets?: string[];
      preferred_trust_modes?: string[];
      policy_mode?: string;
      target_conflict?: boolean;
      trust_conflict?: boolean;
    };
  } | null;
  agent_role?: string | null;
  agent_role_source?: string | null;
  parent_run_id?: string | null;
  delegation_root_run_id?: string | null;
  delegated_by_run_id?: string | null;
  delegated_by_role?: string | null;
  delegation_note?: string | null;
  parent_run?: RelatedRunSummary | null;
  child_runs?: RelatedRunSummary[];
  delegation_summary?: {
    ready?: boolean;
    overall_status?: string | null;
    total_children?: number;
    effective_children?: number;
    terminal_children?: number;
    completed_children?: number;
    failed_children?: number;
    waiting_children?: number;
    active_children?: number;
    child_roles?: string[];
    summary_text?: string | null;
    next_action?: string | null;
    failed_run_ids?: string[];
    retryable_failed_children?: number;
    ready_for_merge?: boolean;
  } | null;
  connector_binding?: {
    channel?: string | null;
    connector?: string | null;
    label?: string | null;
    identity_label?: string | null;
    routing_scope?: string | null;
  } | null;
};

type DesktopBridge = {
  openExternal?: (target: string) => Promise<boolean | string>;
  openPath?: (target: string) => Promise<boolean | string>;
  revealPath?: (target: string) => Promise<boolean | string>;
  platform?: string;
  desktop?: boolean;
};

type ApprovalAuditItem = {
  id: string;
  ts: string;
  stage: string;
  decision: string;
  actor: string;
  source: string;
  run_id: string | null;
  note: string | null;
  labels: string[];
  capabilities: string[];
};

type TimelineEvent = {
  id: string;
  ts: string;
  seq: number | null;
  level: string;
  event: string;
  message: string;
  toolHint: string | null;
};

type LocalExecutionStepView = {
  step_index: number;
  step_number: number;
  tool: string;
  summary: string;
  status: string;
  artifact_file_path?: string;
  message?: string;
  session_profile?: string;
  browser_security_profile?: string;
};

type StreamState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'closed';
const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'error', 'stopped', 'timeout', 'cancelled']);
type InspectFocusTarget = 'timeline' | 'logs' | 'approvals' | 'screenshots' | 'artifacts' | null;
type InspectSectionTarget = Exclude<InspectFocusTarget, null>;

function compactText(value: string | null | undefined, fallback = '--', maxLength = 180): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function capabilityLabel(value: string | null | undefined): string {
  return getLocalExecutionCapabilityTitle(value);
}

function capabilityLabels(values: Array<string | null | undefined> | null | undefined): string[] {
  const seen = new Set<string>();
  return (values || [])
    .map((value) => capabilityLabel(value))
    .filter((value) => {
      const clean = String(value || '').trim();
      if (!clean || seen.has(clean)) return false;
      seen.add(clean);
      return true;
    });
}

function approvalDisplayText(
  prompt: string | null | undefined,
  labels: Array<string | null | undefined> | null | undefined,
  capabilities: Array<string | null | undefined> | null | undefined,
  fallback = 'Approval required to continue.',
): string {
  const explicitLabels = (labels || []).map((value) => String(value || '').trim()).filter(Boolean);
  if (explicitLabels.length > 0) return explicitLabels.join(', ');
  const capabilityTitles = capabilityLabels(capabilities);
  if (capabilityTitles.length > 0) return capabilityTitles.join(', ');
  return compactText(prompt, fallback, 220);
}

function fmtTime(value?: string): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString();
}

function fmtMs(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function statusColor(status?: string): string {
  const value = String(status || '').toLowerCase();
  if (value === 'completed' || value === 'success') return 'var(--success-fg)';
  if (value === 'running' || value === 'starting') return '#93c5fd';
  if (value === 'waiting' || value === 'waiting_for_input') return 'var(--warning-fg)';
  if (value === 'failed' || value === 'error' || value === 'timeout') return 'var(--error-fg)';
  return 'var(--text-secondary)';
}

function localExecutionStepTone(status?: string): { color: string; label: string; background: string; border: string } {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'completed' || value === 'success') {
    return { color: 'var(--success-fg)', label: 'Completed', background: 'var(--success-bg)', border: 'var(--success-border)' };
  }
  if (value === 'failed' || value === 'error') {
    return { color: 'var(--error-fg)', label: 'Failed', background: 'var(--error-bg)', border: 'var(--error-border)' };
  }
  return { color: 'var(--text-tertiary)', label: value || '--', background: 'var(--bg-element)', border: 'var(--border-default)' };
}

function normalizeInspectFocus(value: string | null): InspectFocusTarget {
  if (value === 'timeline' || value === 'logs' || value === 'approvals' || value === 'screenshots' || value === 'artifacts') {
    return value;
  }
  return null;
}

function formatInspectStatusLabel(value?: string | null): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Unknown';
  return normalized.replace(/_/g, ' ');
}

function formatApprovalDecisionLabel(value?: string | null): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Decision recorded';
  if (normalized === 'approved' || normalized === 'allow' || normalized === 'proceed') return 'Approved';
  if (normalized === 'hold' || normalized === 'blocked' || normalized === 'denied' || normalized === 'reject') return 'Held';
  return normalized.replace(/_/g, ' ');
}

function classifyArtifactForInspect(path: string): 'deliverable' | 'evidence' | 'system' {
  const normalized = String(path || '').trim().toLowerCase();
  if (!normalized) return 'system';
  if (/screenshot|capture|proof|evidence|\.png$|\.jpg$|\.jpeg$|\.webp$|\.gif$/i.test(normalized)) return 'evidence';
  if (/\.(docx|pptx|xlsx|csv|pdf|md|txt|json|html)$/i.test(normalized) || /^https?:\/\//i.test(normalized)) return 'deliverable';
  return 'system';
}

function formatArtifactLabel(path: string): string {
  const normalized = String(path || '').trim();
  if (!normalized) return '--';
  const cleaned = normalized.split('/').filter(Boolean).pop() || normalized;
  return cleaned;
}

function formatAgentRoleLabel(value?: string | null): string {
  const roleId = String(value || '').trim();
  if (!isAgentRoleId(roleId)) return '--';
  return AGENT_ROLE_OPTIONS.find((item) => item.id === roleId)?.label || roleId;
}

function formatConnectorBindingLabel(binding?: {
  channel?: string | null;
  connector?: string | null;
  label?: string | null;
  identity_label?: string | null;
  routing_scope?: string | null;
} | null): string {
  if (!binding) return '--';
  const channel = String(binding.channel || '').trim();
  const identity = String(binding.identity_label || binding.label || '').trim();
  const scope = String(binding.routing_scope || '').trim();
  const parts = [channel, identity, scope].filter(Boolean);
  return parts.length ? parts.join(' · ') : '--';
}

function isHttpTarget(value?: string | null): boolean {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function isLocalFileTarget(value?: string | null): boolean {
  const normalized = String(value || '').trim();
  if (!normalized || isHttpTarget(normalized)) return false;
  if (normalized.startsWith('/') || /^[A-Za-z]:[\\/]/.test(normalized)) return true;
  if (normalized.startsWith('./') || normalized.startsWith('../') || normalized.startsWith('.orion-artifacts/')) return true;
  return !/^[a-z]+:/i.test(normalized);
}

function ArtifactImagePreview({ path, runtimeKey, alt }: { path: string; runtimeKey: string; alt: string }) {
  const [objectUrl, setObjectUrl] = useState('');

  useEffect(() => {
    const normalized = String(path || '').trim();
    if (!normalized) {
      setObjectUrl('');
      return;
    }
    if (isHttpTarget(normalized)) {
      setObjectUrl(normalized);
      return;
    }
    let active = true;
    let nextObjectUrl = '';
    setObjectUrl('');
    void fetchRuntimeArtifactBlob(ORION_API_URL, normalized, runtimeKey)
      .then((blob) => {
        nextObjectUrl = URL.createObjectURL(blob);
        if (active) setObjectUrl(nextObjectUrl);
        else URL.revokeObjectURL(nextObjectUrl);
      })
      .catch(() => {
        if (active) setObjectUrl('');
      });
    return () => {
      active = false;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [path, runtimeKey]);

  if (!objectUrl) {
    return (
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          width: '100%',
          height: '100%',
          color: 'var(--text-secondary)',
          fontSize: 12,
        }}
      >
        Preview unavailable
      </div>
    );
  }

  return (
    <img
      src={objectUrl}
      alt={alt}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  );
}

function extractRunMetadata(
  runDetail: RunDetailPayload | null,
  replayItem: ReplayPayload['item'] | null,
): Record<string, unknown> | null {
  const detailMeta = runDetail?.context?.metadata;
  if (detailMeta && typeof detailMeta === 'object') return detailMeta;
  const replayContext = replayItem?.context;
  if (replayContext && typeof replayContext === 'object') {
    const nestedMeta = (replayContext as Record<string, unknown>).metadata;
    if (nestedMeta && typeof nestedMeta === 'object') return nestedMeta as Record<string, unknown>;
  }
  return null;
}

function extractSkillSummary(metadata: Record<string, unknown> | null): { scope: string | null; labels: string[] } {
  if (!metadata) return { scope: null, labels: [] };
  const scope = typeof metadata.skill_scope === 'string' && metadata.skill_scope.trim() ? metadata.skill_scope.trim() : null;
  const bundle = metadata.skill_bundle && typeof metadata.skill_bundle === 'object'
    ? (metadata.skill_bundle as Record<string, unknown>)
    : null;
  const explicitSkills = Array.isArray(bundle?.skills)
    ? bundle.skills
        .map((item) => {
          if (!item || typeof item !== 'object') return '';
          const title = (item as Record<string, unknown>).title;
          return typeof title === 'string' ? title.trim() : '';
        })
        .filter(Boolean)
    : [];
  if (explicitSkills.length > 0) {
    return { scope, labels: explicitSkills };
  }
  const ids = Array.isArray(bundle?.skill_ids)
    ? bundle.skill_ids.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const resolved = resolveSkillsByIds(ids);
  return {
    scope,
    labels: resolved.skills.map((skill) => skill.title),
  };
}

function summarizeToolHint(data: unknown, event: string): string | null {
  const lower = event.toLowerCase();
  if (lower.includes('tool')) return 'tool event';
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const candidates = [
    record.tool,
    record.tool_name,
    record.toolId,
    record.action,
    record.node_id,
    record.nodeId,
  ];
  for (const value of candidates) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return null;
}

function collectArtifactStrings(input: unknown, out: Set<string>, depth = 0): void {
  if (depth > 7 || input == null) return;
  if (typeof input === 'string') {
    const value = input.trim();
    if (!value) return;
    const looksLikeUrl = /^https?:\/\//i.test(value);
    const looksLikePath = /\/.+\.(png|jpg|jpeg|webp|gif|pdf|json|csv|txt)$/i.test(value);
    const looksLikeNamedAsset = /(screenshot|artifact|evidence|report|output)/i.test(value);
    if (looksLikeUrl || looksLikePath || looksLikeNamedAsset) out.add(value);
    return;
  }
  if (Array.isArray(input)) {
    for (const item of input) collectArtifactStrings(item, out, depth + 1);
    return;
  }
  if (typeof input === 'object') {
    for (const value of Object.values(input as Record<string, unknown>)) {
      collectArtifactStrings(value, out, depth + 1);
    }
  }
}

function extractLocalExecutionSteps(...sources: unknown[]): LocalExecutionStepView[] {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const record = source as Record<string, unknown>;
    if (String(record.pack_id || '').trim() !== 'local-execution-v1') continue;
    const outputs = record.outputs;
    if (!outputs || typeof outputs !== 'object') continue;
    const steps = (outputs as Record<string, unknown>).steps;
    if (!Array.isArray(steps)) continue;
    return steps.reduce<LocalExecutionStepView[]>((acc, item, index) => {
      if (!item || typeof item !== 'object') return acc;
      const row = item as Record<string, unknown>;
      acc.push({
        step_index: typeof row.step_index === 'number' ? row.step_index : index,
        step_number: typeof row.step_number === 'number' ? row.step_number : index + 1,
        tool: String(row.tool || 'unknown'),
        summary: String(row.summary || `Step ${index + 1}`),
        status: String(row.status || 'unknown'),
        artifact_file_path: typeof row.artifact_file_path === 'string' ? row.artifact_file_path : undefined,
        message: typeof row.message === 'string' ? row.message : undefined,
        session_profile: typeof row.session_profile === 'string' ? row.session_profile : undefined,
        browser_security_profile:
          typeof row.browser_security_profile === 'string' ? row.browser_security_profile : undefined,
      } satisfies LocalExecutionStepView);
      return acc;
    }, []);
  }
  return [];
}

function parseEventJson(value: string): ReplayEvent | null {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as ReplayEvent;
  } catch {
    return null;
  }
}

function toTimelineEvent(input: ReplayEvent, index: number, source: 'replay' | 'live'): TimelineEvent {
  const event = String(input?.event || 'event');
  const message = String(input?.message || '').trim();
  const eventId = String(input?.event_id || '').trim();
  const seq = typeof input?.seq === 'number' && Number.isFinite(input.seq) ? input.seq : null;
  return {
    id: eventId || `${source}:${event}:${index}`,
    ts: String(input?.ts || ''),
    seq,
    level: String(input?.level || 'info').toLowerCase(),
    event,
    message: message || event,
    toolHint: summarizeToolHint(input?.data, event),
  };
}

export default function RunInspectPage() {
  const singleAgentMode = SINGLE_AGENT_MODE;
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const runId = String(params?.id || '').trim();
  const focusTarget = normalizeInspectFocus(searchParams.get('focus'));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyItem, setHistoryItem] = useState<HistoryItem | null>(null);
  const [replayItem, setReplayItem] = useState<ReplayPayload['item'] | null>(null);
  const [liveEvents, setLiveEvents] = useState<ReplayEvent[]>([]);
  const [runDetail, setRunDetail] = useState<RunDetailPayload | null>(null);
  const [approvalAudit, setApprovalAudit] = useState<ApprovalAuditItem[]>([]);
  const [streamState, setStreamState] = useState<StreamState>('idle');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [inspectMode, setInspectMode] = useState<'timeline' | 'logs'>('timeline');
  const [activeSection, setActiveSection] = useState<InspectSectionTarget>('timeline');
  const [delegateRole, setDelegateRole] = useState<string>('support');
  const [delegateGoal, setDelegateGoal] = useState('');
  const [delegateNote, setDelegateNote] = useState('');
  const [delegating, setDelegating] = useState(false);
  const [autoDelegating, setAutoDelegating] = useState(false);
  const [retryingDelegation, setRetryingDelegation] = useState(false);
  const [delegateError, setDelegateError] = useState<string | null>(null);
  const [delegateNotice, setDelegateNotice] = useState<string | null>(null);
  const streamRef = useRef<AuthenticatedEventStreamConnection | null>(null);
  const timelineSectionRef = useRef<HTMLElement | null>(null);
  const approvalsSectionRef = useRef<HTMLElement | null>(null);
  const screenshotsSectionRef = useRef<HTMLElement | null>(null);
  const artifactsSectionRef = useRef<HTMLElement | null>(null);
  const desktopBridge = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const scopedWindow = window as typeof window & { orionDesktop?: DesktopBridge; empyralisDesktop?: DesktopBridge };
    return scopedWindow.orionDesktop || scopedWindow.empyralisDesktop || null;
  }, []);

  const getRuntimeApiKey = useCallback((): string => {
    return readRuntimeApiKeyFromStorage('');
  }, []);

  const buildHeaders = useCallback((withJson = false): HeadersInit => {
    const headers = new Headers();
    if (withJson) headers.set('Content-Type', 'application/json');
    const key = getRuntimeApiKey();
    if (key) headers.set('X-API-Key', key);
    return headers;
  }, [getRuntimeApiKey]);

  const mapApprovalAudit = useCallback((payload: unknown): ApprovalAuditItem[] => {
    const items = Array.isArray((payload as { items?: unknown[] })?.items) ? (payload as { items: unknown[] }).items : [];
    return items
      .map((item: unknown) => {
        const record = item as Record<string, unknown>;
        const metadata = record.metadata && typeof record.metadata === 'object' ? (record.metadata as Record<string, unknown>) : {};
        const rawLabels = Array.isArray(metadata.approval_labels)
          ? metadata.approval_labels
          : Array.isArray(metadata.labels)
            ? metadata.labels
            : [];
        const rawCapabilities = Array.isArray(metadata.approval_capabilities)
          ? metadata.approval_capabilities
          : Array.isArray(metadata.capabilities)
            ? metadata.capabilities
            : [];
        return {
          id: String(record.id || ''),
          ts: String(record.ts || ''),
          stage: String(record.stage || ''),
          decision: String(record.decision || ''),
          actor: String(record.actor || ''),
          source: String(record.source || ''),
          run_id: String(record.run_id || '') || null,
          note: String(record.note || '') || null,
          labels: rawLabels.map((value) => String(value || '').trim()).filter(Boolean),
          capabilities: rawCapabilities.map((value) => String(value || '').trim()).filter(Boolean),
        } satisfies ApprovalAuditItem;
      })
      .filter((item: ApprovalAuditItem) => item.run_id === runId);
  }, [runId]);

  const refreshRunState = useCallback(async () => {
    if (!runId) return;
    try {
      const headers = buildHeaders(false);
      const [historyRes, runRes, approvalsRes] = await Promise.all([
        fetch(`${ORION_API_URL}/history/runs?limit=200&workspace_id=default`, { headers }),
        fetch(`${ORION_API_URL}/runs/${encodeURIComponent(runId)}`, { headers }),
        fetch(`${ORION_API_URL}/approvals/audit?limit=200`, { headers }),
      ]);

      if (historyRes.ok) {
        const historyPayload = await historyRes.json();
        const historyItems = Array.isArray(historyPayload?.items) ? historyPayload.items : [];
        const found = historyItems.find((item: HistoryItem) => item?.run_id === runId) || null;
        setHistoryItem(found);
      }

      if (runRes.ok) {
        const runPayload = (await runRes.json()) as RunDetailPayload;
        setRunDetail(runPayload || null);
      }

      if (approvalsRes.ok) {
        const approvalsPayload = await approvalsRes.json();
        setApprovalAudit(mapApprovalAudit(approvalsPayload));
      }
    } catch {
      // Keep inspect page stable on transient sync errors.
    }
  }, [buildHeaders, mapApprovalAudit, runId]);

  const load = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    setError(null);
    setStreamError(null);
    setLiveEvents([]);
    try {
      const headers = buildHeaders(false);
      const [historyRes, runRes, approvalsRes, replayRes] = await Promise.all([
        fetch(`${ORION_API_URL}/history/runs?limit=200&workspace_id=default`, { headers }),
        fetch(`${ORION_API_URL}/runs/${encodeURIComponent(runId)}`, { headers }),
        fetch(`${ORION_API_URL}/approvals/audit?limit=200`, { headers }),
        fetch(`${ORION_API_URL}/runs/${encodeURIComponent(runId)}/replay`, { headers }),
      ]);

      if (!historyRes.ok) {
        const text = await historyRes.text().catch(() => '');
        throw new Error(text || 'Failed to load run history.');
      }
      if (!runRes.ok) {
        const text = await runRes.text().catch(() => '');
        throw new Error(text || 'Failed to load run details.');
      }

      const historyPayload = await historyRes.json();
      const runPayload = (await runRes.json()) as RunDetailPayload;
      const approvalsPayload = approvalsRes.ok ? await approvalsRes.json() : { items: [] };
      if (replayRes.ok) {
        const replayPayload = (await replayRes.json()) as ReplayPayload;
        setReplayItem(replayPayload?.item || null);
      } else {
        setReplayItem(null);
      }

      const historyItems = Array.isArray(historyPayload?.items) ? historyPayload.items : [];
      const found = historyItems.find((item: HistoryItem) => item?.run_id === runId) || null;
      setHistoryItem(found);

      setRunDetail(runPayload || null);
      setApprovalAudit(mapApprovalAudit(approvalsPayload));
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load transparency data.');
    } finally {
      setLoading(false);
    }
  }, [buildHeaders, mapApprovalAudit, runId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const knownStatus = String(historyItem?.status || runDetail?.status || '').toLowerCase();
    if (!runId || loading) return;
    if (TERMINAL_RUN_STATUSES.has(knownStatus)) {
      if (streamRef.current) {
        streamRef.current.close();
        streamRef.current = null;
      }
      setStreamState('closed');
      setStreamError(null);
      return;
    }
    const key = getRuntimeApiKey();
    const streamUrl = `${ORION_API_URL}/runs/${encodeURIComponent(runId)}/stream`;
    setStreamState('connecting');
    setStreamError(null);

    const source = openAuthenticatedEventStream({
      url: streamUrl,
      apiKey: key,
      onOpen: () => {
        setStreamState('connected');
        setStreamError(null);
      },
      onEvent: (event) => {
        if (event.event === 'pause') {
          void refreshRunState();
          return;
        }
        if (event.event !== 'log') return;
        const parsed = parseEventJson(String(event.data || ''));
        if (!parsed) return;
        setLiveEvents((prev) => {
          const eventId = String(parsed.event_id || '').trim();
          if (eventId && prev.some((item) => String(item.event_id || '').trim() === eventId)) return prev;
          const next = [...prev, parsed];
          if (next.length > 800) return next.slice(next.length - 800);
          return next;
        });
        const eventName = String(parsed.event || '').toLowerCase();
        if (
          eventName === 'run_complete' ||
          eventName === 'run_error' ||
          eventName === 'run_stopped' ||
          eventName === 'timeout' ||
          eventName.startsWith('approval_')
        ) {
          if (
            eventName === 'run_complete' ||
            eventName === 'run_error' ||
            eventName === 'run_stopped' ||
            eventName === 'timeout'
          ) {
            source.close();
            if (streamRef.current === source) streamRef.current = null;
            setStreamState('closed');
            setStreamError(null);
          }
          void refreshRunState();
        }
      },
      onError: () => {
        const latestStatus = String(historyItem?.status || runDetail?.status || '').toLowerCase();
        if (TERMINAL_RUN_STATUSES.has(latestStatus) || source.readyState === AUTH_STREAM_CLOSED) {
          source.close();
          if (streamRef.current === source) streamRef.current = null;
          setStreamState('closed');
          setStreamError(null);
          void refreshRunState();
          return;
        }
        void refreshRunState();
        setStreamState('disconnected');
        setStreamError('Live stream disconnected. Waiting for reconnect...');
      },
      onClose: () => {
        if (streamRef.current === source) streamRef.current = null;
      },
    });
    streamRef.current = source;

    return () => {
      source.close();
      if (streamRef.current === source) streamRef.current = null;
      setStreamState('idle');
    };
  }, [getRuntimeApiKey, historyItem?.status, loading, refreshRunState, runDetail?.status, runId]);

  useEffect(() => {
    const status = String(historyItem?.status || runDetail?.status || '').toLowerCase();
    const shouldPoll = ['queued', 'queued_local', 'starting', 'running', 'waiting', 'waiting_for_input'].includes(status);
    if (!shouldPoll) return;
    const timer = window.setInterval(() => {
      void refreshRunState();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [historyItem?.status, refreshRunState, runDetail?.status]);

  useEffect(() => {
    if (!focusTarget) return;
    if (focusTarget === 'logs') {
      setInspectMode('logs');
    } else if (focusTarget === 'timeline') {
      setInspectMode('timeline');
    }
    setActiveSection(focusTarget);
  }, [focusTarget]);

  const focusSection = useCallback((target: InspectSectionTarget) => {
    if (target === 'logs') {
      setInspectMode('logs');
    } else if (target === 'timeline') {
      setInspectMode('timeline');
    }
    setActiveSection(target);
    const targetRef =
      target === 'approvals'
        ? approvalsSectionRef
        : target === 'screenshots'
        ? screenshotsSectionRef
        : target === 'artifacts'
        ? artifactsSectionRef
        : timelineSectionRef;
    window.setTimeout(() => {
      targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, []);

  const failedDelegationRunIds = useMemo(
    () => (Array.isArray(runDetail?.delegation_summary?.failed_run_ids) ? runDetail.delegation_summary.failed_run_ids : []),
    [runDetail?.delegation_summary],
  );

  const handleDelegateRun = useCallback(async () => {
    const targetRole = String(delegateRole || '').trim();
    const targetGoal = String(delegateGoal || '').trim();
    if (!runId || !targetRole || !targetGoal) {
      setDelegateError('Select an agent and provide a child goal.');
      return;
    }
    setDelegating(true);
    setDelegateError(null);
    setDelegateNotice(null);
    try {
      const res = await fetch(`${ORION_API_URL}/runs/${encodeURIComponent(runId)}/delegate`, {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          note: String(delegateNote || '').trim() || undefined,
          children: [
            {
              agent_role: targetRole,
              user_goal: targetGoal,
            },
          ],
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'Failed to delegate run.');
      }
      const payload = await res.json();
      const childCount = Array.isArray(payload?.items) ? payload.items.length : Number(payload?.count || 0);
      setDelegateGoal('');
      setDelegateNote('');
      setDelegateNotice(childCount > 0 ? `Created ${childCount} delegated run${childCount === 1 ? '' : 's'}.` : 'Delegated run created.');
      await load();
    } catch (nextError: unknown) {
      setDelegateError(nextError instanceof Error ? nextError.message : 'Failed to delegate run.');
    } finally {
      setDelegating(false);
    }
  }, [buildHeaders, delegateGoal, delegateNote, delegateRole, load, runId]);

  const handleAutoDelegate = useCallback(async () => {
    if (!runId) return;
    setAutoDelegating(true);
    setDelegateError(null);
    setDelegateNotice(null);
    try {
      const res = await fetch(`${ORION_API_URL}/runs/${encodeURIComponent(runId)}/delegate/auto`, {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          note: String(delegateNote || '').trim() || undefined,
          max_children: 3,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'Failed to auto-delegate run.');
      }
      const payload = await res.json();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const labels = items
        .map((item: { agent_role?: string | null }) => formatAgentRoleLabel(item?.agent_role))
        .filter(Boolean);
      setDelegateNotice(
        items.length > 0
          ? `Created ${items.length} delegated run${items.length === 1 ? '' : 's'}: ${labels.join(', ')}.`
          : 'Delegated runs created.',
      );
      await load();
    } catch (nextError: unknown) {
      setDelegateError(nextError instanceof Error ? nextError.message : 'Failed to auto-delegate run.');
    } finally {
      setAutoDelegating(false);
    }
  }, [buildHeaders, delegateNote, load, runId]);

  const handleRetryFailedDelegation = useCallback(async () => {
    if (!runId) return;
    setRetryingDelegation(true);
    setDelegateError(null);
    setDelegateNotice(null);
    try {
      const res = await fetch(`${ORION_API_URL}/runs/${encodeURIComponent(runId)}/delegate/retry-failed`, {
        method: 'POST',
        headers: buildHeaders(true),
        body: JSON.stringify({
          note: String(delegateNote || '').trim() || undefined,
          failed_run_ids: failedDelegationRunIds.length > 0 ? failedDelegationRunIds : undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'Failed to retry delegated runs.');
      }
      const payload = await res.json();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setDelegateNotice(
        items.length > 0
          ? `Created ${items.length} retry run${items.length === 1 ? '' : 's'} for failed child work.`
          : 'Retry run created.',
      );
      await load();
    } catch (nextError: unknown) {
      setDelegateError(nextError instanceof Error ? nextError.message : 'Failed to retry delegated runs.');
    } finally {
      setRetryingDelegation(false);
    }
  }, [buildHeaders, delegateNote, failedDelegationRunIds, load, runId]);

  const timelineEvents = useMemo((): TimelineEvent[] => {
    const replayEvents = Array.isArray(replayItem?.events) ? replayItem.events : [];
    const combined: TimelineEvent[] = [];
    const seen = new Set<string>();
    const pushUnique = (entry: TimelineEvent) => {
      const identity = entry.id || `${entry.ts}|${entry.event}|${entry.message}|${entry.seq ?? ''}`;
      if (seen.has(identity)) return;
      seen.add(identity);
      combined.push(entry);
    };
    replayEvents.forEach((item, index) => {
      pushUnique(toTimelineEvent(item, index, 'replay'));
    });
    liveEvents.forEach((item, index) => {
      pushUnique(toTimelineEvent(item, index, 'live'));
    });
    return combined;
  }, [liveEvents, replayItem?.events]);

  const artifacts = useMemo(() => {
    const out = new Set<string>();
    collectArtifactStrings(replayItem?.result_data, out);
    collectArtifactStrings(runDetail?.result_data, out);
    return Array.from(out);
  }, [replayItem?.result_data, runDetail?.result_data]);
  const localExecutionSteps = useMemo(
    () => extractLocalExecutionSteps(runDetail?.result_data, replayItem?.result_data),
    [replayItem?.result_data, runDetail?.result_data],
  );

  const screenshotArtifacts = useMemo(
    () => artifacts.filter((item) => /\.(png|jpg|jpeg|webp|gif)$/i.test(item) || /screenshot/i.test(item)),
    [artifacts],
  );
  const deliverableArtifacts = useMemo(
    () => artifacts.filter((item) => classifyArtifactForInspect(item) === 'deliverable'),
    [artifacts],
  );
  const systemArtifacts = useMemo(
    () => artifacts.filter((item) => classifyArtifactForInspect(item) === 'system'),
    [artifacts],
  );
  const parentRun = runDetail?.parent_run || null;
  const childRuns = Array.isArray(runDetail?.child_runs) ? runDetail.child_runs : [];
  const delegationSummary = runDetail?.delegation_summary || null;
  const effectiveAgentRole = String(historyItem?.agent_role || runDetail?.agent_role || '').trim();
  const canDelegate = !singleAgentMode && effectiveAgentRole === 'orchestrator';
  const specialistAgentOptions = AGENT_ROLE_OPTIONS.filter((item) => item.id !== 'orchestrator');
  const connectorBinding = historyItem?.connector_binding || runDetail?.connector_binding || null;
  const runtimeApiKey = getRuntimeApiKey();
  const openArtifactTarget = useCallback(async (targetPath: string) => {
    const normalized = String(targetPath || '').trim();
    if (!normalized) return;

    if (desktopBridge?.desktop) {
      try {
        if (isLocalFileTarget(normalized) && desktopBridge.openPath) {
          const opened = await desktopBridge.openPath(normalized);
          if (opened === true || opened === '') return;
        }
        if (isHttpTarget(normalized) && desktopBridge.openExternal) {
          const opened = await desktopBridge.openExternal(normalized);
          if (opened === true || opened === '') return;
        }
      } catch {
        // Ignore stale desktop bridge errors; desktop restart will refresh IPC handlers.
      }
    }

    try {
      if (isHttpTarget(normalized)) {
        window.open(normalized, '_blank', 'noopener,noreferrer');
        return;
      }
      const blob = await fetchRuntimeArtifactBlob(ORION_API_URL, normalized, runtimeApiKey);
      const objectUrl = URL.createObjectURL(blob);
      const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer');
      if (!opened) {
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = formatArtifactLabel(normalized);
        anchor.rel = 'noopener noreferrer';
        anchor.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      setStreamError(error instanceof Error ? error.message : 'Could not open artifact preview.');
    }
  }, [desktopBridge, runtimeApiKey]);
  const revealArtifactTarget = useCallback(async (targetPath: string) => {
    const normalized = String(targetPath || '').trim();
    if (!desktopBridge?.desktop || !desktopBridge.revealPath || !isLocalFileTarget(normalized)) return;
    try {
      await desktopBridge.revealPath(normalized);
    } catch {
      // Ignore stale desktop bridge errors; desktop restart will refresh IPC handlers.
    }
  }, [desktopBridge]);
  const revealLabel = desktopBridge?.platform === 'darwin'
    ? 'Show in Finder'
    : desktopBridge?.platform === 'win32'
      ? 'Show in Explorer'
      : 'Show in folder';
  const runMetadata = useMemo(() => extractRunMetadata(runDetail, replayItem), [replayItem, runDetail]);
  const runSkillSummary = useMemo(() => extractSkillSummary(runMetadata), [runMetadata]);
  const effectiveRunStatus = String(historyItem?.status || runDetail?.status || replayItem?.status || '').toLowerCase();
  const runGoal = useMemo(
    () => compactText(String(runDetail?.context?.user_goal || parentRun?.user_goal || '').trim(), '--', 160),
    [parentRun?.user_goal, runDetail?.context?.user_goal],
  );
  const primarySummary = useMemo(() => {
    const resultSummary = compactText(String(historyItem?.result_summary || '').trim(), '', 220);
    if (resultSummary) return resultSummary;
    const replayResult = replayItem?.result_data;
    if (replayResult && typeof replayResult === 'object') {
      const record = replayResult as Record<string, unknown>;
      const summary = compactText(String(record.summary || record.message || record.result_summary || '').trim(), '', 220);
      if (summary) return summary;
    }
    if (runDetail?.pending_approval?.prompt) {
      return approvalDisplayText(
        runDetail.pending_approval.prompt,
        runDetail.pending_approval.metadata?.approval_labels,
        runDetail.pending_approval.metadata?.approval_capabilities,
        'Waiting for a decision to continue.',
      );
    }
    return 'No result summary recorded yet.';
  }, [
    historyItem?.result_summary,
    replayItem?.result_data,
    runDetail?.pending_approval?.metadata?.approval_capabilities,
    runDetail?.pending_approval?.metadata?.approval_labels,
    runDetail?.pending_approval?.prompt,
  ]);
  const outcomeToneColor =
    effectiveRunStatus === 'completed' || effectiveRunStatus === 'success'
      ? 'var(--success-fg)'
      : effectiveRunStatus === 'failed' || effectiveRunStatus === 'error' || effectiveRunStatus === 'timeout'
      ? 'var(--error-fg)'
      : effectiveRunStatus === 'waiting_for_input' || effectiveRunStatus === 'waiting'
      ? 'var(--warning-fg)'
      : '#c4b5fd';
  const latestApproval = approvalAudit[0] ?? null;
  const latestArtifact = deliverableArtifacts[0] || screenshotArtifacts[0] || artifacts[0] || null;
  const runtimePolicyNotes = useMemo(() => {
    const notes: Array<{ label: string; value: string; tone?: 'default' | 'warning' }> = [];
    if (runSkillSummary.scope) notes.push({ label: 'Skill scope', value: runSkillSummary.scope });
    const capabilityTitles = (runDetail?.tool_policy_precheck?.capabilities || [])
      .map((item) => {
        const title = String(item?.title || '').trim();
        return title || capabilityLabel(item?.id);
      })
      .filter(Boolean);
    if (capabilityTitles.length > 0) {
      notes.push({ label: 'Local actions', value: capabilityTitles.join(', ') });
    }
    if (typeof runDetail?.tool_policy_precheck?.skill_contract?.policy_mode === 'string' && runDetail.tool_policy_precheck.skill_contract.policy_mode) {
      notes.push({ label: 'Skill policy', value: String(runDetail.tool_policy_precheck.skill_contract.policy_mode) });
    }
    if (Array.isArray(runDetail?.tool_policy_precheck?.skill_contract?.declared_runtime_tools) &&
      runDetail.tool_policy_precheck.skill_contract.declared_runtime_tools.length > 0) {
      notes.push({
        label: 'Runtime tools',
        value: runDetail.tool_policy_precheck.skill_contract.declared_runtime_tools.join(', '),
      });
    }
    if (Array.isArray(runDetail?.tool_policy_precheck?.skill_contract?.undeclared_tools) &&
      runDetail.tool_policy_precheck.skill_contract.undeclared_tools.length > 0) {
      notes.push({
        label: 'Skill mismatch',
        value: runDetail.tool_policy_precheck.skill_contract.undeclared_tools.join(', '),
        tone: 'warning',
      });
    }
    if (runDetail?.tool_policy_precheck?.browser_automation_policy?.profile) {
      notes.push({
        label: 'Browser profile',
        value: String(runDetail.tool_policy_precheck.browser_automation_policy.profile),
      });
    }
    if (Array.isArray(runDetail?.tool_policy_precheck?.browser_automation_policy?.privileged_actions) &&
      runDetail.tool_policy_precheck.browser_automation_policy.privileged_actions.length > 0) {
      notes.push({
        label: 'Privileged browser actions',
        value: runDetail.tool_policy_precheck.browser_automation_policy.privileged_actions.join(', '),
        tone: 'warning',
      });
    }
    if (runDetail?.tool_policy_precheck?.browser_automation_policy?.requires_approval &&
      runDetail.tool_policy_precheck.browser_automation_policy.reason) {
      notes.push({
        label: 'Browser approval',
        value: String(runDetail.tool_policy_precheck.browser_automation_policy.reason),
        tone: 'warning',
      });
    }
    return notes;
  }, [runDetail?.tool_policy_precheck, runSkillSummary.scope]);
  const logRows = useMemo(
    () =>
      timelineEvents.map((item) => ({
        id: item.id,
        ts: item.ts,
        level: item.level,
        text: item.message,
      })),
    [timelineEvents],
  );
  const streamColor =
    TERMINAL_RUN_STATUSES.has(effectiveRunStatus)
      ? 'var(--text-secondary)'
      : streamState === 'connected'
      ? 'var(--success-fg)'
      : streamState === 'connecting'
      ? '#93c5fd'
      : streamState === 'disconnected'
      ? 'var(--warning-fg)'
      : streamState === 'closed'
      ? 'var(--text-secondary)'
      : 'var(--text-tertiary)';
  const streamLabel =
    TERMINAL_RUN_STATUSES.has(effectiveRunStatus)
      ? 'closed'
      : streamState === 'connected'
      ? 'live'
      : streamState === 'connecting'
      ? 'connecting'
      : streamState === 'disconnected'
      ? 'reconnecting'
      : streamState === 'closed'
      ? 'closed'
      : 'idle';
  const focusedSectionStyle = {
    borderColor: 'rgba(139,92,246,0.38)',
    boxShadow: 'inset 0 0 0 1px rgba(139,92,246,0.08)',
  } as const;

  useEffect(() => {
    if (loading || !focusTarget) return;
    const timer = window.setTimeout(() => {
      focusSection(focusTarget);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [focusSection, focusTarget, loading]);

  if (!runId) {
    return (
      <div className="orion-page-shell">
        <section className="orion-panel">Invalid run id.</section>
      </div>
    );
  }

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={<Eye size={18} />}
        title="Run Inspect"
        subtitle={`Run ${runId.slice(0, 8)} · ${formatAgentRoleLabel(historyItem?.agent_role || runDetail?.agent_role)}`}
        meta={connectorBinding ? formatConnectorBindingLabel(connectorBinding) : undefined}
        actions={
          <>
            <div
              title="Run stream state"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                borderRadius: 999,
                border: '1px solid var(--border-default)',
                padding: '6px 10px',
                fontSize: 11,
                color: 'var(--text-tertiary)',
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: streamColor,
                  boxShadow: streamState === 'connected' ? '0 0 0 4px rgba(134,239,172,0.13)' : 'none',
                }}
              />
              stream {streamLabel}
            </div>
            <button className="orion-btn orion-btn-ghost" onClick={() => void load()}>
              <RefreshCw size={14} />
              Refresh
            </button>
            <Link className="orion-btn orion-btn-ghost" href="/executions">
              Back to Runs
            </Link>
          </>
        }
      />

      {error ? (
        <section
          className="orion-panel"
          style={{
            borderColor: 'rgba(239,68,68,0.35)',
            background: 'var(--error-bg)',
            color: 'var(--error-fg)',
          }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
            <AlertTriangle size={14} />
            {error}
          </div>
        </section>
      ) : null}

      {!error && streamError && !TERMINAL_RUN_STATUSES.has(effectiveRunStatus) ? (
        <section
          className="orion-panel"
          style={{
            borderColor: 'rgba(245,158,11,0.35)',
            background: 'var(--warning-bg)',
            color: 'var(--warning-fg)',
          }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
            <AlertTriangle size={14} />
            {streamError}
          </div>
        </section>
      ) : null}

      {!loading ? (
        <section
          className="orion-panel"
          style={{
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Jump to
          </span>
          {([
            ['timeline', `Timeline ${timelineEvents.length}`],
            ['logs', `Logs ${logRows.length}`],
            ['approvals', `Approvals ${approvalAudit.length}`],
            ['screenshots', `Screenshots ${screenshotArtifacts.length}`],
            ['artifacts', `Artifacts ${artifacts.length}`],
          ] as Array<[InspectSectionTarget, string]>).map(([target, label]) => {
            const isActive = activeSection === target;
            return (
              <button
                key={target}
                className="orion-btn orion-btn-ghost"
                onClick={() => focusSection(target)}
                style={{
                  minHeight: 30,
                  padding: '0 10px',
                  fontSize: 11,
                  background: isActive ? 'rgba(139,92,246,0.12)' : 'transparent',
                  borderColor: isActive ? 'rgba(139,92,246,0.36)' : 'var(--border-default)',
                  color: isActive ? '#c4b5fd' : 'var(--text-secondary)',
                }}
              >
                {label}
              </button>
            );
          })}
        </section>
      ) : null}

      {loading ? (
        <section className="orion-panel muted" style={{ minHeight: 220, display: 'grid', placeItems: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-tertiary)' }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            Loading...
          </div>
        </section>
      ) : (
        <>
          <section
            style={{
              display: 'grid',
              gap: 14,
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            }}
          >
            <article className="orion-panel">
              <div className="orion-panel-title">Outcome</div>
              <div style={{ marginTop: 6, fontSize: 22, lineHeight: 1.2, fontWeight: 800, color: outcomeToneColor, textTransform: 'capitalize' }}>
                {formatInspectStatusLabel(historyItem?.status || runDetail?.status || 'unknown')}
              </div>
              <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                {primarySummary}
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="orion-chip">Run {runId.slice(0, 8)}</span>
                <span className="orion-chip">Agent {formatAgentRoleLabel(historyItem?.agent_role || runDetail?.agent_role)}</span>
                {connectorBinding ? <span className="orion-chip">Channel {formatConnectorBindingLabel(connectorBinding)}</span> : null}
              </div>
              <div style={{ marginTop: 12, display: 'grid', gap: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
                <div>Goal {runGoal}</div>
                <div>Started {fmtTime(historyItem?.created_at)}</div>
                <div>Completed {fmtTime(historyItem?.completed_at)}</div>
              </div>
            </article>

            <article className="orion-panel">
              <div className="orion-panel-title">Run Context</div>
              <div style={{ marginTop: 6, fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
                {formatAgentRoleLabel(historyItem?.agent_role || runDetail?.agent_role)}
              </div>
              <div style={{ marginTop: 10, display: 'grid', gap: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
                <div>Channel {formatConnectorBindingLabel(connectorBinding)}</div>
                <div>Duration {fmtMs(historyItem?.duration_ms)}</div>
                <div>Time-to-first-value {fmtMs(historyItem?.time_to_first_value_ms)}</div>
                <div>Usage {(historyItem?.usage_provider || '--')} · {(historyItem?.usage_model || '--')}</div>
                <div>Cost {historyItem?.usage_cost_band || '--'}</div>
                <div>Skills {runSkillSummary.labels.length > 0 ? runSkillSummary.labels.join(', ') : '--'}</div>
                {historyItem?.agent_role_source || runDetail?.agent_role_source
                  ? <div>Assignment {String(historyItem?.agent_role_source || runDetail?.agent_role_source)}</div>
                  : null}
              </div>
            </article>

            <article className="orion-panel">
              <div className="orion-panel-title">Approvals</div>
              <div style={{ marginTop: 6, fontSize: 17, fontWeight: 800, color: runDetail?.pending_approval ? 'var(--warning-fg)' : 'var(--text-primary)' }}>
                {runDetail?.pending_approval ? 'Waiting for decision' : approvalAudit.length > 0 ? 'Decision history recorded' : 'No approvals needed'}
              </div>
              <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                {runDetail?.pending_approval
                  ? approvalDisplayText(
                    runDetail.pending_approval.prompt,
                    runDetail.pending_approval.metadata?.approval_labels,
                    runDetail.pending_approval.metadata?.approval_capabilities,
                    'Approval required to continue.',
                  )
                  : latestApproval
                  ? `${formatApprovalDecisionLabel(latestApproval.decision)} · ${compactText(approvalDisplayText('', latestApproval.labels, latestApproval.capabilities, latestApproval.note || latestApproval.stage), 'Decision recorded.', 140)}`
                  : 'This run finished without pausing for approval.'}
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="orion-btn orion-btn-ghost" style={{ minHeight: 30, paddingInline: 10 }} onClick={() => focusSection('approvals')}>
                  Open approvals
                </button>
                <Link className="orion-btn orion-btn-ghost" style={{ minHeight: 30, paddingInline: 10 }} href="/approvals">
                  Go to Approval Queue
                </Link>
              </div>
            </article>

            <article className="orion-panel">
              <div className="orion-panel-title">Deliverables</div>
              <div style={{ marginTop: 6, fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
                {deliverableArtifacts.length} deliverable{deliverableArtifacts.length === 1 ? '' : 's'}
              </div>
              <div style={{ marginTop: 10, display: 'grid', gap: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
                <div>Evidence {screenshotArtifacts.length}</div>
                <div>System files {systemArtifacts.length}</div>
                <div>Latest {latestArtifact ? formatArtifactLabel(latestArtifact) : '--'}</div>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="orion-btn orion-btn-ghost" style={{ minHeight: 30, paddingInline: 10 }} onClick={() => focusSection('artifacts')}>
                  Open artifacts
                </button>
                <Link className="orion-btn orion-btn-ghost" style={{ minHeight: 30, paddingInline: 10 }} href="/artifacts">
                  Open outputs
                </Link>
              </div>
            </article>
          </section>

          <section className="orion-grid-2">
            <article className="orion-panel">
              <div className="orion-panel-title">Route & Runtime</div>
              <div style={{ marginTop: 6, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)' }}>
                <Route size={13} />
                {historyItem?.execution_target_requested ? formatExecutionTargetLabel(historyItem.execution_target_requested) : '--'}
                {' -> '}
                {historyItem?.execution_target_selected ? formatExecutionTargetLabel(historyItem.execution_target_selected) : '--'}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
                {compactText(historyItem?.execution_target_reason, '--', 220)}
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="orion-chip">
                  Tokens {typeof historyItem?.usage_total_tokens_est === 'number' ? historyItem.usage_total_tokens_est.toLocaleString() : '--'}
                </span>
                <span className="orion-chip">Provider {historyItem?.usage_provider || '--'}</span>
                <span className="orion-chip">Model {historyItem?.usage_model || '--'}</span>
              </div>
            </article>

            {runtimePolicyNotes.length > 0 ? (
              <article className="orion-panel">
                <div className="orion-panel-title">Runtime Detail</div>
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  {runtimePolicyNotes.map((item) => (
                    <div
                      key={`${item.label}:${item.value}`}
                      style={{
                        display: 'grid',
                        gap: 4,
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: `1px solid ${item.tone === 'warning' ? 'var(--warning-border)' : 'var(--border-default)'}`,
                        background: item.tone === 'warning' ? 'var(--warning-bg)' : 'var(--bg-element)',
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: 12, color: item.tone === 'warning' ? 'var(--warning-fg)' : 'var(--text-secondary)' }}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}
          </section>

          {(parentRun || childRuns.length > 0 || canDelegate) ? (
            <section className="orion-panel">
              <div className="orion-panel-title">Delegation</div>
              <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
                {parentRun ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Parent run
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '120px minmax(220px,1fr) auto',
                        gap: 10,
                        alignItems: 'center',
                        border: '1px solid var(--border-default)',
                        borderRadius: 10,
                        padding: '10px 12px',
                        background: 'var(--bg-element)',
                      }}
                    >
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>
                          {String(parentRun.run_id || '').slice(0, 8) || '--'}
                        </div>
                        <div style={{ fontSize: 11, color: statusColor(parentRun.status || undefined) }}>
                          {String(parentRun.status || '--').toUpperCase()}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                          {String(parentRun.user_goal || parentRun.result_summary || 'Delegated from parent run.')}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          Agent {formatAgentRoleLabel(parentRun.agent_role)}
                        </div>
                      </div>
                      <Link
                        className="orion-btn orion-btn-ghost"
                        href={`/runs/${encodeURIComponent(String(parentRun.run_id || ''))}/inspect?focus=timeline`}
                        style={{ minHeight: 30, paddingInline: 10 }}
                      >
                        Inspect
                      </Link>
                    </div>
                  </div>
                ) : null}

                {childRuns.length > 0 ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Child runs {childRuns.length}
                    </div>
                    <div style={{ border: '1px solid var(--border-default)', borderRadius: 10, overflow: 'hidden' }}>
                      {childRuns.map((child, index) => (
                        <div
                          key={String(child.run_id || `child-${index}`)}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '110px 150px minmax(220px,1fr) 170px auto',
                            gap: 10,
                            alignItems: 'center',
                            padding: '10px 12px',
                            borderTop: index === 0 ? 'none' : '1px solid var(--border-default)',
                            background: 'var(--bg-element)',
                          }}
                        >
                          <div style={{ display: 'grid', gap: 4 }}>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>
                              {String(child.run_id || '').slice(0, 8) || '--'}
                            </div>
                            <div style={{ fontSize: 11, color: statusColor(child.status || undefined) }}>
                              {String(child.status || '--').toUpperCase()}
                            </div>
                          </div>
                          <div style={{ display: 'grid', gap: 4 }}>
                            <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                              {formatAgentRoleLabel(child.agent_role)}
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                {fmtTime(child.updated_at || child.created_at || undefined)}
                              </div>
                              {(Number(child.retry_sequence || 0) || child.retry_of_run_id) ? (
                                <span className="orion-chip" style={{ minHeight: 20, fontSize: 10, paddingInline: 7 }}>
                                  Retry {Math.max(1, Number(child.retry_sequence || 1))}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                            {String(child.user_goal || child.result_summary || 'Delegated work item')}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {String(child.delegation_note || runDetail?.delegation_note || '').trim() || '--'}
                          </div>
                          <Link
                            className="orion-btn orion-btn-ghost"
                            href={`/runs/${encodeURIComponent(String(child.run_id || ''))}/inspect?focus=timeline`}
                            style={{ minHeight: 30, paddingInline: 10 }}
                          >
                            Inspect
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {delegationSummary ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Orchestration summary
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gap: 10,
                        border: '1px solid var(--border-default)',
                        borderRadius: 10,
                        padding: 12,
                        background: 'var(--bg-element)',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span className="orion-chip">{String(delegationSummary.total_children || 0)} children</span>
                        {(delegationSummary.effective_children || 0) > 0 ? (
                          <span className="orion-chip">{String(delegationSummary.effective_children || 0)} active lineages</span>
                        ) : null}
                        <span className="orion-chip">{String(delegationSummary.completed_children || 0)} completed</span>
                        {(delegationSummary.active_children || 0) > 0 ? (
                          <span className="orion-chip">{String(delegationSummary.active_children || 0)} active</span>
                        ) : null}
                        {(delegationSummary.waiting_children || 0) > 0 ? (
                          <span className="orion-chip">{String(delegationSummary.waiting_children || 0)} waiting</span>
                        ) : null}
                        {(delegationSummary.failed_children || 0) > 0 ? (
                          <span className="orion-chip">{String(delegationSummary.failed_children || 0)} failed</span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                        {String(delegationSummary.summary_text || (delegationSummary.ready ? 'Delegated child runs finished.' : 'Waiting for delegated child runs to finish.'))}
                      </div>
                      {delegationSummary.next_action ? (
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          Next action:{' '}
                          {delegationSummary.next_action === 'waiting_for_children'
                            ? 'Waiting for child runs to finish.'
                            : delegationSummary.next_action === 'resolve_child_approvals'
                            ? 'Resolve child approvals.'
                            : delegationSummary.next_action === 'retry_failed_children'
                            ? 'Retry failed child runs.'
                            : delegationSummary.next_action === 'merge_results'
                            ? 'Merge child results into the orchestration summary.'
                            : String(delegationSummary.next_action)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {canDelegate ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Create child run
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gap: 10,
                        border: '1px solid var(--border-default)',
                        borderRadius: 10,
                        padding: 12,
                        background: 'var(--bg-element)',
                      }}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0,1fr)', gap: 10 }}>
                        <select
                          className="input"
                          value={delegateRole}
                          onChange={(event) => setDelegateRole(event.target.value)}
                          style={{ height: 38, borderRadius: 10 }}
                        >
                          {specialistAgentOptions.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                        <input
                          className="input"
                          value={delegateGoal}
                          onChange={(event) => setDelegateGoal(event.target.value)}
                          placeholder="Child goal for the selected specialist"
                          style={{ height: 38, borderRadius: 10 }}
                        />
                      </div>
                      <textarea
                        className="input"
                        value={delegateNote}
                        onChange={(event) => setDelegateNote(event.target.value)}
                        placeholder="Optional note for delegated runs"
                        rows={2}
                        style={{ borderRadius: 10, resize: 'vertical' }}
                      />
                      {delegateError ? (
                        <div style={{ fontSize: 12, color: 'var(--error-fg)' }}>{delegateError}</div>
                      ) : null}
                      {delegateNotice ? (
                        <div style={{ fontSize: 12, color: 'var(--success-fg)' }}>{delegateNotice}</div>
                      ) : null}
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            className="orion-btn orion-btn-ghost"
                            onClick={() => void handleAutoDelegate()}
                            disabled={autoDelegating || delegating || retryingDelegation}
                          >
                            {autoDelegating ? 'Planning...' : 'Auto-plan delegation'}
                          </button>
                          {(delegationSummary?.retryable_failed_children || 0) > 0 ? (
                            <button
                              className="orion-btn orion-btn-ghost"
                              onClick={() => void handleRetryFailedDelegation()}
                              disabled={autoDelegating || delegating || retryingDelegation}
                            >
                              {retryingDelegation
                                ? 'Retrying...'
                                : `Retry failed (${String(delegationSummary?.retryable_failed_children || 0)})`}
                            </button>
                          ) : null}
                        </div>
                        <button
                          className="orion-btn orion-btn-primary"
                          onClick={() => void handleDelegateRun()}
                          disabled={delegating || autoDelegating || retryingDelegation}
                        >
                          {delegating ? 'Delegating...' : `Delegate to ${formatAgentRoleLabel(delegateRole)}`}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {localExecutionSteps.length > 0 ? (
            <section className="orion-panel">
              <div className="orion-panel-title">Execution steps</div>
              <div
                style={{
                  marginTop: 10,
                  borderTop: '1px solid var(--border-default)',
                  borderBottom: '1px solid var(--border-default)',
                }}
              >
                {localExecutionSteps.map((step) => {
                  const tone = localExecutionStepTone(step.status);
                  return (
                    <div
                      key={`local-step:${step.step_number}:${step.summary}`}
                      className="orion-log-entry"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '92px minmax(220px, 1fr) auto',
                        gap: 10,
                        padding: '9px 10px',
                        borderBottom: '1px solid var(--border-default)',
                        alignItems: 'start',
                      }}
                    >
                      <div style={{ display: 'grid', gap: 4 }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minHeight: 22,
                            width: 'fit-content',
                            padding: '0 8px',
                            borderRadius: 999,
                            border: '1px solid var(--border-default)',
                            background: 'var(--bg-element)',
                            fontSize: 10,
                            color: 'var(--text-tertiary)',
                            fontWeight: 800,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                          }}
                        >
                          Step {step.step_number}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{step.summary}</div>
                        <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              minHeight: 20,
                              padding: '0 7px',
                              borderRadius: 999,
                              border: '1px solid var(--border-default)',
                              background: 'var(--bg-element)',
                              fontSize: 10,
                              color: 'var(--text-tertiary)',
                              fontWeight: 700,
                            }}
                          >
                            {step.tool}
                          </span>
                        </div>
                        {step.artifact_file_path ? (
                          <div style={{ display: 'grid', gap: 6 }}>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', wordBreak: 'break-all' }}>
                              Output {step.artifact_file_path}
                            </div>
                            <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                              <button
                                className="orion-btn orion-btn-primary"
                                style={{ minHeight: 28, paddingInline: 10 }}
                                onClick={() => void openArtifactTarget(step.artifact_file_path!)}
                              >
                                Open
                              </button>
                              {desktopBridge?.desktop && isLocalFileTarget(step.artifact_file_path) ? (
                                <button
                                  className="orion-btn orion-btn-ghost"
                                  style={{ minHeight: 28, paddingInline: 10 }}
                                  onClick={() => void revealArtifactTarget(step.artifact_file_path!)}
                                >
                                  {revealLabel}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                        {step.session_profile ? (
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            Session profile <span style={{ color: 'var(--text-secondary)' }}>{step.session_profile}</span>
                          </div>
                        ) : null}
                        {step.browser_security_profile ? (
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            Browser profile{' '}
                            <span style={{ color: 'var(--text-secondary)' }}>{step.browser_security_profile}</span>
                          </div>
                        ) : null}
                        {step.message ? (
                          <div style={{ fontSize: 11, color: 'var(--error-fg)', wordBreak: 'break-word' }}>
                            {step.message}
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            minHeight: 22,
                            padding: '0 8px',
                            borderRadius: 999,
                            border: `1px solid ${tone.border}`,
                            background: tone.background,
                            fontSize: 10,
                            color: tone.color,
                            fontWeight: 800,
                            letterSpacing: '0.03em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {tone.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="orion-grid-2">
            <article
              ref={timelineSectionRef}
              className="orion-panel"
              style={{
                minHeight: 280,
                scrollMarginTop: 92,
                ...(activeSection === 'timeline' || activeSection === 'logs' ? focusedSectionStyle : null),
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div className="orion-panel-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Activity size={14} />
                  Timeline ({timelineEvents.length})
                </div>
                <div style={{ display: 'inline-flex', gap: 6 }}>
                  <button
                    className="orion-btn orion-btn-ghost"
                    onClick={() => setInspectMode('timeline')}
                    style={{
                      minHeight: 28,
                      fontSize: 11,
                      padding: '0 9px',
                      background: inspectMode === 'timeline' ? 'rgba(139,92,246,0.16)' : 'var(--bg-element)',
                      borderColor: inspectMode === 'timeline' ? 'rgba(139,92,246,0.42)' : 'var(--border-default)',
                      color: inspectMode === 'timeline' ? '#c4b5fd' : 'var(--text-secondary)',
                    }}
                  >
                    Timeline
                  </button>
                  <button
                    className="orion-btn orion-btn-ghost"
                    onClick={() => setInspectMode('logs')}
                    style={{
                      minHeight: 28,
                      fontSize: 11,
                      padding: '0 9px',
                      background: inspectMode === 'logs' ? 'rgba(139,92,246,0.16)' : 'var(--bg-element)',
                      borderColor: inspectMode === 'logs' ? 'rgba(139,92,246,0.42)' : 'var(--border-default)',
                      color: inspectMode === 'logs' ? '#c4b5fd' : 'var(--text-secondary)',
                    }}
                  >
                    Logs
                  </button>
                </div>
              </div>
              {inspectMode === 'timeline' && timelineEvents.length === 0 ? (
                <div className="orion-panel-copy" style={{ marginTop: 10 }}>No timeline events.</div>
              ) : inspectMode === 'timeline' ? (
                <div
                  style={{
                    marginTop: 10,
                    borderTop: '1px solid var(--border-default)',
                    borderBottom: '1px solid var(--border-default)',
                    overflowX: 'auto',
                    maxHeight: 420,
                    overflowY: 'auto',
                  }}
                >
                  <div
                    style={{
                      minWidth: 700,
                      display: 'grid',
                      gridTemplateColumns: '150px 92px 180px minmax(220px, 1fr) 160px',
                      gap: 8,
                      padding: '8px 10px',
                      borderBottom: '1px solid var(--border-default)',
                      fontSize: 10,
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontWeight: 800,
                    }}
                  >
                    <span>Time</span>
                    <span>Level</span>
                    <span>Event</span>
                    <span>Message</span>
                    <span>Tool</span>
                  </div>
                  {timelineEvents.map((item) => {
                    const levelColor =
                      item.level === 'error'
                        ? 'var(--error-fg)'
                        : item.level === 'warn'
                        ? 'var(--warning-fg)'
                        : 'var(--text-secondary)';
                    return (
                      <div
                        key={item.id}
                        className="orion-log-entry"
                        style={{
                          minWidth: 700,
                          display: 'grid',
                          gridTemplateColumns: '150px 92px 180px minmax(220px, 1fr) 160px',
                          gap: 8,
                          padding: '9px 10px',
                          borderBottom: '1px solid var(--border-default)',
                          alignItems: 'start',
                        }}
                      >
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtTime(item.ts)}</span>
                        <span style={{ fontSize: 11, color: levelColor, fontWeight: 700 }}>
                          {item.seq != null ? `${item.level} #${item.seq}` : item.level}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 700 }}>{item.event}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.message}</span>
                        <span style={{ fontSize: 12, color: '#c4b5fd' }}>{item.toolHint || '--'}</span>
                      </div>
                    );
                  })}
                </div>
              ) : logRows.length === 0 ? (
                <div className="orion-panel-copy" style={{ marginTop: 10 }}>No logs captured.</div>
              ) : (
                <div
                  style={{
                    marginTop: 10,
                    borderTop: '1px solid var(--border-default)',
                    borderBottom: '1px solid var(--border-default)',
                    overflowX: 'auto',
                    maxHeight: 420,
                    overflowY: 'auto',
                  }}
                >
                  <div
                    style={{
                      minWidth: 580,
                      display: 'grid',
                      gridTemplateColumns: '84px 160px minmax(300px, 1fr)',
                      gap: 8,
                      padding: '8px 10px',
                      borderBottom: '1px solid var(--border-default)',
                      fontSize: 10,
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontWeight: 800,
                    }}
                  >
                    <span>Level</span>
                    <span>Time</span>
                    <span>Message</span>
                  </div>
                  {logRows.map((item) => {
                    const levelColor =
                      item.level === 'error'
                        ? 'var(--error-fg)'
                        : item.level === 'warn'
                        ? 'var(--warning-fg)'
                        : 'var(--text-secondary)';
                    return (
                      <div
                        key={`log:${item.id}`}
                        className="orion-log-entry"
                        style={{
                          minWidth: 580,
                          display: 'grid',
                          gridTemplateColumns: '84px 160px minmax(300px, 1fr)',
                          gap: 8,
                          padding: '9px 10px',
                          borderBottom: '1px solid var(--border-default)',
                          alignItems: 'start',
                        }}
                      >
                        <span style={{ fontSize: 11, color: levelColor, fontWeight: 700 }}>
                          {String(item.level || 'info').toUpperCase()}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtTime(item.ts)}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.text}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>

            <article
              ref={approvalsSectionRef}
              className="orion-panel"
              style={{
                minHeight: 280,
                scrollMarginTop: 92,
                ...(activeSection === 'approvals' ? focusedSectionStyle : null),
              }}
            >
              <div className="orion-panel-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <ClipboardCheck size={14} />
                Approvals
              </div>
              {runDetail?.pending_approval ? (
                <div
                  style={{
                    marginTop: 10,
                    display: 'grid',
                    gap: 8,
                    border: '1px solid var(--warning-border)',
                    background: 'var(--warning-bg)',
                    borderRadius: 12,
                    padding: '12px 14px',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--warning-fg)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Waiting for approval
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.55 }}>
                    {approvalDisplayText(
                      runDetail.pending_approval.prompt,
                      runDetail.pending_approval.metadata?.approval_labels,
                      runDetail.pending_approval.metadata?.approval_capabilities,
                      'Approval required.',
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link className="orion-btn orion-btn-ghost" style={{ minHeight: 30, paddingInline: 10 }} href="/approvals">
                      Open approval queue
                    </Link>
                    <button className="orion-btn orion-btn-ghost" style={{ minHeight: 30, paddingInline: 10 }} onClick={() => focusSection('timeline')}>
                      Review timeline first
                    </button>
                  </div>
                </div>
              ) : null}
              {approvalAudit.length === 0 ? (
                <div className="orion-panel-copy" style={{ marginTop: 10 }}>No approvals for this run.</div>
              ) : (
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="orion-chip">{approvalAudit.length} decision{approvalAudit.length === 1 ? '' : 's'}</span>
                    {latestApproval?.actor ? <span className="orion-chip">Latest by {latestApproval.actor}</span> : null}
                    {latestApproval?.stage ? <span className="orion-chip">Stage {latestApproval.stage}</span> : null}
                  </div>
                  <div
                    style={{
                      borderTop: '1px solid var(--border-default)',
                      borderBottom: '1px solid var(--border-default)',
                      overflowX: 'auto',
                    }}
                  >
                  <div
                    style={{
                      minWidth: 560,
                      display: 'grid',
                      gridTemplateColumns: '145px 130px 100px minmax(170px, 1.15fr) 100px minmax(160px, 1fr)',
                      gap: 8,
                      padding: '8px 10px',
                      borderBottom: '1px solid var(--border-default)',
                      fontSize: 10,
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontWeight: 800,
                    }}
                  >
                    <span>Time</span>
                    <span>Decision</span>
                    <span>Stage</span>
                    <span>Action</span>
                    <span>Actor</span>
                    <span>Note</span>
                  </div>
                  {approvalAudit.map((item) => (
                    <div
                      key={item.id}
                      className="orion-log-entry"
                      style={{
                        minWidth: 560,
                        display: 'grid',
                        gridTemplateColumns: '145px 130px 100px minmax(170px, 1.15fr) 100px minmax(160px, 1fr)',
                        gap: 8,
                        padding: '9px 10px',
                        borderBottom: '1px solid var(--border-default)',
                        alignItems: 'start',
                      }}
                    >
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtTime(item.ts)}</span>
                      <span style={{ fontSize: 12, color: item.decision.toLowerCase().includes('hold') ? 'var(--warning-fg)' : 'var(--text-primary)', fontWeight: 700 }}>
                        {formatApprovalDecisionLabel(item.decision)}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.stage || '--'}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {approvalDisplayText('', item.labels, item.capabilities, '--')}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.actor || '--'}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{compactText(item.note || '--', '--', 120)}</span>
                    </div>
                  ))}
                </div>
                </div>
              )}
            </article>
          </section>

          <section className="orion-grid-2">
            <article
              ref={screenshotsSectionRef}
              className="orion-panel"
              style={{
                minHeight: 220,
                scrollMarginTop: 92,
                ...(activeSection === 'screenshots' ? focusedSectionStyle : null),
              }}
            >
              <div className="orion-panel-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <ImageIcon size={14} />
                Screenshots
              </div>
              {screenshotArtifacts.length === 0 ? (
                <div className="orion-panel-copy" style={{ marginTop: 10 }}>No screenshots.</div>
              ) : (
                <div
                  style={{
                    marginTop: 10,
                    display: 'grid',
                    gap: 10,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  }}
                >
                  {screenshotArtifacts.map((item) => (
                    <article
                      key={item}
                      role="button"
                      tabIndex={0}
                      onClick={() => void openArtifactTarget(item)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          void openArtifactTarget(item);
                        }
                      }}
                      style={{
                        display: 'grid',
                        gap: 8,
                        padding: 10,
                        borderRadius: 14,
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-element)',
                      }}
                    >
                      <div
                        style={{
                          position: 'relative',
                          width: '100%',
                          aspectRatio: '16 / 10',
                          borderRadius: 10,
                          overflow: 'hidden',
                          border: '1px solid var(--border-default)',
                          background: 'var(--bg-panel)',
                        }}
                      >
                        <ArtifactImagePreview path={item} runtimeKey={runtimeApiKey} alt={item} />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{item}</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="orion-btn orion-btn-primary"
                          style={{ minHeight: 30, paddingInline: 10 }}
                          onClick={(event) => {
                            event.stopPropagation();
                            void openArtifactTarget(item);
                          }}
                        >
                          Open
                        </button>
                        {desktopBridge?.desktop && isLocalFileTarget(item) ? (
                          <button
                            className="orion-btn orion-btn-ghost"
                            style={{ minHeight: 30, paddingInline: 10 }}
                            onClick={(event) => {
                              event.stopPropagation();
                              void revealArtifactTarget(item);
                            }}
                          >
                            {revealLabel}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article
              ref={artifactsSectionRef}
              className="orion-panel"
              style={{
                minHeight: 220,
                scrollMarginTop: 92,
                ...(activeSection === 'artifacts' ? focusedSectionStyle : null),
              }}
            >
              <div className="orion-panel-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <FileSearch size={14} />
                Artifacts
              </div>
              {artifacts.length === 0 ? (
                <div className="orion-panel-copy" style={{ marginTop: 10 }}>No artifacts.</div>
              ) : (
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="orion-chip">{deliverableArtifacts.length} deliverable{deliverableArtifacts.length === 1 ? '' : 's'}</span>
                    <span className="orion-chip">{screenshotArtifacts.length} evidence</span>
                    <span className="orion-chip">{systemArtifacts.length} system</span>
                  </div>
                  <div
                    style={{
                      borderTop: '1px solid var(--border-default)',
                      borderBottom: '1px solid var(--border-default)',
                      overflowY: 'auto',
                      maxHeight: 320,
                    }}
                  >
                  {artifacts.map((item) => (
                    <div
                      key={item}
                      className="orion-log-entry"
                      style={{
                        padding: '9px 10px',
                        borderBottom: '1px solid var(--border-default)',
                        fontSize: 12,
                        wordBreak: 'break-all',
                      }}
                    >
                      <div style={{ display: 'grid', gap: 8 }}>
                        <div style={{ display: 'grid', gap: 4 }}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 700 }}>
                              {formatArtifactLabel(item)}
                            </span>
                            <span className="orion-chip" style={{ minHeight: 20, fontSize: 10, paddingInline: 7 }}>
                              {classifyArtifactForInspect(item)}
                            </span>
                          </div>
                          <div>
                          {/^https?:\/\//i.test(item) ? (
                            <a href={item} target="_blank" rel="noreferrer" style={{ color: '#c4b5fd' }}>
                              {item}
                            </a>
                          ) : (
                            item
                          )}
                          </div>
                        </div>
                        <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            className="orion-btn orion-btn-primary"
                            style={{ minHeight: 28, paddingInline: 10 }}
                            onClick={() => void openArtifactTarget(item)}
                          >
                            Open
                          </button>
                          {desktopBridge?.desktop && isLocalFileTarget(item) ? (
                            <button
                              className="orion-btn orion-btn-ghost"
                              style={{ minHeight: 28, paddingInline: 10 }}
                              onClick={() => void revealArtifactTarget(item)}
                            >
                              {revealLabel}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              )}
            </article>
          </section>
        </>
      )}
    </div>
  );
}
