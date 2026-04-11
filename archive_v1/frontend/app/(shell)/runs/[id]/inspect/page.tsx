'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
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
import { apiClient } from '@/lib/api-client';
import type { ComputerActionEventPayload, RunListItem } from '@shared/api-contract';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { Button } from '@/components/ui/button';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import { formatExecutionTargetLabel } from '@/lib/executionTargets';
import { hardKillRun } from '@/lib/api';
import { fetchRuntimeArtifactBlob } from '@/lib/runtimeArtifacts';
import { resolveSkillsByIds } from '@/lib/skills';
import { SINGLE_AGENT_MODE } from '@/lib/appFlags';
import { getLocalExecutionCapabilityTitle } from '@/lib/localExecutionCapabilities';
import { PageDialog } from '@/components/orion/page/PageDialog';
import { LocalCompanionRunPanel } from '@/components/orion/runs/LocalCompanionRunPanel';
import { RunLiveCockpitPanel } from '@/components/orion/runs/RunLiveCockpitPanel';
import { RunRemediationGuide, shouldShowRunRemediationGuide } from '@/components/orion/runs/RunRemediationGuide';
import { ApprovalRequestCard } from '@/components/orion/chat/ApprovalRequestCard';
import type { ChatApprovalRequestRecord } from '@/components/orion/chat/chatSchema';
import {
  buildRunLiveLogRows,
  buildRunLiveTimelineEvents,
  type RunLiveReplayEvent,
  type RunLiveStreamState,
} from '@/components/orion/runs/runLiveCockpitModel';
import { DESIGN_TOKENS, badgeStyle, bodyTextStyle, buttonStyle, mergeStyles, metaTextStyle, pageShellStyle, panelStyle, sectionTitleStyle } from '@/design-constraints';

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

type ReplayEvent = RunLiveReplayEvent;

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

type RunNodeState = {
  node_id?: string | null;
  label?: string | null;
  type?: string | null;
  variant?: string | null;
  status?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  duration_ms?: number | null;
  summary?: string | null;
  error?: string | null;
  child_run_id?: string | null;
  child_workflow_id?: string | null;
  waiting_for_approval?: boolean;
  input_preview?: string | null;
  output_preview?: string | null;
  detail?: unknown;
};

type RunNodeStatesPayload = {
  version?: number;
  graph_kind?: string | null;
  active_node_id?: string | null;
  final_node_id?: string | null;
  updated_at?: string | null;
  counts?: Record<string, number> | null;
  items?: RunNodeState[] | null;
};

type RunDiagnostics = {
  category?: string | null;
  headline?: string | null;
  summary?: string | null;
  next_step?: string | null;
  blocked_on?: string | null;
  failure_message?: string | null;
  failure_event?: string | null;
  scheduled?: boolean;
  schedule_id?: string | null;
  selected_target?: string | null;
  local_target?: boolean;
  local_status?: string | null;
  local_last_heartbeat_at?: string | null;
  browser_resume_supported?: boolean | null;
  local_execution_resume_supported?: boolean | null;
  manual_takeover_active?: boolean | null;
  resumed_after_restart?: boolean;
  retry_of_run_id?: string | null;
  retry_root_run_id?: string | null;
  retry_sequence?: number | null;
  archived?: boolean;
} | null;

type RunDetailPayload = {
  run_id?: string;
  status?: string;
  machine_id?: string | null;
  runtime_id?: string | null;
  interrupt_requested?: boolean;
  interrupt_requested_at?: string | null;
  interrupt_reason?: string | null;
  interrupt_scope?: string | null;
  execution_target_required_capabilities?: string[] | null;
  execution_target_missing_capabilities?: string[] | null;
  execution_target_busy_runtime_labels?: string[] | null;
  context?: {
    user_goal?: string;
    workspace_id?: string;
    metadata?: Record<string, unknown>;
  };
  pending_confirmation?: {
    approval_id?: string;
    prompt?: string;
    status?: string;
    expires_at?: string;
    scope?: string | null;
    reusable?: boolean | null;
    consequence?: string | null;
    actions?: string[] | null;
    target?: string | null;
    metadata?: {
      approval_labels?: string[];
      approval_capabilities?: string[];
    } | null;
  } | null;
  /** @deprecated compatibility alias; use `pending_confirmation`. */
  pending_approval?: {
    approval_id?: string;
    prompt?: string;
    status?: string;
    expires_at?: string;
    scope?: string | null;
    reusable?: boolean | null;
    consequence?: string | null;
    actions?: string[] | null;
    target?: string | null;
    metadata?: {
      approval_labels?: string[];
      approval_capabilities?: string[];
    } | null;
  } | null;
  result_data?: unknown;
  tool_policy_precheck?: {
    require_confirmation_count?: number;
    approval_required_count?: number;
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
  run_detail_contract?: {
    provider_model?: {
      requested_provider?: string | null;
      effective_provider?: string | null;
      requested_model?: string | null;
      effective_model?: string | null;
      provider_overridden?: boolean;
      model_overridden?: boolean;
      fallback_used?: boolean;
      fallback_reason?: string | null;
    } | null;
    approval_outcome?: {
      status?: string | null;
      label?: string | null;
    } | null;
    connector_mutation?: {
      binding?: {
        channel?: string | null;
        connector?: string | null;
        label?: string | null;
        identity_label?: string | null;
        routing_scope?: string | null;
      } | null;
      action?: Record<string, unknown> | null;
      execution_label?: string | null;
      action_label?: string | null;
      system_label?: string | null;
      target_label?: string | null;
      result_label?: string | null;
    } | null;
    evidence_items?: Array<{
      id?: string | null;
      label?: string | null;
      value?: string | null;
    }> | null;
  } | null;
  diagnostics?: RunDiagnostics;
  node_states?: RunNodeStatesPayload | null;
  tool_policy_audit?: Array<Record<string, unknown>> | null;
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

type ComputerActionView = {
  id: string;
  ts: string;
  mode: string;
  phase: string;
  stepNumber: number | null;
  stepTotal: number | null;
  tool: string;
  actionType: string;
  label: string;
  reason: string | null;
  detail: string | null;
  success: boolean | null;
  status: string | null;
  textSummary: string | null;
  filePath: string | null;
  url: string | null;
  error: string | null;
  x: number | null;
  y: number | null;
  confidence: number | null;
  certainty: string | null;
  retryCount: number | null;
  replanned: boolean;
  readinessState: string | null;
  readinessSummary: string | null;
  groundingSummary: string | null;
  recoveryStrategy: string | null;
};

type ReplayStepView = {
  id: string;
  order: number;
  stepNumber: number | null;
  stepTotal: number | null;
  ts: string;
  endTs: string | null;
  elapsedMs: number | null;
  tool: string;
  actionType: string;
  label: string;
  reason: string | null;
  detail: string | null;
  textSummary: string | null;
  textSummaryRedacted: boolean;
  success: boolean | null;
  status: string | null;
  phase: string;
  mode: string;
  error: string | null;
  x: number | null;
  y: number | null;
  screenshotPath: string | null;
  filePath: string | null;
  url: string | null;
  confidence: number | null;
  certainty: string | null;
  retryCount: number | null;
  replanned: boolean;
  readinessState: string | null;
  readinessSummary: string | null;
  groundingSummary: string | null;
  recoveryStrategy: string | null;
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

type StreamState = RunLiveStreamState;
const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'error', 'stopped', 'timeout', 'cancelled']);
type InspectFocusTarget = 'workflow' | 'timeline' | 'logs' | 'approvals' | 'replay' | 'screenshots' | 'artifacts' | null;
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
  fallback = 'Confirmation required to continue.',
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
  if (value === 'running' || value === 'executing' || value === 'starting') return 'var(--primary-base)';
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

function workflowNodeTone(status?: string): { color: string; label: string; background: string; border: string } {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'succeeded' || value === 'completed' || value === 'success') {
    return {
      color: 'var(--success-fg)',
      label: 'Succeeded',
      background: 'var(--success-bg)',
      border: 'var(--success-border)',
    };
  }
  if (value === 'failed' || value === 'error' || value === 'timeout') {
    return {
      color: 'var(--error-fg)',
      label: 'Failed',
      background: 'var(--error-bg)',
      border: 'var(--error-border)',
    };
  }
  if (value === 'running' || value === 'executing' || value === 'starting') {
    return {
      color: 'var(--primary-base)',
      label: 'Running',
      background: 'var(--primary-soft)',
      border: 'var(--primary-border-soft)',
    };
  }
  if (value === 'waiting_human' || value === 'waiting' || value === 'waiting_for_input') {
    return {
      color: 'var(--warning-fg)',
      label: 'Waiting',
      background: 'var(--warning-bg)',
      border: 'var(--warning-border)',
    };
  }
  if (value === 'skipped') {
    return {
      color: 'var(--text-secondary)',
      label: 'Skipped',
      background: 'var(--bg-element)',
      border: 'var(--border-default)',
    };
  }
  return {
    color: 'var(--text-tertiary)',
    label: value ? value.replace(/_/g, ' ') : '--',
    background: 'var(--bg-element)',
    border: 'var(--border-default)',
  };
}

function replayStepTone(step: ReplayStepView | null | undefined): { color: string; label: string; background: string; border: string } {
  if (!step) {
    return {
      color: 'var(--text-tertiary)',
      label: 'Unknown',
      background: 'var(--bg-element)',
      border: 'var(--border-default)',
    };
  }
  const phase = String(step.phase || '').trim().toLowerCase();
  const status = String(step.status || '').trim().toLowerCase();
  if (phase === 'failed' || status === 'failed' || status === 'error' || step.success === false) {
    return {
      color: 'var(--error-fg)',
      label: 'Failed',
      background: 'var(--error-bg)',
      border: 'var(--error-border)',
    };
  }
  if (phase === 'paused' || status === 'waiting_for_input' || step.mode === 'paused' || step.mode === 'takeover') {
    return {
      color: 'var(--warning-fg)',
      label: 'Paused',
      background: 'var(--warning-bg)',
      border: 'var(--warning-border)',
    };
  }
  if (phase === 'completed' || status === 'completed' || step.success === true) {
    return {
      color: 'var(--success-fg)',
      label: 'Completed',
      background: 'var(--success-bg)',
      border: 'var(--success-border)',
    };
  }
  if (phase === 'planned') {
    return {
      color: 'var(--primary-base)',
      label: 'Planned',
      background: 'var(--primary-soft)',
      border: 'var(--primary-border-soft)',
    };
  }
  return {
    color: 'var(--text-secondary)',
    label: phase || status || 'Recorded',
    background: 'var(--bg-element)',
    border: 'var(--border-default)',
  };
}

function formatConfidenceLabel(confidence?: number | null, certainty?: string | null): string | null {
  if (typeof confidence === 'number' && Number.isFinite(confidence)) {
    const certaintyLabel = String(certainty || '').trim();
    return `confidence ${(confidence * 100).toFixed(0)}%${certaintyLabel ? ` · ${certaintyLabel}` : ''}`;
  }
  const certaintyLabel = String(certainty || '').trim();
  return certaintyLabel ? `confidence ${certaintyLabel}` : null;
}

function normalizeInspectFocus(value: string | null): InspectFocusTarget {
  if (value === 'workflow' || value === 'timeline' || value === 'logs' || value === 'approvals' || value === 'replay' || value === 'screenshots' || value === 'artifacts') {
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
  if (normalized === 'approved' || normalized === 'allow' || normalized === 'proceed') return 'Confirmed';
  if (normalized === 'hold' || normalized === 'reject' || normalized === 'declined') return 'Declined';
  if (normalized === 'blocked' || normalized === 'denied' || normalized === 'escalated') return 'Blocked by policy';
  return normalized.replace(/_/g, ' ');
}

function formatRunDiagnosisCategory(value?: string | null): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Run diagnosis';
  if (normalized === 'approval_wait') return 'Blocked by confirmation';
  if (normalized === 'local_runtime_wait') return 'Waiting for machine capabilities';
  if (normalized === 'local_capacity_wait') return 'Waiting for machine capacity';
  if (normalized === 'resume_pending') return 'Queued to resume';
  if (normalized === 'local_queue') return 'Queued for local machine';
  if (normalized === 'local_running') return 'Running on local machine';
  if (normalized === 'failure') return 'Failure diagnosis';
  if (normalized === 'completed') return 'Completion summary';
  return normalized.replace(/_/g, ' ');
}

function formatRunDiagnosisLocalStatus(value?: string | null): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '--';
  if (normalized === 'waiting_for_runtime') return 'Waiting for the right machine';
  if (normalized === 'waiting_for_capacity') return 'Waiting for machine capacity';
  if (normalized === 'resuming_after_restart') return 'Queued to resume after restart';
  if (normalized === 'queued_local') return 'Queued for local machine';
  if (normalized === 'running_local') return 'Running on local machine';
  return normalized.replace(/_/g, ' ');
}

function formatWorkflowNodeKind(type?: string | null, variant?: string | null): string {
  const family = String(type || '').trim().toLowerCase();
  const kind = String(variant || '').trim().toLowerCase();
  if (family === 'trigger') {
    if (kind === 'connector_event') return 'Connector trigger';
    if (kind === 'schedule') return 'Schedule trigger';
    if (kind === 'webhook') return 'Webhook trigger';
    if (kind === 'workflow') return 'Workflow trigger';
    if (kind === 'file_watch') return 'File trigger';
    if (kind === 'manual') return 'Manual trigger';
    return 'Trigger';
  }
  if (family === 'agent') return 'Agent';
  if (family === 'tool') {
    if (kind === 'connector_action') return 'Connector action';
    if (kind === 'http') return 'HTTP tool';
    if (kind === 'browser') return 'Browser tool';
    if (kind === 'file') return 'File tool';
    if (kind === 'shell') return 'Shell tool';
    if (kind === 'document') return 'Document tool';
    if (kind === 'spreadsheet') return 'Spreadsheet tool';
    if (kind === 'code') return 'Code tool';
    return 'Tool';
  }
  if (family === 'decision') {
    if (kind === 'if_else') return 'If / else';
    if (kind === 'classifier') return 'Classifier';
    if (kind === 'field_router') return 'Field router';
    return 'Decision';
  }
  if (family === 'human') {
    if (kind === 'approval') return 'Confirmation';
    if (kind === 'review') return 'Review';
    if (kind === 'wait_for_reply') return 'Wait for reply';
    return 'Human step';
  }
  if (family === 'data') {
    if (kind === 'transform') return 'Transform';
    if (kind === 'compose') return 'Compose';
    if (kind === 'validate') return 'Validate';
    return 'Data step';
  }
  if (family === 'loop') {
    if (kind === 'for_each') return 'For Each';
    if (kind === 'while') return 'While';
    if (kind === 'repeat') return 'Repeat';
    return 'Loop';
  }
  if (family === 'subflow') return 'Subflow';
  return family || '--';
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

function ArtifactImagePreview({ path, alt }: { path: string; alt: string }) {
  const normalizedPath = String(path || '').trim();
  const [blobPreview, setBlobPreview] = useState<{ path: string; url: string }>({ path: '', url: '' });

  useEffect(() => {
    if (!normalizedPath || isHttpTarget(normalizedPath)) {
      return;
    }
    let active = true;
    let nextObjectUrl = '';
    void fetchRuntimeArtifactBlob(normalizedPath)
      .then((blob) => {
        nextObjectUrl = URL.createObjectURL(blob);
        if (active) {
          setBlobPreview((current) => {
            if (current.url && current.url !== nextObjectUrl) URL.revokeObjectURL(current.url);
            return { path: normalizedPath, url: nextObjectUrl };
          });
        }
        else URL.revokeObjectURL(nextObjectUrl);
      })
      .catch(() => {
        if (active) {
          setBlobPreview((current) => {
            if (current.url) URL.revokeObjectURL(current.url);
            return { path: normalizedPath, url: '' };
          });
        }
      });
    return () => {
      active = false;
      if (nextObjectUrl) {
        setBlobPreview((current) => (
          current.url === nextObjectUrl
            ? { path: normalizedPath, url: '' }
            : current
        ));
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [normalizedPath]);

  const objectUrl = !normalizedPath
    ? ''
    : isHttpTarget(normalizedPath)
      ? normalizedPath
      : blobPreview.path === normalizedPath
        ? blobPreview.url
        : '';

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
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Image
        src={objectUrl}
        alt={alt}
        unoptimized
        fill
        sizes="100vw"
        style={{ objectFit: 'cover', display: 'block' }}
      />
    </div>
  );
}

function ReplayScreenshotPreview({
  path,
  alt,
  marker,
}: {
  path: string;
  alt: string;
  marker?: { x: number | null; y: number | null } | null;
}) {
  const normalizedPath = String(path || '').trim();
  const [blobPreview, setBlobPreview] = useState<{ path: string; url: string }>({ path: '', url: '' });
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    if (!normalizedPath || isHttpTarget(normalizedPath)) {
      setNaturalSize({ width: 0, height: 0 });
      return;
    }
    let active = true;
    let nextObjectUrl = '';
    void fetchRuntimeArtifactBlob(normalizedPath)
      .then((blob) => {
        nextObjectUrl = URL.createObjectURL(blob);
        if (active) {
          setBlobPreview((current) => {
            if (current.url && current.url !== nextObjectUrl) URL.revokeObjectURL(current.url);
            return { path: normalizedPath, url: nextObjectUrl };
          });
        } else {
          URL.revokeObjectURL(nextObjectUrl);
        }
      })
      .catch(() => {
        if (active) {
          setBlobPreview((current) => {
            if (current.url) URL.revokeObjectURL(current.url);
            return { path: normalizedPath, url: '' };
          });
        }
      });
    return () => {
      active = false;
      if (nextObjectUrl) {
        setBlobPreview((current) => (current.url === nextObjectUrl ? { path: normalizedPath, url: '' } : current));
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [normalizedPath]);

  const objectUrl = !normalizedPath
    ? ''
    : isHttpTarget(normalizedPath)
      ? normalizedPath
      : blobPreview.path === normalizedPath
        ? blobPreview.url
        : '';

  const markerVisible = Boolean(
    objectUrl
    && marker
    && typeof marker.x === 'number'
    && typeof marker.y === 'number'
    && naturalSize.width > 0
    && naturalSize.height > 0
    && marker.x >= 0
    && marker.y >= 0
    && marker.x <= naturalSize.width
    && marker.y <= naturalSize.height,
  );
  const markerLeft = markerVisible ? `${((marker!.x as number) / naturalSize.width) * 100}%` : '50%';
  const markerTop = markerVisible ? `${((marker!.y as number) / naturalSize.height) * 100}%` : '50%';

  if (!objectUrl) {
    return (
      <div
        style={{
          minHeight: 320,
          display: 'grid',
          placeItems: 'center',
          color: 'var(--text-secondary)',
          fontSize: 12,
          background: 'var(--bg-element)',
        }}
      >
        Preview unavailable
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', background: 'var(--bg-panel)' }}>
      <img
        src={objectUrl}
        alt={alt}
        onLoad={(event) => {
          const target = event.currentTarget;
          setNaturalSize({ width: target.naturalWidth || 0, height: target.naturalHeight || 0 });
        }}
        style={{ display: 'block', width: '100%', height: 'auto' }}
      />
      {markerVisible ? (
        <>
          <div
            style={{
              position: 'absolute',
              left: markerLeft,
              top: markerTop,
              width: 34,
              height: 34,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              border: '3px solid rgba(59,130,246,0.95)',
              boxShadow: '0 0 0 8px rgba(59,130,246,0.18), 0 8px 22px rgba(15,23,42,0.24)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: markerLeft,
              top: markerTop,
              width: 2,
              height: 46,
              transform: 'translate(-50%, -50%)',
              background: 'rgba(59,130,246,0.82)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: markerLeft,
              top: markerTop,
              width: 46,
              height: 2,
              transform: 'translate(-50%, -50%)',
              background: 'rgba(59,130,246,0.82)',
              pointerEvents: 'none',
            }}
          />
        </>
      ) : null}
    </div>
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

function compactComputerActionDetail(record: Record<string, unknown>): string | null {
  const candidates = [
    record.detail,
    record.text_summary,
    record.textPreview,
    record.text_preview,
    record.output_preview,
    record.title,
    record.url,
    record.file_path,
    record.filePath,
    record.summary,
  ];
  for (const value of candidates) {
    const text = String(value || '').trim();
    if (text) return compactText(text, '--', 220);
  }
  return null;
}

function normalizeComputerActionView(
  payload: Record<string, unknown>,
  options: {
    fallbackId: string;
    fallbackTs: string;
  },
): ComputerActionView | null {
  const { fallbackId, fallbackTs } = options;
  const raw = payload as ComputerActionEventPayload & Record<string, unknown>;
  const label = String(raw.label || raw.reason || raw.detail || raw.action_type || raw.tool || '').trim();
  if (!label) return null;
  const stepNumber = typeof raw.step_number === 'number' && Number.isFinite(raw.step_number) ? raw.step_number : null;
  const stepTotal = typeof raw.step_total === 'number' && Number.isFinite(raw.step_total) ? raw.step_total : null;
  const success = typeof raw.success === 'boolean' ? raw.success : null;
  const x = typeof raw.x === 'number' && Number.isFinite(raw.x) ? raw.x : null;
  const y = typeof raw.y === 'number' && Number.isFinite(raw.y) ? raw.y : null;
  const confidence = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence) ? raw.confidence : null;
  const retryCount = typeof raw.retry_count === 'number' && Number.isFinite(raw.retry_count) ? raw.retry_count : null;
  return {
    id: String(raw.id || fallbackId),
    ts: String(raw.ts || fallbackTs || ''),
    mode: String(raw.mode || 'acting').trim().toLowerCase() || 'acting',
    phase: String(raw.phase || 'completed').trim().toLowerCase() || 'completed',
    stepNumber,
    stepTotal,
    tool: String(raw.tool || 'computer_control').trim() || 'computer_control',
    actionType: String(raw.action_type || raw.tool || 'action').trim().toLowerCase() || 'action',
    label,
    reason: String(raw.reason || '').trim() || null,
    detail: compactComputerActionDetail(raw),
    success,
    status: String(raw.status || '').trim().toLowerCase() || null,
    textSummary: String(raw.text_summary || '').trim() || null,
    filePath: String(raw.file_path || '').trim() || null,
    url: String(raw.url || '').trim() || null,
    error: String(raw.error || '').trim() || null,
    x,
    y,
    confidence,
    certainty: String(raw.certainty || '').trim().toLowerCase() || null,
    retryCount,
    replanned: Boolean(raw.replanned),
    readinessState: String(raw.readiness_state || '').trim().toLowerCase() || null,
    readinessSummary: String(raw.readiness_summary || '').trim() || null,
    groundingSummary: String(raw.grounding_summary || '').trim() || null,
    recoveryStrategy: String(raw.recovery_strategy || '').trim().toLowerCase() || null,
  };
}

function parseTimestampMs(value?: string | null): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function replayPhaseRank(value?: string | null): number {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'failed') return 4;
  if (normalized === 'paused') return 3;
  if (normalized === 'completed') return 2;
  if (normalized === 'planned') return 1;
  return 0;
}

function isImageArtifactPath(value?: string | null): boolean {
  return /\.(png|jpg|jpeg|webp|gif)$/i.test(String(value || '').trim());
}

function actionFingerprintForReplay(item: ComputerActionView): string {
  if (typeof item.stepNumber === 'number') {
    return `step:${item.stepNumber}:${item.tool}:${item.actionType}`;
  }
  return `${item.ts}:${item.tool}:${item.actionType}:${item.label}`;
}

function redactReplayTextSummary(
  textSummary: string | null,
  actionType: string,
  toolPolicyAudit: Array<Record<string, unknown>> | null | undefined,
): { value: string | null; redacted: boolean } {
  const normalized = String(textSummary || '').trim();
  if (!normalized) return { value: null, redacted: false };
  if (normalized.includes('***redacted***')) return { value: '***redacted***', redacted: true };
  const sensitiveTyping = String(actionType || '').trim().toLowerCase() === 'type'
    && Array.isArray(toolPolicyAudit)
    && toolPolicyAudit.some((item) => {
      if (!item || typeof item !== 'object') return false;
      const toolId = String(item.tool_id || '').trim().toLowerCase();
      return toolId === 'computer_control.type' && Boolean(item.is_sensitive);
    });
  if (sensitiveTyping) return { value: '***redacted***', redacted: true };
  return { value: normalized, redacted: false };
}

function chooseReplayScreenshotPath(
  action: ComputerActionView,
  order: number,
  screenshotEntries: Array<{ path: string; stepNumber: number | null; order: number }>,
): string | null {
  if (isImageArtifactPath(action.filePath)) return action.filePath;
  if (screenshotEntries.length === 0) return null;
  if (typeof action.stepNumber === 'number') {
    const exact = screenshotEntries.find((entry) => entry.stepNumber === action.stepNumber);
    if (exact) return exact.path;
    const preceding = [...screenshotEntries].reverse().find((entry) => typeof entry.stepNumber === 'number' && entry.stepNumber <= action.stepNumber!);
    if (preceding) return preceding.path;
    const following = screenshotEntries.find((entry) => typeof entry.stepNumber === 'number' && entry.stepNumber >= action.stepNumber!);
    if (following) return following.path;
  }
  return screenshotEntries[Math.min(order, screenshotEntries.length - 1)]?.path || screenshotEntries[0]?.path || null;
}

function buildReplaySteps(
  computerActionEvents: ComputerActionView[],
  localExecutionSteps: LocalExecutionStepView[],
  screenshotArtifacts: string[],
  toolPolicyAudit: Array<Record<string, unknown>> | null | undefined,
): ReplayStepView[] {
  const screenshotEntries: Array<{ path: string; stepNumber: number | null; order: number }> = [];
  const seenPaths = new Set<string>();
  localExecutionSteps.forEach((step, index) => {
    const artifact = String(step.artifact_file_path || '').trim();
    if (!artifact || seenPaths.has(artifact) || !isImageArtifactPath(artifact)) return;
    screenshotEntries.push({ path: artifact, stepNumber: typeof step.step_number === 'number' ? step.step_number : null, order: index });
    seenPaths.add(artifact);
  });
  screenshotArtifacts.forEach((path, index) => {
    const normalized = String(path || '').trim();
    if (!normalized || seenPaths.has(normalized)) return;
    screenshotEntries.push({ path: normalized, stepNumber: null, order: localExecutionSteps.length + index });
    seenPaths.add(normalized);
  });

  const grouped = new Map<string, { order: number; items: ComputerActionView[] }>();
  computerActionEvents.forEach((item, index) => {
    const key = actionFingerprintForReplay(item);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.items.push(item);
      return;
    }
    grouped.set(key, { order: index, items: [item] });
  });

  return Array.from(grouped.values())
    .sort((left, right) => {
      const leftStep = left.items[0]?.stepNumber;
      const rightStep = right.items[0]?.stepNumber;
      if (typeof leftStep === 'number' && typeof rightStep === 'number' && leftStep !== rightStep) {
        return leftStep - rightStep;
      }
      const leftTs = parseTimestampMs(left.items[0]?.ts);
      const rightTs = parseTimestampMs(right.items[0]?.ts);
      if (leftTs != null && rightTs != null && leftTs !== rightTs) return leftTs - rightTs;
      return left.order - right.order;
    })
    .map((group, order) => {
      const sorted = [...group.items].sort((left, right) => {
        const leftTs = parseTimestampMs(left.ts);
        const rightTs = parseTimestampMs(right.ts);
        if (leftTs != null && rightTs != null && leftTs !== rightTs) return leftTs - rightTs;
        return replayPhaseRank(left.phase) - replayPhaseRank(right.phase);
      });
      const first = sorted[0];
      const resolved = [...sorted].sort((left, right) => replayPhaseRank(right.phase) - replayPhaseRank(left.phase))[0] || first;
      const firstTs = parseTimestampMs(first.ts);
      const lastTs = parseTimestampMs(sorted[sorted.length - 1]?.ts || resolved.ts);
      const elapsedMs = firstTs != null && lastTs != null && lastTs >= firstTs ? lastTs - firstTs : null;
      const redactedText = redactReplayTextSummary(resolved.textSummary || first.textSummary, resolved.actionType, toolPolicyAudit);
      return {
        id: resolved.id || `${actionFingerprintForReplay(resolved)}:${order}`,
        order,
        stepNumber: resolved.stepNumber ?? first.stepNumber,
        stepTotal: resolved.stepTotal ?? first.stepTotal,
        ts: first.ts || resolved.ts,
        endTs: sorted.length > 1 ? (sorted[sorted.length - 1]?.ts || resolved.ts || null) : null,
        elapsedMs,
        tool: resolved.tool || first.tool,
        actionType: resolved.actionType || first.actionType,
        label: resolved.label || first.label,
        reason: resolved.reason || first.reason,
        detail: resolved.detail || first.detail,
        textSummary: redactedText.value,
        textSummaryRedacted: redactedText.redacted,
        success: resolved.success ?? first.success ?? null,
        status: resolved.status || first.status,
        phase: resolved.phase || first.phase,
        mode: resolved.mode || first.mode,
        error: resolved.error || first.error,
        x: resolved.x ?? first.x ?? null,
        y: resolved.y ?? first.y ?? null,
        screenshotPath: chooseReplayScreenshotPath(resolved, order, screenshotEntries),
        filePath: resolved.filePath || first.filePath,
        url: resolved.url || first.url,
        confidence: resolved.confidence ?? first.confidence ?? null,
        certainty: resolved.certainty || first.certainty || null,
        retryCount: resolved.retryCount ?? first.retryCount ?? null,
        replanned: Boolean(resolved.replanned || first.replanned),
        readinessState: resolved.readinessState || first.readinessState || null,
        readinessSummary: resolved.readinessSummary || first.readinessSummary || null,
        groundingSummary: resolved.groundingSummary || first.groundingSummary || null,
        recoveryStrategy: resolved.recoveryStrategy || first.recoveryStrategy || null,
      } satisfies ReplayStepView;
    });
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

function extractLocalExecutionActions(...sources: unknown[]): ComputerActionView[] {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const record = source as Record<string, unknown>;
    if (String(record.pack_id || '').trim() !== 'local-execution-v1') continue;
    const outputs = record.outputs;
    if (!outputs || typeof outputs !== 'object') continue;
    const actions = (outputs as Record<string, unknown>).actions;
    if (!Array.isArray(actions)) continue;
    return actions.reduce<ComputerActionView[]>((acc, item, index) => {
      if (!item || typeof item !== 'object') return acc;
      const row = item as Record<string, unknown>;
      const tool = String(row.tool || '').trim().toLowerCase();
      if (!['computer_control', 'screenshot.capture', 'browser_automation.interactive'].includes(tool)) return acc;
      const normalized = normalizeComputerActionView(
        {
          tool,
          action_type: row.computer_action || row.mode || row.action || tool,
          label: row.summary || row.title || row.action || tool,
          reason: row.summary || null,
          detail: compactComputerActionDetail(row),
          status: row.status || null,
          phase: String(row.status || '').trim().toLowerCase() === 'waiting_for_input' ? 'paused' : 'completed',
          mode: String(row.status || '').trim().toLowerCase() === 'waiting_for_input' ? 'paused' : 'acting',
          step_number: row.step_number,
          step_total: null,
          text_summary: row.text_preview || null,
          file_path: row.file_path || null,
          url: row.url || null,
          success: String(row.status || '').trim().toLowerCase() !== 'failed',
          confidence: row.confidence ?? null,
          certainty: row.certainty ?? null,
          retry_count: row.retry_count ?? null,
          replanned: row.replanned ?? null,
          readiness_state: row.readiness_state ?? null,
          readiness_summary: row.readiness_summary ?? null,
          grounding_summary: row.grounding_summary ?? null,
          recovery_strategy: row.recovery_strategy ?? null,
        },
        {
          fallbackId: `local-action:${tool}:${index}`,
          fallbackTs: '',
        },
      );
      if (normalized) acc.push(normalized);
      return acc;
    }, []);
  }
  return [];
}

function RunInspectPageContent() {
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
  const [activeSection, setActiveSection] = useState<InspectSectionTarget>('timeline');
  const [delegateRole, setDelegateRole] = useState<string>('support');
  const [delegateGoal, setDelegateGoal] = useState('');
  const [delegateNote, setDelegateNote] = useState('');
  const [approvalBusy, setApprovalBusy] = useState<'Proceed' | 'Hold' | null>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [takeoverBusy, setTakeoverBusy] = useState(false);
  const [hardKillBusy, setHardKillBusy] = useState(false);
  const [hardKillPending, setHardKillPending] = useState(false);
  const [hardKillDialogOpen, setHardKillDialogOpen] = useState(false);
  const [delegating, setDelegating] = useState(false);
  const [autoDelegating, setAutoDelegating] = useState(false);
  const [retryingDelegation, setRetryingDelegation] = useState(false);
  const [delegateError, setDelegateError] = useState<string | null>(null);
  const [delegateNotice, setDelegateNotice] = useState<string | null>(null);
  const [selectedReplayStepId, setSelectedReplayStepId] = useState<string | null>(null);
  const modalPortalTarget = typeof document !== 'undefined' ? document.body : null;
  const workflowSectionRef = useRef<HTMLElement | null>(null);
  const timelineSectionRef = useRef<HTMLElement | null>(null);
  const approvalsSectionRef = useRef<HTMLElement | null>(null);
  const replaySectionRef = useRef<HTMLElement | null>(null);
  const screenshotsSectionRef = useRef<HTMLElement | null>(null);
  const artifactsSectionRef = useRef<HTMLElement | null>(null);
  const desktopBridge = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const scopedWindow = window as typeof window & { orionDesktop?: DesktopBridge; empyralisDesktop?: DesktopBridge };
    return scopedWindow.orionDesktop || scopedWindow.empyralisDesktop || null;
  }, []);

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
      const [historyPayload, runPayload, approvalsRes] = await Promise.all([
        apiClient.listRuns({ workspace_id: 'default', limit: 200 }).catch(() => ({ items: [] })),
        apiClient.getRunDetail(runId).catch(() => null),
        fetch('/api/approvals/audit?limit=200', { cache: 'no-store' }),
      ]);

      const historyItems = Array.isArray(historyPayload?.items) ? historyPayload.items : [];
      const found = historyItems.find((item) => String((item as RunListItem)?.run_id || '').trim() === runId) || null;
      setHistoryItem(found as HistoryItem | null);

      if (runPayload) {
        setRunDetail(runPayload as RunDetailPayload);
      }

      if (approvalsRes.ok) {
        const approvalsPayload = await approvalsRes.json();
        setApprovalAudit(mapApprovalAudit(approvalsPayload));
      }
    } catch {
      // Keep inspect page stable on transient sync errors.
    }
  }, [mapApprovalAudit, runId]);

  const load = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    setError(null);
    setStreamError(null);
    setLiveEvents([]);
    try {
      await ensureControlPlaneSession();
      const [historyPayload, runPayload, approvalsRes, replayPayload] = await Promise.all([
        apiClient.listRuns({ workspace_id: 'default', limit: 200 }),
        apiClient.getRunDetail(runId),
        fetch('/api/approvals/audit?limit=200', { cache: 'no-store' }),
        apiClient.getRunReplay(runId).catch(() => ({ item: null })),
      ]);
      const approvalsPayload = approvalsRes.ok ? await approvalsRes.json() : { items: [] };
      setReplayItem((replayPayload as ReplayPayload)?.item || null);

      const historyItems = Array.isArray(historyPayload?.items) ? historyPayload.items : [];
      const found = historyItems.find((item) => String((item as RunListItem)?.run_id || '').trim() === runId) || null;
      setHistoryItem(found as HistoryItem | null);

      setRunDetail((runPayload as RunDetailPayload) || null);
      setApprovalAudit(mapApprovalAudit(approvalsPayload));
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load transparency data.');
    } finally {
      setLoading(false);
    }
  }, [mapApprovalAudit, runId]);

  useEffect(() => {
    void load();
  }, [load]);

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
    setActiveSection(focusTarget);
  }, [focusTarget]);

  const focusSection = useCallback((target: InspectSectionTarget) => {
    setActiveSection(target);
    const targetRef =
      target === 'workflow'
        ? workflowSectionRef
        : target === 'approvals'
        ? approvalsSectionRef
        : target === 'replay'
        ? replaySectionRef
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
      await ensureControlPlaneSession();
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
  }, [delegateGoal, delegateNote, delegateRole, load, runId]);

  const handleAutoDelegate = useCallback(async () => {
    if (!runId) return;
    setAutoDelegating(true);
    setDelegateError(null);
    setDelegateNotice(null);
    try {
      await ensureControlPlaneSession();
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/delegate/auto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
  }, [delegateNote, load, runId]);

  const handleRetryFailedDelegation = useCallback(async () => {
    if (!runId) return;
    setRetryingDelegation(true);
    setDelegateError(null);
    setDelegateNotice(null);
    try {
      await ensureControlPlaneSession();
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/delegate/retry-failed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
  }, [delegateNote, failedDelegationRunIds, load, runId]);

  const handleResolveApproval = useCallback(async (decision: 'Proceed' | 'Hold') => {
    const pending = runDetail?.pending_confirmation ?? runDetail?.pending_approval ?? null;
    if (!runId || !pending?.approval_id) return;
    setApprovalBusy(decision);
    setDelegateError(null);
    setDelegateNotice(null);
    try {
      await ensureControlPlaneSession();
      const response = await fetch('/api/approvals/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId,
          approvalId: pending.approval_id,
          decision,
          note: 'Resolved from Run Inspect',
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(payload?.detail || 'Failed to resolve this confirmation.');
      }
      setDelegateNotice(decision === 'Proceed' ? 'Confirmed. The run can continue.' : 'Declined. The run will stay blocked.');
      await load();
    } catch (nextError: unknown) {
      setDelegateError(nextError instanceof Error ? nextError.message : 'Failed to resolve this confirmation.');
    } finally {
      setApprovalBusy(null);
    }
  }, [load, runDetail?.pending_approval, runDetail?.pending_confirmation, runId]);

  const handleResumeRun = useCallback(async () => {
    if (!runId) return;
    setResumeBusy(true);
    setDelegateError(null);
    setDelegateNotice(null);
    try {
      await ensureControlPlaneSession();
      const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/resume`, { method: 'POST' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(payload?.detail || 'Failed to resume this run.');
      }
      setDelegateNotice('Resume requested. The run is re-entering execution from its saved checkpoint.');
      await load();
    } catch (nextError: unknown) {
      setDelegateError(nextError instanceof Error ? nextError.message : 'Failed to resume this run.');
    } finally {
      setResumeBusy(false);
    }
  }, [load, runId]);

  const handleTakeOverRun = useCallback(async () => {
    if (!runId) return;
    setTakeoverBusy(true);
    setDelegateError(null);
    setDelegateNotice(null);
    try {
      await ensureControlPlaneSession();
      const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/pause`, { method: 'POST' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(payload?.detail || 'Failed to take over this run.');
      }
      setDelegateNotice('Control handed back to you. The run is paused for manual takeover.');
      await load();
    } catch (nextError: unknown) {
      setDelegateError(nextError instanceof Error ? nextError.message : 'Failed to take over this run.');
    } finally {
      setTakeoverBusy(false);
    }
  }, [load, runId]);

  const handleHardKillRun = useCallback(async () => {
    if (!runId) return;
    setHardKillBusy(true);
    setHardKillPending(true);
    setHardKillDialogOpen(false);
    setDelegateError(null);
    setDelegateNotice(null);
    try {
      await hardKillRun(runId, 'Hard interrupt requested from the run cockpit.');
      setDelegateNotice('Hard interrupt requested. The run is being stopped immediately.');
      await refreshRunState();
    } catch (nextError: unknown) {
      setHardKillPending(false);
      setDelegateError(nextError instanceof Error ? nextError.message : 'Failed to hard kill this run.');
    } finally {
      setHardKillBusy(false);
    }
  }, [refreshRunState, runId]);

  const timelineEvents = useMemo(
    () => buildRunLiveTimelineEvents(replayItem?.events, liveEvents),
    [liveEvents, replayItem?.events],
  );

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
  const localExecutionActions = useMemo(
    () => extractLocalExecutionActions(runDetail?.result_data, replayItem?.result_data),
    [replayItem?.result_data, runDetail?.result_data],
  );

  const screenshotArtifacts = useMemo(
    () => artifacts.filter((item) => /\.(png|jpg|jpeg|webp|gif)$/i.test(item) || /screenshot/i.test(item)),
    [artifacts],
  );
  const liveScreenshotArtifact = useMemo(() => {
    if (screenshotArtifacts.length > 0) return screenshotArtifacts[0];
    const stepArtifact = localExecutionSteps.find((item) => typeof item.artifact_file_path === 'string' && item.artifact_file_path.trim().length > 0);
    return stepArtifact?.artifact_file_path || null;
  }, [localExecutionSteps, screenshotArtifacts]);
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
  const detailContract = runDetail?.run_detail_contract ?? null;
  const contractProviderModel = detailContract?.provider_model ?? null;
  const contractApprovalOutcome = detailContract?.approval_outcome ?? null;
  const contractConnectorMutation = detailContract?.connector_mutation ?? null;
  const contractEvidenceItems = Array.isArray(detailContract?.evidence_items)
    ? detailContract.evidence_items.filter(
        (item): item is { id?: string | null; label?: string | null; value?: string | null } =>
          !!item && typeof item === 'object' && (String(item.label || '').trim().length > 0 || String(item.value || '').trim().length > 0),
      )
    : [];
  const effectiveAgentRole = String(historyItem?.agent_role || runDetail?.agent_role || '').trim();
  const canDelegate = !singleAgentMode && effectiveAgentRole === 'orchestrator';
  const specialistAgentOptions = AGENT_ROLE_OPTIONS.filter((item) => item.id !== 'orchestrator');
  const connectorBinding = contractConnectorMutation?.binding || null;
  const computerActionEvents = useMemo(() => {
    const seen = new Set<string>();
    const combined: ComputerActionView[] = [];
    const pushUnique = (entry: ComputerActionView) => {
      const identity = entry.id || `${entry.ts}|${entry.tool}|${entry.actionType}|${entry.label}|${entry.stepNumber ?? ''}`;
      if (seen.has(identity)) return;
      seen.add(identity);
      combined.push(entry);
    };
    timelineEvents.forEach((item, index) => {
      if (String(item.event || '').trim().toLowerCase() !== 'computer_action' || !item.rawData) return;
      const normalized = normalizeComputerActionView(item.rawData, {
        fallbackId: `${item.id}:computer_action:${index}`,
        fallbackTs: item.ts,
      });
      if (normalized) pushUnique(normalized);
    });
    localExecutionActions.forEach((item) => pushUnique(item));
    return combined;
  }, [localExecutionActions, timelineEvents]);
  const replaySteps = useMemo(
    () => buildReplaySteps(computerActionEvents, localExecutionSteps, screenshotArtifacts, runDetail?.tool_policy_audit),
    [computerActionEvents, localExecutionSteps, runDetail?.tool_policy_audit, screenshotArtifacts],
  );
  useEffect(() => {
    if (replaySteps.length === 0) {
      setSelectedReplayStepId(null);
      return;
    }
    if (!selectedReplayStepId || !replaySteps.some((item) => item.id === selectedReplayStepId)) {
      setSelectedReplayStepId(replaySteps[replaySteps.length - 1]?.id || null);
    }
  }, [replaySteps, selectedReplayStepId]);
  const selectedReplayStep = useMemo(
    () => replaySteps.find((item) => item.id === selectedReplayStepId) || replaySteps[replaySteps.length - 1] || null,
    [replaySteps, selectedReplayStepId],
  );
  const selectedReplayIndex = selectedReplayStep ? replaySteps.findIndex((item) => item.id === selectedReplayStep.id) : -1;
  const canSelectPreviousReplayStep = selectedReplayIndex > 0;
  const canSelectNextReplayStep = selectedReplayIndex >= 0 && selectedReplayIndex < replaySteps.length - 1;
  const latestComputerAction = computerActionEvents.length > 0 ? computerActionEvents[computerActionEvents.length - 1] : null;
  const recentComputerActions = useMemo(
    () => [...computerActionEvents].slice(-8).reverse(),
    [computerActionEvents],
  );
  const localExecutionCheckpoint = useMemo(() => {
    const resultData = runDetail?.result_data;
    if (resultData && typeof resultData === 'object') {
      const checkpoint = (resultData as Record<string, unknown>).local_execution_checkpoint;
      if (checkpoint && typeof checkpoint === 'object') return checkpoint as Record<string, unknown>;
    }
    return null;
  }, [runDetail?.result_data]);
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
      const blob = await fetchRuntimeArtifactBlob(normalized);
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
  }, [desktopBridge]);
  const artifactWorkspaceHref = useCallback((targetPath: string) => {
    const normalized = String(targetPath || '').trim();
    if (!normalized) return '/artifacts';
    return `/artifacts?artifactPath=${encodeURIComponent(normalized)}`;
  }, []);
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
  const pendingConfirmation = runDetail?.pending_confirmation ?? runDetail?.pending_approval ?? null;
  const runDiagnostics = runDetail?.diagnostics ?? null;
  const primarySummary = useMemo(() => {
    const resultSummary = compactText(String(historyItem?.result_summary || '').trim(), '', 220);
    if (resultSummary) return resultSummary;
    const replayResult = replayItem?.result_data;
    if (replayResult && typeof replayResult === 'object') {
      const record = replayResult as Record<string, unknown>;
      const summary = compactText(String(record.summary || record.message || record.result_summary || '').trim(), '', 220);
      if (summary) return summary;
    }
    if (pendingConfirmation?.prompt) {
      return approvalDisplayText(
        pendingConfirmation.prompt,
        pendingConfirmation.metadata?.approval_labels,
        pendingConfirmation.metadata?.approval_capabilities,
        'Waiting for a decision to continue.',
      );
    }
    return 'No result summary recorded yet.';
  }, [
    historyItem?.result_summary,
    replayItem?.result_data,
    pendingConfirmation?.metadata?.approval_capabilities,
    pendingConfirmation?.metadata?.approval_labels,
    pendingConfirmation?.prompt,
  ]);
  const outcomeToneColor =
    effectiveRunStatus === 'completed' || effectiveRunStatus === 'success'
      ? 'var(--success-fg)'
      : effectiveRunStatus === 'failed' || effectiveRunStatus === 'error' || effectiveRunStatus === 'timeout'
      ? 'var(--error-fg)'
      : effectiveRunStatus === 'waiting_for_input' || effectiveRunStatus === 'waiting'
      ? 'var(--warning-fg)'
      : 'var(--primary-base)';
  const latestApproval = approvalAudit[0] ?? null;
  const latestArtifact = deliverableArtifacts[0] || screenshotArtifacts[0] || artifacts[0] || null;
  const diagnosisRows = useMemo(() => {
    if (!runDiagnostics) return [];
    const rows: Array<{ label: string; value: string }> = [];
    if (runDiagnostics.blocked_on) {
      rows.push({
        label: 'Blocked on',
        value: formatRunDiagnosisCategory(runDiagnostics.category),
      });
    }
    if (runDiagnostics.local_target || runDiagnostics.local_status) {
      rows.push({
        label: 'Local execution',
        value: formatRunDiagnosisLocalStatus(runDiagnostics.local_status),
      });
    }
    if (runDiagnostics.local_last_heartbeat_at) {
      rows.push({
        label: 'Last machine heartbeat',
        value: fmtTime(runDiagnostics.local_last_heartbeat_at),
      });
    }
    if (runDiagnostics.scheduled) {
      rows.push({
        label: 'Started by schedule',
        value: runDiagnostics.schedule_id || 'Yes',
      });
    }
    if (typeof runDiagnostics.retry_sequence === 'number' || runDiagnostics.retry_of_run_id) {
      rows.push({
        label: 'Retry lineage',
        value: runDiagnostics.retry_of_run_id
          ? `Retry ${Math.max(1, Number(runDiagnostics.retry_sequence || 1))} of ${runDiagnostics.retry_of_run_id}`
          : `Retry ${Math.max(1, Number(runDiagnostics.retry_sequence || 1))}`,
      });
    }
    if (runDiagnostics.resumed_after_restart) {
      rows.push({
        label: 'Recovery',
        value: runDiagnostics.browser_resume_supported
          ? 'Resume queued from saved checkpoint'
          : 'Resume queued after runtime restart',
      });
    }
    if (runDiagnostics.failure_event) {
      rows.push({
        label: 'Failure source',
        value: runDiagnostics.failure_event.replace(/_/g, ' '),
      });
    }
    return rows;
  }, [runDiagnostics]);
  const inspectRequiredCapabilities = useMemo(
    () => Array.isArray(runDetail?.execution_target_required_capabilities)
      ? runDetail.execution_target_required_capabilities.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
    [runDetail?.execution_target_required_capabilities],
  );
  const inspectMissingCapabilities = useMemo(
    () => Array.isArray(runDetail?.execution_target_missing_capabilities)
      ? runDetail.execution_target_missing_capabilities.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
    [runDetail?.execution_target_missing_capabilities],
  );
  const inspectBusyRuntimeLabels = useMemo(
    () => Array.isArray(runDetail?.execution_target_busy_runtime_labels)
      ? runDetail.execution_target_busy_runtime_labels.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
    [runDetail?.execution_target_busy_runtime_labels],
  );
  const localExecutionResumeSupported = Boolean(
    runDiagnostics?.local_execution_resume_supported
    || localExecutionCheckpoint
    || (runDetail?.result_data && typeof runDetail.result_data === 'object' && Boolean((runDetail.result_data as Record<string, unknown>).resume_available)),
  );
  const interruptRequested = Boolean(runDetail?.interrupt_requested || hardKillPending);
  const targetMachineLabel = useMemo(() => {
    const machineId = String(runDetail?.machine_id || '').trim();
    const runtimeId = String(runDetail?.runtime_id || '').trim();
    if (machineId && runtimeId) return `${machineId} · ${runtimeId}`;
    return machineId || runtimeId || 'Awaiting runtime assignment';
  }, [runDetail?.machine_id, runDetail?.runtime_id]);
  const executionPlacementLabel = useMemo(() => {
    const selected = String(historyItem?.execution_target_selected || runDiagnostics?.selected_target || '').trim();
    const requested = String(historyItem?.execution_target_requested || '').trim();
    if (selected) return formatExecutionTargetLabel(selected);
    if (requested) return `${formatExecutionTargetLabel(requested)} requested`;
    return 'Automatic placement';
  }, [historyItem?.execution_target_requested, historyItem?.execution_target_selected, runDiagnostics?.selected_target]);
  const childLineageSummary = useMemo(() => {
    if (delegationSummary) {
      const active = Number(delegationSummary.active_children || 0);
      const waiting = Number(delegationSummary.waiting_children || 0);
      const failed = Number(delegationSummary.failed_children || 0);
      const total = Number(delegationSummary.total_children || 0);
      return {
        headline: `${total} child ${total === 1 ? 'agent' : 'agents'}`,
        detail:
          [
            active > 0 ? `${active} active` : null,
            waiting > 0 ? `${waiting} waiting` : null,
            failed > 0 ? `${failed} failed` : null,
          ].filter(Boolean).join(' · ') || 'No delegated branches are running.',
      };
    }
    if (childRuns.length > 0) {
      return {
        headline: `${childRuns.length} child ${childRuns.length === 1 ? 'agent' : 'agents'}`,
        detail: 'Delegated branches are attached to this orchestration.',
      };
    }
    return {
      headline: 'No child agents',
      detail: 'Sage has not delegated this run to any specialist yet.',
    };
  }, [childRuns.length, delegationSummary]);
  const pendingApprovalRecord = useMemo<ChatApprovalRequestRecord | null>(() => {
    if (!pendingConfirmation?.approval_id) return null;
    return {
      id: pendingConfirmation.approval_id,
      approvalId: pendingConfirmation.approval_id,
      runId,
      prompt: pendingConfirmation.prompt || 'Approval required to continue this run.',
      labels: Array.isArray(pendingConfirmation.metadata?.approval_labels) ? pendingConfirmation.metadata.approval_labels : [],
      capabilities: Array.isArray(pendingConfirmation.metadata?.approval_capabilities) ? pendingConfirmation.metadata.approval_capabilities : [],
      actions: Array.isArray(pendingConfirmation.actions)
        ? pendingConfirmation.actions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [],
      target: pendingConfirmation.target || null,
      scope: 'once',
      reusable: Boolean(pendingConfirmation.reusable),
      consequence: pendingConfirmation.consequence || 'The run will remain blocked until an explicit decision is recorded.',
      resolution: 'waiting',
    };
  }, [pendingConfirmation, runId]);
  const canResumeRun = effectiveRunStatus === 'waiting_for_input'
    && !pendingConfirmation?.approval_id
    && Boolean(runDiagnostics?.browser_resume_supported || localExecutionResumeSupported);
  const canTakeOverRun = !TERMINAL_RUN_STATUSES.has(effectiveRunStatus)
    && effectiveRunStatus !== 'waiting_for_input'
    && effectiveRunStatus !== 'queued_local'
    && (
      String(runDiagnostics?.selected_target || '').trim().toLowerCase() === 'local_companion'
      || String(runDiagnostics?.selected_target || '').trim().toLowerCase() === 'local'
      || String(historyItem?.execution_target_selected || '').trim().toLowerCase() === 'local_companion'
      || String(historyItem?.execution_target_selected || '').trim().toLowerCase() === 'local'
    );
  const showHardKillRun = !TERMINAL_RUN_STATUSES.has(effectiveRunStatus) && (!runDetail?.interrupt_requested || hardKillPending || hardKillBusy);
  const hardKillRunDisabled = hardKillBusy || hardKillPending || approvalBusy !== null || resumeBusy || takeoverBusy;
  const needsLocalMachineAttention = ['local_runtime_wait', 'local_capacity_wait', 'local_queue', 'local_running'].includes(String(runDiagnostics?.category || ''));
  const showRemediationGuide = shouldShowRunRemediationGuide({
    diagnostics: runDiagnostics,
    status: effectiveRunStatus,
    hasPendingApproval: Boolean(pendingConfirmation?.approval_id),
    canResumeRun,
    retryableFailedChildren: Number(delegationSummary?.retryable_failed_children || 0),
    needsLocalMachineAttention,
  });
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
        label: 'Browser confirmation',
        value: String(runDetail.tool_policy_precheck.browser_automation_policy.reason),
        tone: 'warning',
      });
    }
    return notes;
  }, [runDetail?.tool_policy_precheck, runSkillSummary.scope]);
  const workflowNodeStates = useMemo(() => {
    const payload = runDetail?.node_states;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const counts = payload?.counts && typeof payload.counts === 'object' ? payload.counts : {};
    const activeNodeId = String(payload?.active_node_id || '').trim() || null;
    const finalNodeId = String(payload?.final_node_id || '').trim() || null;
    const activeNode = items.find((item) => String(item?.node_id || '').trim() === activeNodeId) || null;
    const finalNode = items.find((item) => String(item?.node_id || '').trim() === finalNodeId) || null;
    const total = Object.values(counts).reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0) || items.length;
    return {
      graphKind: String(payload?.graph_kind || '').trim().toLowerCase() || null,
      items,
      counts,
      total,
      activeNodeId,
      finalNodeId,
      activeNode,
      finalNode,
      updatedAt: payload?.updated_at || null,
    };
  }, [runDetail?.node_states]);
  const currentStepLabel = workflowNodeStates.activeNode?.label
    || localExecutionSteps.find((item) => String(item.status || '').trim().toLowerCase() !== 'completed')?.summary
    || latestComputerAction?.label
    || workflowNodeStates.finalNode?.label
    || 'Waiting for the next execution step.';
  const logRows = useMemo(() => buildRunLiveLogRows(timelineEvents), [timelineEvents]);
  const streamColor =
    TERMINAL_RUN_STATUSES.has(effectiveRunStatus)
      ? 'var(--text-secondary)'
      : streamState === 'connected'
      ? 'var(--success-fg)'
      : streamState === 'connecting'
      ? 'var(--primary-base)'
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
    borderColor: 'var(--primary-border-soft)',
    boxShadow: 'inset 0 0 0 1px var(--primary-ring-soft)',
  } as const;
  const manualTakeover = Boolean(
    runDiagnostics?.manual_takeover_active
    || runDetail?.result_data
    && typeof runDetail.result_data === 'object'
    && Boolean((runDetail.result_data as Record<string, unknown>).manual_takeover),
  );
  const pendingComputerApproval = Boolean(
    pendingConfirmation?.approval_id
    && (
      String(runDiagnostics?.selected_target || '').trim().toLowerCase() === 'local_companion'
      || String(runDiagnostics?.selected_target || '').trim().toLowerCase() === 'local'
      || String(historyItem?.execution_target_selected || '').trim().toLowerCase() === 'local_companion'
      || String(historyItem?.execution_target_selected || '').trim().toLowerCase() === 'local'
      || Boolean(runDetail?.tool_policy_precheck?.require_confirmation_count)
    ),
  );
  const pendingComputerApprovalSummary = pendingComputerApproval
    ? approvalDisplayText(
      pendingConfirmation?.prompt,
      pendingConfirmation?.metadata?.approval_labels,
      pendingConfirmation?.metadata?.approval_capabilities,
      'Approval required before the next local computer action.',
    )
    : null;
  const liveComputerMode = manualTakeover
    ? 'takeover'
    : pendingComputerApproval
      ? 'paused'
    : effectiveRunStatus === 'waiting_for_input' || latestComputerAction?.phase === 'paused' || latestComputerAction?.mode === 'paused'
      ? 'paused'
      : latestComputerAction?.mode || 'observing';
  const bannerStepNumber = latestComputerAction?.stepNumber
    ?? (typeof localExecutionCheckpoint?.next_operation_index === 'number' ? Number(localExecutionCheckpoint.next_operation_index) + 1 : null);
  const bannerStepTotal = latestComputerAction?.stepTotal
    ?? (typeof localExecutionCheckpoint?.total_operations === 'number' ? Number(localExecutionCheckpoint.total_operations) : null);
  const bannerLabel = latestComputerAction?.label
    || (pendingComputerApproval
      ? 'Awaiting approval'
      : null)
    || (liveComputerMode === 'takeover'
      ? 'Human now has control'
      : liveComputerMode === 'paused'
        ? 'AI paused'
        : currentStepLabel);
  const bannerDetail = latestComputerAction?.reason
    || pendingComputerApprovalSummary
    || latestComputerAction?.readinessSummary
    || latestComputerAction?.groundingSummary
    || latestComputerAction?.detail
    || latestComputerAction?.textSummary
    || latestComputerAction?.url
    || (liveComputerMode === 'takeover'
      ? 'Pause requested by the operator. No further computer actions will execute until you resume.'
      : liveComputerMode === 'paused'
        ? 'The run is paused and waiting for input or a resume request.'
        : 'Computer control active.');
  const bannerConfidenceLabel = formatConfidenceLabel(latestComputerAction?.confidence, latestComputerAction?.certainty);
  const showComputerBanner =
    (Boolean(latestComputerAction) || canTakeOverRun || canResumeRun || pendingComputerApproval)
    && !loading
    && (!TERMINAL_RUN_STATUSES.has(effectiveRunStatus) || liveComputerMode === 'paused' || liveComputerMode === 'takeover');

  useEffect(() => {
    if (TERMINAL_RUN_STATUSES.has(effectiveRunStatus) || runDetail?.interrupt_requested) {
      setHardKillPending(false);
      setHardKillDialogOpen(false);
    }
  }, [effectiveRunStatus, runDetail?.interrupt_requested]);

  useEffect(() => {
    if (loading || !focusTarget) return;
    const timer = window.setTimeout(() => {
      focusSection(focusTarget);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [focusSection, focusTarget, loading]);

  if (!runId) {
    return (
      <div style={pageShellStyle()}>
        <section style={panelStyle()}>Invalid run id.</section>
      </div>
    );
  }

  return (
    <div style={pageShellStyle()}>
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
                border: `1px solid ${DESIGN_TOKENS.color.borderStrong}`,
                padding: '6px 10px',
                fontSize: 11,
                color: DESIGN_TOKENS.color.textTertiary,
                background: DESIGN_TOKENS.color.surface,
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
            <Button variant="secondary" onClick={() => void load()}>
              <RefreshCw size={14} />
              Refresh
            </Button>
            <Link
              href="/executions"
              style={mergeStyles(
                { display: 'inline-flex', alignItems: 'center', textDecoration: 'none' },
                buttonStyle({ tone: 'secondary', size: 'md' }),
              )}
            >
              Back to Runs
            </Link>
          </>
        }
      />

      {error ? (
        <section
          style={mergeStyles(panelStyle({ muted: true }), {
            borderColor: DESIGN_TOKENS.color.danger,
            background: DESIGN_TOKENS.color.dangerSoft,
            color: DESIGN_TOKENS.color.danger,
          })}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
            <AlertTriangle size={14} />
            {error}
          </div>
        </section>
      ) : null}

      {!error && streamError && !TERMINAL_RUN_STATUSES.has(effectiveRunStatus) ? (
        <section
          style={mergeStyles(panelStyle({ muted: true }), {
            borderColor: DESIGN_TOKENS.color.warning,
            background: DESIGN_TOKENS.color.warningSoft,
            color: DESIGN_TOKENS.color.warning,
          })}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
            <AlertTriangle size={14} />
            {streamError}
          </div>
        </section>
      ) : null}

      {showComputerBanner ? (
        <section
          style={{
            position: 'fixed',
            top: 92,
            right: 20,
            zIndex: 60,
            width: 'min(420px, calc(100vw - 32px))',
            borderRadius: DESIGN_TOKENS.radius.xl,
            border: `1px solid ${
              liveComputerMode === 'paused' || liveComputerMode === 'takeover'
                ? DESIGN_TOKENS.color.warning
                : DESIGN_TOKENS.color.accent
            }`,
            padding: DESIGN_TOKENS.space[4],
            borderColor:
              liveComputerMode === 'paused' || liveComputerMode === 'takeover'
                ? DESIGN_TOKENS.color.warning
                : DESIGN_TOKENS.color.accent,
            background:
              liveComputerMode === 'paused' || liveComputerMode === 'takeover'
                ? DESIGN_TOKENS.color.warningSoft
                : DESIGN_TOKENS.color.accentSoft,
            boxShadow: '0 16px 36px rgba(16, 19, 25, 0.12)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Activity size={14} style={{ color: liveComputerMode === 'paused' || liveComputerMode === 'takeover' ? 'var(--warning-fg)' : 'var(--primary-base)' }} />
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: DESIGN_TOKENS.color.textTertiary }}>
                {liveComputerMode.replace(/_/g, ' ')}
              </span>
            </div>
            <span style={badgeStyle('neutral')}>
              Step {bannerStepNumber ?? '--'}{bannerStepTotal ? `/${bannerStepTotal}` : ''}
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 15, fontWeight: 800, color: DESIGN_TOKENS.color.textPrimary }}>
            {bannerLabel}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: DESIGN_TOKENS.color.textSecondary }}>
            {bannerDetail}
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {latestComputerAction ? <span style={badgeStyle('neutral')}>{latestComputerAction.actionType.replace(/_/g, ' ')}</span> : null}
            <span style={badgeStyle('neutral')}>
              {latestComputerAction?.success === false ? 'Failed' : (latestComputerAction?.phase || liveComputerMode).replace(/_/g, ' ')}
            </span>
            {bannerConfidenceLabel ? <span style={badgeStyle('neutral')}>{bannerConfidenceLabel}</span> : null}
            {latestComputerAction?.retryCount && latestComputerAction.retryCount > 1 ? (
              <span style={badgeStyle('neutral')}>retry {latestComputerAction.retryCount}</span>
            ) : null}
            {latestComputerAction?.replanned ? <span style={badgeStyle('neutral')}>replanned</span> : null}
            {latestComputerAction?.readinessState ? (
              <span style={badgeStyle('neutral')}>{latestComputerAction.readinessState.replace(/_/g, ' ')}</span>
            ) : null}
            <span style={badgeStyle('neutral')}>{latestComputerAction ? fmtTime(latestComputerAction.ts) || '--' : 'live'}</span>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canTakeOverRun ? (
              <button
                style={buttonStyle({ tone: 'primary', size: 'md' })}
                onClick={() => void handleTakeOverRun()}
                disabled={takeoverBusy || approvalBusy !== null || resumeBusy || interruptRequested}
              >
                {takeoverBusy ? 'Pausing…' : 'Pause AI'}
              </button>
            ) : null}
            {canResumeRun ? (
              <button
                style={buttonStyle({ tone: 'primary', size: 'md' })}
                onClick={() => void handleResumeRun()}
                disabled={resumeBusy || approvalBusy !== null || takeoverBusy || interruptRequested}
              >
                {resumeBusy ? 'Resuming…' : 'Resume AI'}
              </button>
            ) : null}
            {showHardKillRun ? (
              <Button
                variant="destructive"
                onClick={() => setHardKillDialogOpen(true)}
                disabled={hardKillRunDisabled}
              >
                {hardKillBusy || hardKillPending ? 'Interrupting…' : 'Hard Kill Run'}
              </Button>
            ) : null}
            <button
              style={buttonStyle({ tone: 'secondary', size: 'md' })}
              onClick={() => focusSection('screenshots')}
            >
              Open live view
            </button>
          </div>
        </section>
      ) : null}

      {!loading ? (
        <section
          style={{
            ...panelStyle({ muted: true, padding: DESIGN_TOKENS.space[3] }),
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            background: DESIGN_TOKENS.color.surfaceMuted,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 800, color: DESIGN_TOKENS.color.textTertiary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Jump to
          </span>
          {([
            ...(workflowNodeStates.items.length > 0 ? [['workflow', `Workflow ${workflowNodeStates.total}`] as [InspectSectionTarget, string]] : []),
            ['timeline', `Timeline ${timelineEvents.length}`],
            ['logs', `Logs ${logRows.length}`],
            ['approvals', `Confirmations ${approvalAudit.length}`],
            ...(replaySteps.length > 0 ? [['replay', `Replay ${replaySteps.length}`] as [InspectSectionTarget, string]] : []),
            ['screenshots', `Screenshots ${screenshotArtifacts.length}`],
            ['artifacts', `Artifacts ${artifacts.length}`],
          ] as Array<[InspectSectionTarget, string]>).map(([target, label]) => {
            const isActive = activeSection === target;
            return (
              <button
                key={target}
                onClick={() => focusSection(target)}
                style={{
                  ...buttonStyle({ tone: isActive ? 'secondary' : 'ghost', size: 'md' }),
                  fontSize: 11,
                  background: isActive ? DESIGN_TOKENS.color.accentSoft : DESIGN_TOKENS.color.surface,
                  borderColor: isActive ? DESIGN_TOKENS.color.accent : DESIGN_TOKENS.color.borderSubtle,
                  color: isActive ? DESIGN_TOKENS.color.accentStrong : DESIGN_TOKENS.color.textSecondary,
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
              gap: DESIGN_TOKENS.space[4],
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            }}
          >
            <article style={mergeStyles(panelStyle({ muted: false, padding: DESIGN_TOKENS.space[4] }), { display: 'grid', gap: DESIGN_TOKENS.space[3] })}>
              <div style={sectionTitleStyle()}>Outcome</div>
              <div style={{ marginTop: 6, fontSize: 22, lineHeight: 1.2, fontWeight: 800, color: outcomeToneColor, textTransform: 'capitalize' }}>
                {formatInspectStatusLabel(historyItem?.status || runDetail?.status || 'unknown')}
              </div>
              <div style={bodyTextStyle('primary')}>
                {primarySummary}
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={badgeStyle('neutral')}>Run {runId.slice(0, 8)}</span>
                <span style={badgeStyle('neutral')}>Agent {formatAgentRoleLabel(historyItem?.agent_role || runDetail?.agent_role)}</span>
                {connectorBinding ? <span style={badgeStyle('neutral')}>Channel {formatConnectorBindingLabel(connectorBinding)}</span> : null}
              </div>
              <div style={{ marginTop: 12, display: 'grid', gap: 6, fontSize: 12, color: DESIGN_TOKENS.color.textTertiary }}>
                <div>Goal {runGoal}</div>
                <div>Started {fmtTime(historyItem?.created_at)}</div>
                <div>Completed {fmtTime(historyItem?.completed_at)}</div>
              </div>
            </article>

            <article style={mergeStyles(panelStyle({ muted: false, padding: DESIGN_TOKENS.space[4] }), { display: 'grid', gap: DESIGN_TOKENS.space[3] })}>
              <div style={sectionTitleStyle()}>Run Context</div>
              <div style={{ marginTop: 6, fontSize: 17, fontWeight: 800, color: DESIGN_TOKENS.color.textPrimary }}>
                {formatAgentRoleLabel(historyItem?.agent_role || runDetail?.agent_role)}
              </div>
              <div style={{ marginTop: 10, display: 'grid', gap: 6, fontSize: 12, color: DESIGN_TOKENS.color.textTertiary }}>
                <div>Channel {formatConnectorBindingLabel(connectorBinding)}</div>
                <div>Duration {fmtMs(historyItem?.duration_ms)}</div>
                <div>Time-to-first-value {fmtMs(historyItem?.time_to_first_value_ms)}</div>
                <div>
                  Requested AI {contractProviderModel?.requested_provider || '--'} · {contractProviderModel?.requested_model || '--'}
                </div>
                <div>
                  Effective AI {contractProviderModel?.effective_provider || '--'} · {contractProviderModel?.effective_model || '--'}
                </div>
                <div>Cost {historyItem?.usage_cost_band || '--'}</div>
                <div>Skills {runSkillSummary.labels.length > 0 ? runSkillSummary.labels.join(', ') : '--'}</div>
                {historyItem?.agent_role_source || runDetail?.agent_role_source
                  ? <div>Assignment {String(historyItem?.agent_role_source || runDetail?.agent_role_source)}</div>
                  : null}
              </div>
            </article>

            <article style={mergeStyles(panelStyle({ muted: false, padding: DESIGN_TOKENS.space[4] }), { display: 'grid', gap: DESIGN_TOKENS.space[3] })}>
              <div style={sectionTitleStyle()}>Confirmations</div>
              <div style={{ marginTop: 6, fontSize: 17, fontWeight: 800, color: pendingConfirmation ? DESIGN_TOKENS.color.warning : DESIGN_TOKENS.color.textPrimary }}>
                {pendingConfirmation ? 'Confirmation required' : approvalAudit.length > 0 ? 'Decision history recorded' : 'No confirmations needed'}
              </div>
              <div style={bodyTextStyle()}>
                {pendingConfirmation
                  ? approvalDisplayText(
                    pendingConfirmation.prompt,
                    pendingConfirmation.metadata?.approval_labels,
                    pendingConfirmation.metadata?.approval_capabilities,
                    'Confirmation required to continue.',
                  )
                  : contractApprovalOutcome?.label
                  ? contractApprovalOutcome.label
                  : latestApproval
                  ? `${formatApprovalDecisionLabel(latestApproval.decision)} · ${compactText(approvalDisplayText('', latestApproval.labels, latestApproval.capabilities, latestApproval.note || latestApproval.stage), 'Decision recorded.', 140)}`
                  : 'This run finished without pausing for confirmation.'}
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={buttonStyle({ tone: 'secondary', size: 'md' })} onClick={() => focusSection('approvals')}>
                  Open confirmations
                </button>
                <Link
                  href="/approvals"
                  style={mergeStyles(
                    { display: 'inline-flex', alignItems: 'center', textDecoration: 'none' },
                    buttonStyle({ tone: 'secondary', size: 'md' }),
                  )}
                >
                  Go to Confirmation Queue
                </Link>
              </div>
            </article>

            <article style={mergeStyles(panelStyle({ muted: false, padding: DESIGN_TOKENS.space[4] }), { display: 'grid', gap: DESIGN_TOKENS.space[3] })}>
              <div style={sectionTitleStyle()}>Diagnosis</div>
              <div style={{ marginTop: 6, fontSize: 17, fontWeight: 800, color: statusColor(runDetail?.status || historyItem?.status) }}>
                {runDiagnostics?.headline || formatRunDiagnosisCategory(runDiagnostics?.category)}
              </div>
              <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                {compactText(
                  runDiagnostics?.summary || runDiagnostics?.failure_message,
                  'The runtime has not recorded a diagnosis summary for this run yet.',
                  220,
                )}
              </div>
              {runDiagnostics?.next_step ? (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-tertiary)' }}>
                  Next step {compactText(runDiagnostics.next_step, '--', 180)}
                </div>
              ) : null}
              {diagnosisRows.length > 0 ? (
                <div style={{ marginTop: 12, display: 'grid', gap: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {diagnosisRows.map((item) => (
                    <div key={`diagnosis:${item.label}`}>
                      {item.label} {item.value}
                    </div>
                  ))}
                </div>
              ) : null}
            </article>

            {showRemediationGuide ? (
              <article className="orion-panel muted">
                <RunRemediationGuide
                  diagnostics={runDiagnostics}
                  status={effectiveRunStatus}
                  hasPendingApproval={Boolean(pendingConfirmation?.approval_id)}
                  canResumeRun={canResumeRun}
                  retryableFailedChildren={Number(delegationSummary?.retryable_failed_children || 0)}
                  needsLocalMachineAttention={needsLocalMachineAttention}
                  actions={(
                    <>
                      {pendingConfirmation?.approval_id ? (
                        <>
                          <button
                            className="orion-btn orion-btn-primary"
                            style={{ minHeight: 44, paddingInline: 12 }}
                            onClick={() => void handleResolveApproval('Proceed')}
                            disabled={approvalBusy !== null || resumeBusy || retryingDelegation || autoDelegating || delegating}
                          >
                            {approvalBusy === 'Proceed' ? 'Confirming...' : 'Confirm once'}
                          </button>
                          <button
                            className="orion-btn orion-btn-ghost"
                            style={{ minHeight: 44, paddingInline: 12 }}
                            onClick={() => void handleResolveApproval('Hold')}
                            disabled={approvalBusy !== null || resumeBusy || retryingDelegation || autoDelegating || delegating}
                          >
                            {approvalBusy === 'Hold' ? 'Declining...' : 'Decline'}
                          </button>
                          <Link className="orion-btn orion-btn-ghost" style={{ minHeight: 44, paddingInline: 12 }} href="/approvals">
                            Open approvals
                          </Link>
                        </>
                      ) : null}
                      {canResumeRun ? (
                        <button
                          className="orion-btn orion-btn-primary"
                          style={{ minHeight: 44, paddingInline: 12 }}
                          onClick={() => void handleResumeRun()}
                          disabled={resumeBusy || approvalBusy !== null || retryingDelegation || autoDelegating || delegating || interruptRequested}
                        >
                          {resumeBusy ? 'Resuming...' : 'Resume run'}
                        </button>
                      ) : null}
                      {showHardKillRun ? (
                        <Button
                          variant="destructive"
                          onClick={() => setHardKillDialogOpen(true)}
                          disabled={hardKillRunDisabled || retryingDelegation || autoDelegating || delegating}
                          style={{ minHeight: 44, paddingInline: 12 }}
                        >
                          {hardKillBusy || hardKillPending ? 'Interrupting…' : 'Hard Kill Run'}
                        </Button>
                      ) : null}
                      {(delegationSummary?.retryable_failed_children || 0) > 0 ? (
                        <button
                          className="orion-btn orion-btn-ghost"
                          style={{ minHeight: 44, paddingInline: 12 }}
                          onClick={() => void handleRetryFailedDelegation()}
                          disabled={retryingDelegation || approvalBusy !== null || resumeBusy || autoDelegating || delegating}
                        >
                          {retryingDelegation
                            ? 'Retrying...'
                            : `Retry failed (${String(delegationSummary?.retryable_failed_children || 0)})`}
                        </button>
                      ) : null}
                      {needsLocalMachineAttention ? (
                        <>
                          <Link className="orion-btn orion-btn-ghost" style={{ minHeight: 44, paddingInline: 12 }} href="/machines">
                            Open machines
                          </Link>
                          <Link className="orion-btn orion-btn-ghost" style={{ minHeight: 44, paddingInline: 12 }} href="/health">
                            Open machine health
                          </Link>
                        </>
                      ) : null}
                    </>
                  )}
                />
              </article>
            ) : null}

            <LocalCompanionRunPanel
              runId={runId}
              diagnostics={runDiagnostics}
              requiredCapabilities={inspectRequiredCapabilities}
              missingCapabilities={inspectMissingCapabilities}
              busyRuntimeLabels={inspectBusyRuntimeLabels}
            />

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
                <button className="orion-btn orion-btn-ghost" style={{ minHeight: 44, paddingInline: 12 }} onClick={() => focusSection('artifacts')}>
                  Open artifacts
                </button>
                <Link className="orion-btn orion-btn-ghost" style={{ minHeight: 44, paddingInline: 12 }} href={latestArtifact ? artifactWorkspaceHref(latestArtifact) : '/artifacts'}>
                  Open outputs
                </Link>
              </div>
            </article>

            <article className="orion-panel">
              <div className="orion-panel-title">Live computer control</div>
              <div style={{ marginTop: 6, fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
                {liveScreenshotArtifact ? 'Latest machine view' : 'Waiting for the first screenshot'}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-tertiary)' }}>
                Current step {currentStepLabel}
              </div>
              <div
                style={{
                  position: 'relative',
                  marginTop: 12,
                  minHeight: 220,
                  borderRadius: 16,
                  overflow: 'hidden',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-element)',
                }}
              >
                {liveScreenshotArtifact ? (
                  <ArtifactImagePreview path={liveScreenshotArtifact} alt={`Latest screenshot for run ${runId}`} />
                ) : (
                  <div
                    style={{
                      minHeight: 220,
                      display: 'grid',
                      placeItems: 'center',
                      color: 'var(--text-secondary)',
                      fontSize: 12,
                    }}
                  >
                    This run has not produced a screenshot artifact yet.
                  </div>
                )}
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {canTakeOverRun ? (
                  <button
                    className="orion-btn orion-btn-primary"
                    style={{ minHeight: 44, paddingInline: 12 }}
                    onClick={() => void handleTakeOverRun()}
                    disabled={takeoverBusy || approvalBusy !== null || resumeBusy || interruptRequested}
                  >
                    {takeoverBusy ? 'Pausing…' : 'Pause AI'}
                  </button>
                ) : null}
                {canResumeRun ? (
                  <button
                    className="orion-btn orion-btn-primary"
                    style={{ minHeight: 44, paddingInline: 12 }}
                    onClick={() => void handleResumeRun()}
                    disabled={resumeBusy || approvalBusy !== null || takeoverBusy || interruptRequested}
                  >
                    {resumeBusy ? 'Resuming…' : 'Resume AI'}
                  </button>
                ) : null}
                {showHardKillRun ? (
                  <Button
                    variant="destructive"
                    onClick={() => setHardKillDialogOpen(true)}
                    disabled={hardKillRunDisabled}
                    style={{ minHeight: 44, paddingInline: 12 }}
                  >
                    {hardKillBusy || hardKillPending ? 'Interrupting…' : 'Hard Kill Run'}
                  </Button>
                ) : null}
                <button
                  className="orion-btn orion-btn-ghost"
                  style={{ minHeight: 44, paddingInline: 12 }}
                  onClick={() => focusSection('screenshots')}
                >
                  Open screenshot history
                </button>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: liveComputerMode === 'takeover' ? 'var(--warning-fg)' : 'var(--text-tertiary)' }}>
                {liveComputerMode === 'takeover'
                  ? 'Manual takeover is active. The human has control until Resume AI is requested.'
                  : liveComputerMode === 'paused'
                    ? 'The run is paused and will not issue more computer actions until resumed.'
                    : 'Pause AI instantly hands control back to the user on the local machine.'}
              </div>
              <div
                style={{
                  marginTop: 14,
                  borderTop: '1px solid var(--border-default)',
                  paddingTop: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Live action log
                  </div>
                  <span className="orion-chip">{computerActionEvents.length} action{computerActionEvents.length === 1 ? '' : 's'}</span>
                </div>
                {recentComputerActions.length === 0 ? (
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                    Waiting for the first computer-control event.
                  </div>
                ) : (
                  <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                    {recentComputerActions.map((item) => (
                      <div
                        key={`computer-action:${item.id}`}
                        style={{
                          border: '1px solid var(--border-default)',
                          borderRadius: 14,
                          padding: '10px 12px',
                          background: 'var(--bg-element)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{item.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {item.stepNumber ?? '--'}{item.stepTotal ? `/${item.stepTotal}` : ''}
                          </div>
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                          {item.reason || item.readinessSummary || item.groundingSummary || item.detail || item.textSummary || item.url || '--'}
                        </div>
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span className="orion-chip">{item.actionType.replace(/_/g, ' ')}</span>
                          <span className="orion-chip">{item.success === false ? 'Failed' : item.phase.replace(/_/g, ' ')}</span>
                          {formatConfidenceLabel(item.confidence, item.certainty) ? (
                            <span className="orion-chip">{formatConfidenceLabel(item.confidence, item.certainty)}</span>
                          ) : null}
                          {item.retryCount && item.retryCount > 1 ? <span className="orion-chip">retry {item.retryCount}</span> : null}
                          {item.replanned ? <span className="orion-chip">replanned</span> : null}
                          {item.readinessState ? <span className="orion-chip">{item.readinessState.replace(/_/g, ' ')}</span> : null}
                          <span className="orion-chip">{fmtTime(item.ts)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                <span className="orion-chip">Requested {contractProviderModel?.requested_provider || '--'} · {contractProviderModel?.requested_model || '--'}</span>
                <span className="orion-chip">Effective {contractProviderModel?.effective_provider || '--'} · {contractProviderModel?.effective_model || '--'}</span>
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

              <article className="orion-panel">
                <div className="orion-panel-title">Execution Truth</div>
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Confirmation {contractApprovalOutcome?.label || 'Not recorded'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Mutation {contractConnectorMutation?.execution_label || 'Not recorded'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Action {contractConnectorMutation?.action_label || 'Not recorded'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Target {contractConnectorMutation?.target_label || 'Not recorded'}
                  </div>
                  <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
                    {contractEvidenceItems.length > 0 ? contractEvidenceItems.map((item, index) => (
                      <div
                        key={String(item.id || `${item.label || 'evidence'}:${index}`)}
                        style={{
                          display: 'grid',
                          gap: 4,
                          padding: '10px 12px',
                          borderRadius: 12,
                          border: '1px solid var(--border-default)',
                          background: 'var(--bg-element)',
                        }}
                      >
                        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {String(item.label || 'Evidence').trim() || 'Evidence'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {String(item.value || 'Not recorded').trim() || 'Not recorded'}
                        </div>
                      </div>
                    )) : (
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        No evidence recorded yet.
                      </div>
                    )}
                  </div>
                </div>
              </article>
          </section>

          {workflowNodeStates.items.length > 0 ? (
            <section
              ref={workflowSectionRef}
              className="orion-panel"
              style={{
                minHeight: 260,
                scrollMarginTop: 92,
                ...(activeSection === 'workflow' ? focusedSectionStyle : null),
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <div className="orion-panel-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Route size={14} />
                  Workflow execution
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className="orion-chip">
                    {workflowNodeStates.graphKind === 'workflow' ? 'Workflow graph' : workflowNodeStates.graphKind || 'Graph'}
                  </span>
                  <span className="orion-chip">{workflowNodeStates.total} nodes</span>
                  {workflowNodeStates.updatedAt ? <span className="orion-chip">Updated {fmtTime(workflowNodeStates.updatedAt)}</span> : null}
                </div>
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: 'grid',
                  gap: 10,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gap: 6,
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-element)',
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Active node
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {workflowNodeStates.activeNode?.label || workflowNodeStates.activeNodeId || 'No active node'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {workflowNodeStates.activeNode
                      ? formatWorkflowNodeKind(workflowNodeStates.activeNode.type, workflowNodeStates.activeNode.variant)
                      : TERMINAL_RUN_STATUSES.has(effectiveRunStatus)
                      ? 'Run is no longer active.'
                      : 'Waiting for the next execution transition.'}
                  </div>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gap: 6,
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-element)',
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Final node
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {workflowNodeStates.finalNode?.label || workflowNodeStates.finalNodeId || 'Not finished yet'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {workflowNodeStates.finalNode
                      ? formatWorkflowNodeKind(workflowNodeStates.finalNode.type, workflowNodeStates.finalNode.variant)
                      : 'The graph has not reached a terminal node yet.'}
                  </div>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gap: 8,
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-element)',
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Node states
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(workflowNodeStates.counts).map(([status, count]) => {
                      const tone = workflowNodeTone(status);
                      return (
                        <span
                          key={`workflow-count:${status}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            minHeight: 24,
                            padding: '0 9px',
                            borderRadius: 999,
                            border: `1px solid ${tone.border}`,
                            background: tone.background,
                            fontSize: 11,
                            color: tone.color,
                            fontWeight: 700,
                          }}
                        >
                          {count} {tone.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: 12,
                  borderTop: '1px solid var(--border-default)',
                  borderBottom: '1px solid var(--border-default)',
                  overflowX: 'auto',
                  maxHeight: 420,
                  overflowY: 'auto',
                }}
              >
                <div
                  style={{
                    minWidth: 860,
                    display: 'grid',
                    gridTemplateColumns: '180px 150px 120px minmax(260px, 1fr) 120px',
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
                  <span>Node</span>
                  <span>Kind</span>
                  <span>Status</span>
                  <span>What happened</span>
                  <span>Duration</span>
                </div>
                {workflowNodeStates.items.map((item, index) => {
                  const tone = workflowNodeTone(item.status || undefined);
                  const isActiveNode = String(item.node_id || '').trim() === workflowNodeStates.activeNodeId;
                  const isFinalNode = String(item.node_id || '').trim() === workflowNodeStates.finalNodeId;
                  return (
                    <div
                      key={`workflow-node:${item.node_id || index}`}
                      className="orion-log-entry"
                      style={{
                        minWidth: 860,
                        display: 'grid',
                        gridTemplateColumns: '180px 150px 120px minmax(260px, 1fr) 120px',
                        gap: 8,
                        padding: '10px 10px',
                        borderBottom: '1px solid var(--border-default)',
                        alignItems: 'start',
                        background: isActiveNode ? 'var(--primary-soft)' : 'transparent',
                      }}
                    >
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 700 }}>
                          {item.label || item.node_id || '--'}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          {isActiveNode ? <span className="orion-chip">Active</span> : null}
                          {isFinalNode ? <span className="orion-chip">Final</span> : null}
                          {item.child_run_id ? (
                            <Link
                              className="orion-btn orion-btn-ghost"
                              href={`/runs/${encodeURIComponent(String(item.child_run_id))}/inspect?focus=workflow`}
                              style={{ minHeight: 24, paddingInline: 8, fontSize: 10 }}
                            >
                              Child run
                            </Link>
                          ) : null}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                          {formatWorkflowNodeKind(item.type, item.variant)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {String(item.node_id || '').trim() || '--'}
                        </div>
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
                        {item.waiting_for_approval ? (
                          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--warning-fg)' }}>
                            Confirmation required
                          </div>
                        ) : null}
                      </div>
                      <div style={{ display: 'grid', gap: 6 }}>
                        {item.summary ? (
                          <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{item.summary}</div>
                        ) : (
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No node summary recorded.</div>
                        )}
                        {item.input_preview ? (
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            In {item.input_preview}
                          </div>
                        ) : null}
                        {item.output_preview ? (
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            Out {item.output_preview}
                          </div>
                        ) : null}
                        {item.error ? (
                          <div style={{ fontSize: 11, color: 'var(--error-fg)', wordBreak: 'break-word' }}>
                            {item.error}
                          </div>
                        ) : null}
                      </div>
                      <div style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
                        <div>{fmtMs(item.duration_ms)}</div>
                        {item.started_at ? <div>Start {fmtTime(item.started_at)}</div> : null}
                        {item.completed_at ? <div>Done {fmtTime(item.completed_at)}</div> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

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
                        style={{ minHeight: 44, paddingInline: 12 }}
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
                            style={{ minHeight: 44, paddingInline: 12 }}
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
                            ? 'Resolve child confirmations.'
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
                                style={{ minHeight: 44, paddingInline: 12 }}
                                onClick={() => void openArtifactTarget(step.artifact_file_path!)}
                              >
                                Open
                              </button>
                              <Link
                                className="orion-btn orion-btn-ghost"
                                style={{ minHeight: 44, paddingInline: 12 }}
                                href={artifactWorkspaceHref(step.artifact_file_path)}
                              >
                                Inspect in assets
                              </Link>
                              {desktopBridge?.desktop && isLocalFileTarget(step.artifact_file_path) ? (
                                <button
                                  className="orion-btn orion-btn-ghost"
                                  style={{ minHeight: 44, paddingInline: 12 }}
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

          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: DESIGN_TOKENS.space[4],
              marginBottom: DESIGN_TOKENS.space[4],
            }}
          >
            <article style={panelStyle({ muted: true })}>
              <div style={metaTextStyle()}>Target machine</div>
              <div style={{ ...bodyTextStyle('primary'), marginTop: 8, fontWeight: 700 }}>{targetMachineLabel}</div>
              <div style={{ ...metaTextStyle(), marginTop: 6 }}>Placement {executionPlacementLabel}</div>
            </article>
            <article style={panelStyle({ muted: true })}>
              <div style={metaTextStyle()}>Specialist lineage</div>
              <div style={{ ...bodyTextStyle('primary'), marginTop: 8, fontWeight: 700 }}>{childLineageSummary.headline}</div>
              <div style={{ ...metaTextStyle(), marginTop: 6 }}>{childLineageSummary.detail}</div>
            </article>
            <article style={panelStyle({ muted: true })}>
              <div style={metaTextStyle()}>Interventions</div>
              <div
                style={{
                  ...bodyTextStyle('primary'),
                  marginTop: 8,
                  fontWeight: 700,
                  color: pendingConfirmation
                    ? DESIGN_TOKENS.color.warning
                    : interruptRequested
                      ? DESIGN_TOKENS.color.danger
                      : DESIGN_TOKENS.color.textPrimary,
                }}
              >
                {pendingConfirmation ? 'Approval required' : interruptRequested ? 'Interrupt requested' : 'No active interventions'}
              </div>
              <div style={{ ...metaTextStyle(), marginTop: 6 }}>
                {pendingConfirmation
                  ? 'This run is paused until a human decision is recorded.'
                  : interruptRequested
                    ? 'A hard stop has been sent to the execution runtime.'
                    : 'Sage is operating within the current policy envelope.'}
              </div>
            </article>
          </section>

          <section className="orion-grid-2">
            <RunLiveCockpitPanel
              runId={runId}
              loading={loading}
              runStatus={historyItem?.status || runDetail?.status}
              replayEvents={replayItem?.events}
              sectionRef={timelineSectionRef}
              focusedStyle={focusedSectionStyle}
              active={activeSection === 'timeline' || activeSection === 'logs'}
              headerAccessory={(
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={badgeStyle('neutral')}>{executionPlacementLabel}</span>
                  <span style={badgeStyle(runDetail?.machine_id || runDetail?.runtime_id ? 'success' : 'neutral')}>
                    {String(runDetail?.machine_id || runDetail?.runtime_id || 'Machine pending').trim() || 'Machine pending'}
                  </span>
                  {childRuns.length > 0 || Number(delegationSummary?.total_children || 0) > 0 ? (
                    <span style={badgeStyle('neutral')}>
                      {Number(delegationSummary?.active_children || childRuns.length || 0)} child agent{Number(delegationSummary?.active_children || childRuns.length || 0) === 1 ? '' : 's'}
                    </span>
                  ) : null}
                  <span style={badgeStyle(interruptRequested ? 'warning' : 'neutral')}>
                    {hardKillBusy || hardKillPending ? 'Interrupting…' : interruptRequested ? 'Interrupt requested' : 'Live control'}
                  </span>
                  {showHardKillRun ? (
                    <Button
                      variant="destructive"
                      onClick={() => setHardKillDialogOpen(true)}
                      disabled={hardKillRunDisabled}
                    >
                      {hardKillBusy || hardKillPending ? 'Interrupting…' : 'Kill Run'}
                    </Button>
                  ) : null}
                </div>
              )}
              onLiveEventsChange={setLiveEvents}
              onStreamMetaChange={(state, errorMessage) => {
                setStreamState(state);
                setStreamError(errorMessage);
              }}
              onRefreshRunState={() => void refreshRunState()}
            />

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
                Confirmations
              </div>
              {pendingApprovalRecord ? (
                <div
                  style={{
                    marginTop: 10,
                    display: 'grid',
                    gap: 10,
                  }}
                >
                  <ApprovalRequestCard
                    approval={pendingApprovalRecord}
                    onDecision={async (decision) => {
                      await handleResolveApproval(decision === 'proceed' ? 'Proceed' : 'Hold');
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link className="orion-btn orion-btn-ghost" style={{ minHeight: 44, paddingInline: 12 }} href="/approvals">
                      Open confirmation queue
                    </Link>
                    <button className="orion-btn orion-btn-ghost" style={{ minHeight: 44, paddingInline: 12 }} onClick={() => focusSection('timeline')}>
                      Review timeline first
                    </button>
                  </div>
                </div>
              ) : null}
              {approvalAudit.length === 0 ? (
                <div className="orion-panel-copy" style={{ marginTop: 10 }}>No confirmation history for this run.</div>
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

          <section
            ref={replaySectionRef}
            className="orion-panel"
            style={{
              minHeight: 320,
              scrollMarginTop: 92,
              ...(activeSection === 'replay' ? focusedSectionStyle : null),
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div className="orion-panel-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Route size={14} />
                Session Replay
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="orion-chip">{replaySteps.length} step{replaySteps.length === 1 ? '' : 's'}</span>
                {selectedReplayStep?.stepNumber ? (
                  <span className="orion-chip">
                    Step {selectedReplayStep.stepNumber}{selectedReplayStep.stepTotal ? `/${selectedReplayStep.stepTotal}` : ''}
                  </span>
                ) : null}
                {selectedReplayStep ? (
                  <span className="orion-chip">
                    {replayStepTone(selectedReplayStep).label}
                  </span>
                ) : null}
              </div>
            </div>
            {replaySteps.length === 0 ? (
              <div className="orion-panel-copy" style={{ marginTop: 10 }}>
                No structured computer-control replay was recorded for this run.
              </div>
            ) : selectedReplayStep ? (
              <div
                style={{
                  marginTop: 12,
                  display: 'grid',
                  gap: 14,
                  gridTemplateColumns: 'minmax(260px, 320px) minmax(0, 1fr)',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gap: 10,
                    minHeight: 0,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="orion-btn orion-btn-ghost"
                      style={{ minHeight: 44, paddingInline: 12 }}
                      onClick={() => {
                        if (!canSelectPreviousReplayStep) return;
                        setSelectedReplayStepId(replaySteps[selectedReplayIndex - 1]?.id || null);
                      }}
                      disabled={!canSelectPreviousReplayStep}
                    >
                      Previous
                    </button>
                    <button
                      className="orion-btn orion-btn-ghost"
                      style={{ minHeight: 44, paddingInline: 12 }}
                      onClick={() => {
                        if (!canSelectNextReplayStep) return;
                        setSelectedReplayStepId(replaySteps[selectedReplayIndex + 1]?.id || null);
                      }}
                      disabled={!canSelectNextReplayStep}
                    >
                      Next
                    </button>
                  </div>
                  <div
                    style={{
                      borderTop: '1px solid var(--border-default)',
                      borderBottom: '1px solid var(--border-default)',
                      maxHeight: 560,
                      overflowY: 'auto',
                    }}
                  >
                    {replaySteps.map((step, index) => {
                      const selected = step.id === selectedReplayStep.id;
                      const tone = replayStepTone(step);
                      return (
                        <button
                          key={step.id}
                          type="button"
                          onClick={() => setSelectedReplayStepId(step.id)}
                          style={{
                            width: '100%',
                            display: 'grid',
                            gap: 8,
                            textAlign: 'left',
                            padding: '12px 12px 13px',
                            border: 'none',
                            borderBottom: '1px solid var(--border-default)',
                            background: selected ? 'var(--primary-soft)' : 'transparent',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {step.stepNumber ? `Step ${step.stepNumber}` : `Event ${index + 1}`}
                              </span>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  minHeight: 20,
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
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fmtTime(step.ts)}</span>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{step.label}</div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <span className="orion-chip">{step.actionType.replace(/_/g, ' ')}</span>
                            {step.elapsedMs != null ? <span className="orion-chip">{fmtMs(step.elapsedMs)}</span> : null}
                            {step.mode ? <span className="orion-chip">{step.mode.replace(/_/g, ' ')}</span> : null}
                            {formatConfidenceLabel(step.confidence, step.certainty) ? (
                              <span className="orion-chip">{formatConfidenceLabel(step.confidence, step.certainty)}</span>
                            ) : null}
                            {step.retryCount && step.retryCount > 1 ? <span className="orion-chip">retry {step.retryCount}</span> : null}
                            {step.replanned ? <span className="orion-chip">replanned</span> : null}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            {compactText(step.reason || step.readinessSummary || step.groundingSummary || step.detail || step.textSummary || step.error || 'No planner note recorded.', 'No planner note recorded.', 140)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
                        {selectedReplayStep.label}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {selectedReplayStep.stepNumber ? `Step ${selectedReplayStep.stepNumber}` : `Replay event ${selectedReplayIndex + 1}`}
                        {selectedReplayStep.stepTotal ? ` of ${selectedReplayStep.stepTotal}` : ''}
                        {' · '}
                        {fmtTime(selectedReplayStep.ts)}
                        {selectedReplayStep.elapsedMs != null ? ` · ${fmtMs(selectedReplayStep.elapsedMs)}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span className="orion-chip">{selectedReplayStep.actionType.replace(/_/g, ' ')}</span>
                      <span className="orion-chip">{replayStepTone(selectedReplayStep).label}</span>
                      {formatConfidenceLabel(selectedReplayStep.confidence, selectedReplayStep.certainty) ? (
                        <span className="orion-chip">{formatConfidenceLabel(selectedReplayStep.confidence, selectedReplayStep.certainty)}</span>
                      ) : null}
                      {selectedReplayStep.retryCount && selectedReplayStep.retryCount > 1 ? (
                        <span className="orion-chip">retry {selectedReplayStep.retryCount}</span>
                      ) : null}
                      {selectedReplayStep.replanned ? <span className="orion-chip">replanned</span> : null}
                      {selectedReplayStep.readinessState ? (
                        <span className="orion-chip">{selectedReplayStep.readinessState.replace(/_/g, ' ')}</span>
                      ) : null}
                      {selectedReplayStep.screenshotPath ? (
                        <button
                          className="orion-btn orion-btn-ghost"
                          style={{ minHeight: 36, paddingInline: 12 }}
                          onClick={() => void openArtifactTarget(selectedReplayStep.screenshotPath!)}
                        >
                          Open screenshot
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div
                    style={{
                      borderRadius: 16,
                      overflow: 'hidden',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-panel)',
                    }}
                  >
                    {selectedReplayStep.screenshotPath ? (
                      <ReplayScreenshotPreview
                        path={selectedReplayStep.screenshotPath}
                        alt={selectedReplayStep.label}
                        marker={{ x: selectedReplayStep.x, y: selectedReplayStep.y }}
                      />
                    ) : (
                      <div
                        style={{
                          minHeight: 320,
                          display: 'grid',
                          placeItems: 'center',
                          color: 'var(--text-secondary)',
                          fontSize: 12,
                        }}
                      >
                        No screenshot evidence was recorded for this step.
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gap: 10,
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    }}
                  >
                    <div
                      style={{
                        borderRadius: 14,
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-element)',
                        padding: '12px 14px',
                        display: 'grid',
                        gap: 6,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Planner reason
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                        {selectedReplayStep.reason || 'No planner reason recorded for this step.'}
                      </div>
                      {selectedReplayStep.replanned ? (
                        <div style={{ fontSize: 11, color: 'var(--warning-fg)' }}>
                          Planner explicitly replanned this step before continuing.
                        </div>
                      ) : null}
                    </div>
                    <div
                      style={{
                        borderRadius: 14,
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-element)',
                        padding: '12px 14px',
                        display: 'grid',
                        gap: 6,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Step outcome
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.55, color: selectedReplayStep.success === false ? 'var(--error-fg)' : 'var(--text-primary)' }}>
                        {selectedReplayStep.error
                          || selectedReplayStep.groundingSummary
                          || selectedReplayStep.readinessSummary
                          || selectedReplayStep.detail
                          || (selectedReplayStep.phase === 'paused' || selectedReplayStep.mode === 'paused' || selectedReplayStep.mode === 'takeover'
                            ? 'Paused for operator takeover or further input.'
                            : selectedReplayStep.success === false
                              ? 'This step failed.'
                              : 'Step completed successfully.')}
                      </div>
                    </div>
                    <div
                      style={{
                        borderRadius: 14,
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-element)',
                        padding: '12px 14px',
                        display: 'grid',
                        gap: 6,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Action summary
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                        {selectedReplayStep.textSummary
                          ? selectedReplayStep.textSummary
                          : selectedReplayStep.url
                            ? compactText(selectedReplayStep.url, '--', 180)
                            : selectedReplayStep.x != null && selectedReplayStep.y != null
                              ? `Targeted coordinates (${Math.round(selectedReplayStep.x)}, ${Math.round(selectedReplayStep.y)}).`
                              : 'No action payload summary recorded.'}
                      </div>
                      {selectedReplayStep.textSummaryRedacted ? (
                        <div style={{ fontSize: 11, color: 'var(--warning-fg)' }}>
                          Redacted by policy.
                        </div>
                      ) : null}
                    </div>
                    <div
                      style={{
                        borderRadius: 14,
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-element)',
                        padding: '12px 14px',
                        display: 'grid',
                        gap: 6,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Reliability signals
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                        {selectedReplayStep.readinessSummary
                          || selectedReplayStep.groundingSummary
                          || (selectedReplayStep.retryCount && selectedReplayStep.retryCount > 1
                            ? `Retried ${selectedReplayStep.retryCount} times before reaching this state.`
                            : 'No extra readiness or grounding note was recorded.')}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {formatConfidenceLabel(selectedReplayStep.confidence, selectedReplayStep.certainty) ? (
                          <span className="orion-chip">{formatConfidenceLabel(selectedReplayStep.confidence, selectedReplayStep.certainty)}</span>
                        ) : null}
                        {selectedReplayStep.retryCount && selectedReplayStep.retryCount > 1 ? (
                          <span className="orion-chip">retry {selectedReplayStep.retryCount}</span>
                        ) : null}
                        {selectedReplayStep.replanned ? <span className="orion-chip">replanned</span> : null}
                        {selectedReplayStep.recoveryStrategy ? (
                          <span className="orion-chip">{selectedReplayStep.recoveryStrategy.replace(/_/g, ' ')}</span>
                        ) : null}
                      </div>
                    </div>
                    <div
                      style={{
                        borderRadius: 14,
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-element)',
                        padding: '12px 14px',
                        display: 'grid',
                        gap: 6,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Evidence
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, wordBreak: 'break-word' }}>
                        {selectedReplayStep.screenshotPath || selectedReplayStep.filePath || 'No artifact path recorded.'}
                      </div>
                      {(selectedReplayStep.x != null && selectedReplayStep.y != null) ? (
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          Target marker at {Math.round(selectedReplayStep.x)}, {Math.round(selectedReplayStep.y)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
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
                        <ArtifactImagePreview path={item} alt={item} />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{item}</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="orion-btn orion-btn-primary"
                          style={{ minHeight: 44, paddingInline: 12 }}
                          onClick={(event) => {
                            event.stopPropagation();
                            void openArtifactTarget(item);
                          }}
                        >
                          Open
                        </button>
                        <Link
                          className="orion-btn orion-btn-ghost"
                          style={{ minHeight: 44, paddingInline: 12 }}
                          href={artifactWorkspaceHref(item)}
                          onClick={(event) => event.stopPropagation()}
                        >
                          Inspect in assets
                        </Link>
                        {desktopBridge?.desktop && isLocalFileTarget(item) ? (
                          <button
                            className="orion-btn orion-btn-ghost"
                            style={{ minHeight: 44, paddingInline: 12 }}
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
                            <a href={item} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-base)' }}>
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
                            style={{ minHeight: 44, paddingInline: 12 }}
                            onClick={() => void openArtifactTarget(item)}
                          >
                            Open
                          </button>
                          <Link
                            className="orion-btn orion-btn-ghost"
                            style={{ minHeight: 44, paddingInline: 12 }}
                            href={artifactWorkspaceHref(item)}
                          >
                            Inspect in assets
                          </Link>
                          {desktopBridge?.desktop && isLocalFileTarget(item) ? (
                            <button
                              className="orion-btn orion-btn-ghost"
                              style={{ minHeight: 44, paddingInline: 12 }}
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
      <PageDialog
        open={hardKillDialogOpen}
        portalTarget={modalPortalTarget}
        title="Hard Kill Run"
        onClose={() => {
          if (!hardKillBusy) setHardKillDialogOpen(false);
        }}
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={() => setHardKillDialogOpen(false)} disabled={hardKillBusy}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleHardKillRun()} disabled={hardKillBusy}>
              {hardKillBusy ? 'Interrupting…' : 'Confirm Hard Kill'}
            </Button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            This sends an immediate hard interrupt to <strong>{runId.slice(0, 8)}</strong> and stops any active local execution as fast as the runtime can enforce it.
          </div>
          <div>
            Machine: <strong>{String(runDetail?.machine_id || runDetail?.runtime_id || 'Not assigned').trim() || 'Not assigned'}</strong>
          </div>
          <div>
            Current state: <strong>{interruptRequested ? 'Interrupt already requested' : effectiveRunStatus || 'unknown'}</strong>
          </div>
        </div>
      </PageDialog>
    </div>
  );
}

export default function RunInspectPage() {
  return (
    <Suspense fallback={<div className="orion-page-shell is-static-entry" />}>
      <RunInspectPageContent />
    </Suspense>
  );
}
