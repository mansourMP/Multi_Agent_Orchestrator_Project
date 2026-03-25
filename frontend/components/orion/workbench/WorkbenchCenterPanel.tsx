'use client';

import { Fragment, createElement, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { Bot, Camera, CheckCircle2, FileText, Globe, Send, ShieldCheck, Sparkles, Terminal } from 'lucide-react';
import { UI, fmtTime, formatDurationMs, type AgentRoleOption, type ExecutionSummary, type LogEntry, type PackResult as PackResultType } from '@/app/page.catalog';
import { LogViewer } from '@/components/orion/LogViewer';
import { formatExecutionTargetLabel } from '@/lib/executionTargets';
import { safeNavigate } from '@/lib/safeNavigate';
import type { WorkbenchAgentChatMessage } from './WorkbenchControlDeck';

type ApprovalQueueItem = {
  runId: string;
  approvalId: string;
  prompt: string;
  labels: string[];
  capabilities: string[];
  expiresAt: string | null;
  status: string;
};

type ApprovalAuditItem = {
  id: string;
  ts: string;
  stage: string;
  decision: string;
  actor: string;
  source: string;
  runId: string | null;
  note: string | null;
};

function approvalDisplayText(item: ApprovalQueueItem): string {
  if (item.labels.length > 0) return item.labels.join(' · ');
  return item.prompt;
}

type RecentRunItem = {
  run_id: string;
  status: string;
  created_at: string | null;
  duration_ms: number | null;
  pack_id: string | null;
  agent_role: string | null;
  result_summary: string | null;
  usage_provider?: string | null;
  usage_model?: string | null;
  execution_target_selected?: string | null;
};

type RunReceiptData = {
  id: string;
  status: string;
  packId: string;
  createdAt: string | null;
  durationMs: number | null;
  firstValueMs: number | null;
  hitlWaitMs: number | null;
  routeSelected: string | null;
  routeRequested: string | null;
  routeReason: string | null;
  summary: string;
};

type ArtifactLedgerItem = {
  label: string;
  detail: string;
};

type LocalExecutionPreviewSummary = {
  textPreview: string | null;
  screenshotPath: string | null;
};

export type HomeLiveAgentCard = {
  id: string;
  agentRole: string | null;
  agentLabel: string;
  state: 'planning' | 'queued' | 'claimed' | 'running' | 'waiting' | 'completed';
  stateLabel: string;
  summary: string;
  localActionLabel: string | null;
  routeKind: 'local' | 'cloud' | 'approval';
  routeLabel: string;
  runId: string | null;
  updatedAt: string | null;
};

export type HomeLiveLocalAction = {
  id: string;
  label: string;
  detail: string;
  stateLabel: string;
  agentLabel: string;
  runId: string | null;
};

export type HomeLiveOverview = {
  activeAgentCount: number;
  localQueuePendingCount: number;
  localQueueClaimedCount: number;
  workerOnlineCount: number;
  workerBusyCount: number;
  approvalWaitingCount: number;
  activeAgentCards: HomeLiveAgentCard[];
  recentLocalActions: HomeLiveLocalAction[];
  updatedAt: string | null;
};

type HomeInboxSessionPreview = {
  sessionKey: string;
  channel: string;
  label: string;
  summary: string;
  updatedAt: string | null;
  eventCount: number;
  inboundCount: number;
  outboundCount: number;
  runId: string | null;
};

type WorkbenchCenterPanelProps = {
  isMobile: boolean;
  isTablet: boolean;
  experienceMode: 'simple' | 'advanced';
  chatMode: 'direct' | 'orchestrate';
  singleAgentMode: boolean;
  selectedAgent: AgentRoleOption;
  goal: string;
  setGoal: (value: string) => void;
  primaryGoalRef: RefObject<HTMLTextAreaElement | null>;
  onSendChat: () => void;
  onRunCommand: () => void;
  setupReady: boolean;
  hasConnectedTools: boolean;
  onRequireSetup: () => void;
  setupGuidanceStatus?: string | null;
  setupGuidanceAction?: {
    label: string;
    href: string;
  } | null;
  chatBusy: boolean;
  chatMessages: WorkbenchAgentChatMessage[];
  workerOnline: number;
  workerPending: number;
  latestRunSummary: string | null;
  autonomyStages: Array<{
    id: string;
    label: string;
    state: 'done' | 'waiting' | 'active' | 'pending';
  }>;
  logs: LogEntry[];
  showLiveLogs: boolean;
  setShowLiveLogs: (v: boolean | ((prev: boolean) => boolean)) => void;
  runId: string | null;
  runReceipt: RunReceiptData | null;
  copyRunReceipt: () => Promise<void>;
  packResult: PackResultType | null;
  executionSummary: unknown;
  riskColor: string;
  trustMode: string;
  copyResultSummary: () => Promise<void>;
  exportRunJson: () => void;
  createFollowUpTask: () => void;
  approvalItems: ApprovalQueueItem[];
  approvalActionBusy: Record<string, boolean>;
  onResolvePendingApproval: (runId: string, approvalId: string, decision: 'Proceed' | 'Hold') => void;
  approvalAuditItems: ApprovalAuditItem[];
  recentRuns: RecentRunItem[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  onOpenRun: (runId: string) => void;
  onOpenRunOutput: (runId: string) => void;
  onOpenRunsPage: () => void;
  onOpenApprovalsPage: () => void;
  homeOverview: HomeLiveOverview;
  latestInboxSession: HomeInboxSessionPreview | null;
};

function buildArtifactLedger(packResult: PackResultType | null): ArtifactLedgerItem[] {
  if (!packResult) return [];
  switch (packResult.pack_id) {
    case 'customer-ops-autopilot':
      return [
        { label: 'Bookings', detail: `${packResult.outputs.bookings.length} proposed` },
        { label: 'Follow-ups', detail: `${packResult.outputs.follow_ups.length} prepared` },
        { label: 'Urgent inbox', detail: `${packResult.outputs.urgent_count} flagged` },
        {
          label: 'Connectors',
          detail: `sent ${packResult.connector?.email_sent_count ?? 0} · drafts ${packResult.connector?.email_drafts_created ?? 0} · calendar ${packResult.connector?.calendar_events_created ?? 0}`,
        },
      ];
    case 'weekly-content-studio':
      return packResult.outputs.content_plan.slice(0, 4).map((item) => ({
        label: `${item.day} · ${item.channel}`,
        detail: item.headline,
      }));
    case 'competitor-brief-digest':
      return packResult.outputs.briefs.slice(0, 4).map((item) => ({
        label: item.name,
        detail: `${item.threat_level} · ${item.recommended_play}`,
      }));
    case 'spreadsheet-ops-v1':
      return [
        { label: packResult.outputs.storage === 'onedrive' ? 'OneDrive' : 'File', detail: packResult.outputs.file_path },
        { label: 'Sheet', detail: `${packResult.outputs.sheet_name} · ${packResult.outputs.format.toUpperCase()}` },
        { label: 'Rows', detail: `read ${packResult.outputs.rows_read} · written ${packResult.outputs.rows_written}` },
        { label: 'Operation', detail: packResult.outputs.operation },
      ];
    case 'document-studio-v1':
      return [
        { label: packResult.outputs.storage === 'onedrive' ? 'OneDrive' : 'File', detail: packResult.outputs.file_path },
        { label: 'Format', detail: packResult.outputs.format.toUpperCase() },
        { label: 'Title', detail: packResult.outputs.title },
        { label: 'Items', detail: `${packResult.outputs.items_written} prepared` },
      ];
    case 'local-execution-v1':
      return [
        { label: 'Executed', detail: `${packResult.outputs.operations_executed}/${packResult.outputs.operations_requested} operations` },
        { label: 'Artifacts', detail: `${packResult.outputs.artifacts.length} recorded` },
        { label: 'Errors', detail: `${packResult.outputs.errors.length}` },
        {
          label: 'Local root',
          detail: packResult.inputs.local_root,
        },
        ...packResult.outputs.artifacts.slice(0, 4).map((item) => ({
          label: item.kind,
          detail: item.file_path,
        })),
      ];
    default:
      return [];
  }
}

function buildLocalExecutionPreviewSummary(packResult: PackResultType | null): LocalExecutionPreviewSummary {
  if (!packResult || packResult.pack_id !== 'local-execution-v1') {
    return {
      textPreview: null,
      screenshotPath: null,
    };
  }
  const textPreview =
    packResult.outputs.actions.find((item) => typeof item.content_preview === 'string' && item.content_preview.trim())?.content_preview?.trim() || null;
  const screenshotPath =
    packResult.outputs.artifacts.find((item) => String(item.kind || '').toLowerCase() === 'screenshot')?.file_path || null;
  return {
    textPreview,
    screenshotPath,
  };
}

function localExecutionStepTone(status: string | null | undefined): { color: string; label: string; background: string; border: string } {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'completed' || normalized === 'success') {
    return { color: UI.successFg, label: 'Completed', background: 'var(--success-bg)', border: 'var(--success-border)' };
  }
  if (normalized === 'failed' || normalized === 'error') {
    return { color: UI.errorFg, label: 'Failed', background: 'var(--error-bg)', border: 'var(--error-border)' };
  }
  return { color: UI.textMuted, label: normalized || '--', background: UI.surfaceAlt, border: UI.borderSoft };
}

function compactHomeLine(value: string | null | undefined, fallback: string, max = 82): string {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return fallback;
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).trimEnd()}...`;
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[2] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}:bold:${match.index}`}>{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      nodes.push(<code key={`${keyPrefix}:code:${match.index}`}>{match[3]}</code>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderParagraphWithBreaks(text: string, keyPrefix: string): ReactNode {
  const lines = text.split('\n');
  return (
    <p key={keyPrefix}>
      {lines.map((line, index) => (
        <Fragment key={`${keyPrefix}:line:${index}`}>
          {index > 0 ? <br /> : null}
          {renderInlineMarkdown(line, `${keyPrefix}:${index}`)}
        </Fragment>
      ))}
    </p>
  );
}

function renderMarkdownBlocks(segment: string, keyPrefix: string): ReactNode[] {
  return segment
    .split(/\n{2,}/)
    .map((block, blockIndex) => {
      const trimmed = block.trim();
      if (!trimmed) return null;
      const lines = trimmed.split('\n');
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = Math.min(headingMatch[1].length, 6);
        const headingText = headingMatch[2].trim();
        const headingTag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
        return createElement(
          headingTag,
          { key: `${keyPrefix}:heading:${blockIndex}` },
          renderInlineMarkdown(headingText, `${keyPrefix}:heading:${blockIndex}`),
        );
      }

      const orderedList = lines.every((line) => /^\s*\d+\.\s+/.test(line));
      const unorderedList = lines.every((line) => /^\s*[-*+]\s+/.test(line));
      if (orderedList || unorderedList) {
        const ListTag = orderedList ? 'ol' : 'ul';
        return (
          <ListTag key={`${keyPrefix}:list:${blockIndex}`}>
            {lines.map((line, lineIndex) => (
              <li key={`${keyPrefix}:list:${blockIndex}:${lineIndex}`}>
                {renderInlineMarkdown(line.replace(/^\s*(?:\d+\.|[-*+])\s+/, ''), `${keyPrefix}:list:${blockIndex}:${lineIndex}`)}
              </li>
            ))}
          </ListTag>
        );
      }

      return renderParagraphWithBreaks(trimmed, `${keyPrefix}:paragraph:${blockIndex}`);
    })
    .filter((node): node is ReactNode => node !== null);
}

function renderChatMarkdown(content: string, keyPrefix: string): ReactNode {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) return null;
  const parts: ReactNode[] = [];
  const fencePattern = /```([\w-]+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let segmentIndex = 0;

  while ((match = fencePattern.exec(normalized)) !== null) {
    const before = normalized.slice(lastIndex, match.index).trim();
    if (before) {
      parts.push(...renderMarkdownBlocks(before, `${keyPrefix}:segment:${segmentIndex}`));
      segmentIndex += 1;
    }
    parts.push(
      <pre key={`${keyPrefix}:fence:${segmentIndex}`}>
        <code>{match[2].trimEnd()}</code>
      </pre>,
    );
    segmentIndex += 1;
    lastIndex = match.index + match[0].length;
  }

  const trailing = normalized.slice(lastIndex).trim();
  if (trailing) {
    parts.push(...renderMarkdownBlocks(trailing, `${keyPrefix}:segment:${segmentIndex}`));
  }

  return parts;
}

function normalizeInlineErrorMessage(message: string): string {
  const normalized = message.trim().toLowerCase();
  if (normalized.includes('provider profiles path is not writable')) {
    return '';
  }
  return message.trim();
}

function hasAbsolutePath(line: string): boolean {
  return /(?:^|[\s`(])(?:\/Users\/|\/home\/|\/tmp\/|\/var\/|[A-Z]:[\\/])/.test(line);
}

function sanitizeAssistantDisplayText(content: string): string {
  const lines = content.replace(/\r\n/g, '\n').trim().split('\n');
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (trimmed.toLowerCase().includes('provider profiles path is not writable')) return false;
    if (hasAbsolutePath(trimmed)) return false;
    return true;
  });
  return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

type HomeOperationsSceneProps = {
  isMobile: boolean;
  singleAgentMode: boolean;
  goal: string;
  chatBusy: boolean;
  snapshotStatusLabel: string;
  snapshotStatusTone: { color: string; background: string; border: string };
  overview: HomeLiveOverview;
  approvalItems: ApprovalQueueItem[];
  onOpenAgentsPage: () => void;
  onOpenAgentWorkspace: (agentRole: string) => void;
  onOpenRun: (runId: string) => void;
  onOpenRunOutput: (runId: string) => void;
  onOpenApprovalsPage: () => void;
};

function HomeOperationsScene({
  isMobile,
  singleAgentMode,
  goal,
  chatBusy,
  snapshotStatusLabel,
  snapshotStatusTone,
  overview,
  approvalItems,
  onOpenAgentsPage,
  onOpenAgentWorkspace,
  onOpenRun,
  onOpenRunOutput,
  onOpenApprovalsPage,
}: HomeOperationsSceneProps) {
  const visibleCardLimit = isMobile ? 3 : 6;
  const liveCards = overview.activeAgentCards.filter((card) => card.state !== 'completed');
  const recentCompletedCards = overview.activeAgentCards.filter((card) => card.state === 'completed');
  const visibleCards = liveCards.slice(0, visibleCardLimit);
  const overflowCount = Math.max(0, liveCards.length - visibleCards.length);
  const previewApprovals = approvalItems.slice(0, 2);
  const queueActive = overview.localQueuePendingCount > 0 || overview.localQueueClaimedCount > 0;
  const workerIdleCount = Math.max(0, overview.workerOnlineCount - overview.workerBusyCount);
  const activeWorkersLabel =
    overview.workerOnlineCount > 0
      ? `${overview.workerOnlineCount} online${overview.workerBusyCount > 0 ? ` · ${overview.workerBusyCount} busy` : ''}`
      : 'Offline';
  const queueLabel = queueActive
    ? `${overview.localQueuePendingCount} pending · ${overview.localQueueClaimedCount} claimed`
    : 'Clear';
  const localCapacityLabel =
    overview.workerOnlineCount === 0
      ? 'Offline'
      : queueActive && workerIdleCount === 0
        ? 'At capacity'
        : queueActive
          ? `${workerIdleCount} free slot${workerIdleCount === 1 ? '' : 's'}`
          : 'Ready';
  const localQueueDetail =
    overview.workerOnlineCount === 0
      ? 'Local-only work is blocked until a worker reconnects. Cloud runs can still continue.'
      : queueActive && workerIdleCount === 0
        ? 'All local workers are busy. Screenshots, browser capture, and shell steps will drain as capacity frees up.'
        : queueActive
          ? `${workerIdleCount} worker slot${workerIdleCount === 1 ? '' : 's'} still available while the local queue drains.`
          : `${activeWorkersLabel} and ready for screenshots, browser capture, and shell work.`;
  const courierLabel = chatBusy
    ? 'Dispatching the next outcome'
    : overview.approvalWaitingCount > 0 && overview.activeAgentCount === 0
      ? 'Waiting on approval before the next move'
      : queueActive && overview.workerOnlineCount === 0
        ? 'Local work is blocked until a worker reconnects'
        : queueActive && workerIdleCount === 0
          ? 'Local workers are at capacity'
          : overview.approvalWaitingCount > 0
            ? 'Approvals are holding the next move'
            : queueActive
              ? 'Local workers are processing queued actions'
              : overview.activeAgentCount > 0
                ? singleAgentMode
                  ? 'The assistant is moving work across the workspace'
                  : 'Work is moving across the workspace'
                : goal.trim()
                  ? 'Ready to dispatch'
                  : 'Waiting for a task';
  const standbyTitle =
    overview.approvalWaitingCount > 0 && overview.activeAgentCount === 0
      ? 'Work is paused for approval.'
      : queueActive && overview.workerOnlineCount === 0
        ? 'Local work is queued, but no worker is online.'
        : liveCards.length === 0 && recentCompletedCards.length > 0
          ? singleAgentMode
            ? 'The assistant is idle right now.'
            : 'No live work is active right now.'
        : goal.trim()
          ? 'Ready to dispatch this request.'
          : singleAgentMode
            ? 'No work is active yet.'
            : 'No live work is active yet.';
  const standbyBody =
    overview.approvalWaitingCount > 0 && overview.activeAgentCount === 0
      ? singleAgentMode
        ? 'Open approvals to unblock the next step. The assistant will resume as soon as a decision is made.'
        : 'Open approvals to unblock the next step. Work will resume as soon as a decision is made.'
      : queueActive && overview.workerOnlineCount === 0
        ? 'Cloud work can continue, but screenshots, browser capture, and shell steps will wait until a local companion reconnects.'
        : liveCards.length === 0 && recentCompletedCards.length > 0
          ? 'The floor is idle at the moment. Recent completions are listed below while the workspace waits for the next request.'
        : goal.trim()
          ? 'Send the request above and this floor will show who picked it up, what is queued locally, and where the result is heading.'
          : singleAgentMode
            ? 'Send one concrete outcome above and this floor will show what is queued locally and where results come back.'
            : 'Send one concrete outcome above and this floor will show who picked it up, what is queued locally, and where results come back.';
  const statusItems = [
    { label: 'Active work', value: overview.activeAgentCount > 0 ? String(overview.activeAgentCount) : '0' },
    { label: 'Local queue', value: queueLabel },
    { label: 'Workers', value: overview.workerOnlineCount > 0 ? `${overview.workerBusyCount}/${overview.workerOnlineCount} busy` : 'Offline' },
    { label: 'Approvals', value: overview.approvalWaitingCount > 0 ? `${overview.approvalWaitingCount} waiting` : 'Clear' },
  ];
  const agentStations: Array<{
    id: string;
    label: string;
    detail: string;
    chip: string;
    routeLabel: string;
    drillLabel: string;
    openArtifacts: boolean;
    state: 'active' | 'attention' | 'success' | 'idle';
    accent: string;
    Icon: typeof Bot;
    agentRole: string | null;
    runId: string | null;
  }> = visibleCards.map((card) => {
    const actionMentioned =
      card.localActionLabel && card.stateLabel.toLowerCase().includes(card.localActionLabel.toLowerCase());
    const stationState =
      card.state === 'waiting'
        ? 'attention'
        : card.state === 'completed'
          ? 'success'
          : card.state === 'running' || card.state === 'claimed' || card.state === 'queued' || card.state === 'planning'
            ? 'active'
            : 'idle';
    return {
      id: card.id,
      label: card.agentLabel,
      detail: compactHomeLine(card.summary, 'Watching for work.', 72),
      chip: card.localActionLabel && !actionMentioned ? `${card.stateLabel} · ${card.localActionLabel}` : card.stateLabel,
      routeLabel: card.routeLabel,
      drillLabel: card.runId
        ? (card.routeKind === 'local' ? 'Open output' : 'Inspect run')
        : singleAgentMode
          ? 'Open runs'
          : card.agentRole
            ? 'Open lane'
            : 'Open workspace',
      openArtifacts: card.routeKind === 'local',
      state: stationState,
      accent:
        stationState === 'attention' ? UI.warningFg : stationState === 'success' ? UI.successFg : stationState === 'active' ? UI.accent : UI.textMuted,
      Icon: homeAgentCardIcon(card),
      agentRole: card.agentRole,
      runId: card.runId,
    };
  });
  const recentCompletionStations = recentCompletedCards.slice(0, isMobile ? 2 : 3).map((card) => ({
    id: card.id,
    label: card.agentLabel,
    detail: compactHomeLine(card.summary, 'Recent work finished here.', 76),
    routeLabel: card.routeLabel,
    runId: card.runId,
    openArtifacts: card.routeKind === 'local',
  }));

  return (
    <>
      <section
        className="orion-home-ops-scene"
        style={{
          borderRadius: 14,
          border: `1px solid ${UI.accentBorder}`,
          background: `linear-gradient(180deg, color-mix(in srgb, ${UI.accentSoft} 18%, ${UI.surfaceAlt} 82%) 0%, ${UI.surface} 100%)`,
          padding: isMobile ? 12 : 16,
          display: 'grid',
          gap: 8,
          position: 'relative',
          overflow: 'hidden',
          boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--text-primary) 4%, transparent)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: 3, maxWidth: 520 }}>
            <div style={{ fontSize: 11, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              Live workspace
            </div>
            <div style={{ fontSize: 16, color: UI.textSoft, fontWeight: 800 }}>
              {singleAgentMode ? 'The assistant picks up work here' : 'Live work appears here'}
            </div>
            <div style={{ fontSize: 12, color: UI.textMuted, lineHeight: 1.5 }}>
              Track what is active, what is waiting locally, and when the result comes back.
            </div>
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 28,
              padding: '0 10px',
              borderRadius: 999,
              border: `1px solid ${snapshotStatusTone.border}`,
              background: snapshotStatusTone.background,
              color: snapshotStatusTone.color,
              fontSize: 11.5,
              fontWeight: 800,
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {snapshotStatusLabel}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
            gap: 10,
          }}
        >
          {statusItems.map((item) => (
            <div
              key={item.label}
              style={{
                borderRadius: 12,
                border: `1px solid ${UI.borderSoft}`,
                background: `linear-gradient(180deg, color-mix(in srgb, ${UI.surfaceAlt} 88%, ${UI.surface} 12%) 0%, ${UI.surface} 100%)`,
                padding: '10px 12px',
                display: 'grid',
                gap: 3,
              }}
            >
              <div style={{ fontSize: 10.5, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 14.5, color: UI.textSoft, fontWeight: 800 }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gap: 12,
          }}
        >
          <div
            style={{
              borderRadius: 14,
              border: `1px solid ${UI.borderSoft}`,
              background: `linear-gradient(180deg, color-mix(in srgb, ${UI.surfaceAlt} 84%, ${UI.surface} 16%) 0%, ${UI.surface} 100%)`,
              padding: isMobile ? '12px 12px 12px' : '12px 14px 12px',
              display: 'grid',
              gap: 10,
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                Agent floor
              </div>
              <div
                className="orion-home-agent-courier"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 28,
                  padding: '0 10px',
                  borderRadius: 999,
                  border: `1px solid ${UI.accentBorder}`,
                  background: UI.accentSoft,
                  color: UI.accent,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <span className="orion-home-agent-courier-track" aria-hidden />
                <span
                  className="orion-home-agent-courier-bird"
                  aria-hidden
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 999,
                    background: UI.surface,
                    display: 'grid',
                    placeItems: 'center',
                    position: 'absolute',
                    top: 4,
                    left: 6,
                  }}
                >
                  <Send size={11} />
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 700, paddingLeft: 18 }}>{courierLabel}</span>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                gap: 10,
                alignItems: 'stretch',
              }}
            >
              {agentStations.length === 0 ? (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    borderRadius: 14,
                    border: `1px dashed ${UI.border}`,
                    background: UI.surface,
                    padding: isMobile ? '16px 14px' : '18px 16px',
                    display: 'grid',
                    gap: 4,
                  }}
                >
                  <div style={{ fontSize: 13.5, color: UI.textSoft, fontWeight: 700 }}>
                    {standbyTitle}
                  </div>
                  <div style={{ fontSize: 12, color: UI.textMuted, lineHeight: 1.5 }}>
                    {standbyBody}
                  </div>
                </div>
              ) : (
                agentStations.map((station, index) => {
                  const tone =
                    station.state === 'attention'
                      ? {
                          border: `1px solid ${UI.warningBorder}`,
                          background: `linear-gradient(180deg, color-mix(in srgb, ${UI.warningBg} 76%, ${UI.surface} 24%) 0%, ${UI.surface} 100%)`,
                          iconBg: UI.warningBg,
                          iconColor: UI.warningFg,
                        }
                      : station.state === 'success'
                        ? {
                            border: `1px solid ${UI.successBorder}`,
                            background: `linear-gradient(180deg, color-mix(in srgb, ${UI.successBg} 78%, ${UI.surface} 22%) 0%, ${UI.surface} 100%)`,
                            iconBg: UI.successBg,
                            iconColor: UI.successFg,
                          }
                        : station.state === 'active'
                          ? {
                              border: `1px solid ${UI.accentBorder}`,
                              background: `linear-gradient(180deg, color-mix(in srgb, ${UI.accentSoft} 72%, ${UI.surface} 28%) 0%, ${UI.surface} 100%)`,
                              iconBg: UI.accentSoft,
                              iconColor: UI.accent,
                            }
                          : {
                              border: `1px solid ${UI.borderSoft}`,
                              background: `linear-gradient(180deg, color-mix(in srgb, ${UI.surfaceAlt} 86%, ${UI.surface} 14%) 0%, ${UI.surface} 100%)`,
                              iconBg: UI.surface,
                              iconColor: UI.textMuted,
                            };
                  const Icon = station.Icon;
                  return (
                    <button
                      key={station.id}
                      type="button"
                      className={`orion-home-agent-station is-${station.state}`}
                      onClick={() => {
                        if (station.runId) {
                          if (station.openArtifacts) {
                            onOpenRunOutput(station.runId);
                          } else {
                            onOpenRun(station.runId);
                          }
                          return;
                        }
                        if (station.agentRole) {
                          onOpenAgentWorkspace(station.agentRole);
                          return;
                        }
                        onOpenAgentsPage();
                      }}
                      style={{
                        borderRadius: 14,
                        border: tone.border,
                        background: tone.background,
                        padding: '14px 14px 12px',
                        display: 'grid',
                        gap: 10,
                        minWidth: 0,
                        position: 'relative',
                        minHeight: isMobile ? 108 : 122,
                        animationDelay: `${index * 0.6}s`,
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: 10,
                          right: 10,
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: station.accent,
                          boxShadow: `0 0 0 4px color-mix(in srgb, ${station.accent} 12%, transparent)`,
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 11,
                            background: tone.iconBg,
                            color: tone.iconColor,
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <Icon size={16} />
                        </div>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            minHeight: 24,
                            padding: '0 8px',
                            borderRadius: 999,
                            border: `1px solid ${station.state === 'attention' ? UI.warningBorder : station.state === 'success' ? UI.successBorder : station.state === 'active' ? UI.accentBorder : UI.borderSoft}`,
                            background: station.state === 'attention' ? UI.warningBg : station.state === 'success' ? UI.successBg : station.state === 'active' ? UI.accentSoft : UI.surface,
                            color: station.state === 'attention' ? UI.warningFg : station.state === 'success' ? UI.successFg : station.state === 'active' ? UI.accent : UI.textMuted,
                            fontSize: 10.5,
                            fontWeight: 800,
                            letterSpacing: '0.03em',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {station.chip}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, color: UI.textSoft, fontWeight: 800 }}>{station.label}</div>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: UI.textMuted,
                            lineHeight: 1.45,
                            minWidth: 0,
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                          }}
                          title={station.detail}
                        >
                          {station.detail}
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            minHeight: 22,
                            padding: '0 8px',
                            borderRadius: 999,
                            border: `1px solid ${UI.borderSoft}`,
                            background: UI.surface,
                            color: UI.textMuted,
                            fontSize: 10.5,
                            fontWeight: 700,
                          }}
                        >
                          {station.routeLabel}
                        </span>
                        <span style={{ fontSize: 10.5, color: station.accent, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          {station.drillLabel}
                        </span>
                      </div>
                      <div
                        style={{
                          height: 10,
                          borderRadius: 999,
                          background: 'color-mix(in srgb, var(--text-primary) 6%, transparent)',
                          overflow: 'hidden',
                          position: 'relative',
                        }}
                      >
                        <span
                          className={`orion-home-agent-station-fill is-${station.state}`}
                          style={{
                            display: 'block',
                            height: '100%',
                            width:
                              station.state === 'success'
                                ? '100%'
                                : station.state === 'attention'
                                  ? '54%'
                                  : station.state === 'active'
                                    ? '72%'
                                    : '34%',
                            borderRadius: 999,
                            background:
                              station.state === 'attention'
                                ? UI.warningFg
                                : station.state === 'success'
                                  ? UI.successFg
                                  : station.state === 'active'
                                    ? UI.accent
                                    : 'color-mix(in srgb, var(--text-primary) 16%, transparent)',
                          }}
                        />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            {overflowCount > 0 ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="orion-btn orion-btn-ghost"
                  style={{ minHeight: 32, padding: '0 12px', fontSize: 11.5 }}
                  onClick={onOpenAgentsPage}
                >
                  +{overflowCount} more active
                </button>
              </div>
            ) : null}
          </div>

          {recentCompletionStations.length > 0 ? (
            <div
              style={{
                borderRadius: 14,
                border: `1px solid ${UI.borderSoft}`,
                background: UI.surface,
                padding: isMobile ? '12px 12px' : '12px 14px',
                display: 'grid',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                  Recent completions
                </div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: 22,
                    padding: '0 8px',
                    borderRadius: 999,
                    border: `1px solid ${UI.successBorder}`,
                    background: UI.successBg,
                    color: UI.successFg,
                    fontSize: 10.5,
                    fontWeight: 800,
                    letterSpacing: '0.03em',
                    textTransform: 'uppercase',
                  }}
                >
                  Settled
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${recentCompletionStations.length}, minmax(0, 1fr))`, gap: 8 }}>
                {recentCompletionStations.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.runId) {
                        if (item.openArtifacts) {
                          onOpenRunOutput(item.runId);
                        } else {
                          onOpenRun(item.runId);
                        }
                        return;
                      }
                      onOpenAgentsPage();
                    }}
                    style={{
                      borderRadius: 12,
                      border: `1px solid ${UI.borderSoft}`,
                      background: `linear-gradient(180deg, color-mix(in srgb, ${UI.successBg} 58%, ${UI.surface} 42%) 0%, ${UI.surface} 100%)`,
                      padding: '12px 12px 11px',
                      display: 'grid',
                      gap: 5,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 12.5, color: UI.textSoft, fontWeight: 800 }}>{item.label}</div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: UI.textMuted,
                        lineHeight: 1.45,
                        minWidth: 0,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                      title={item.detail}
                    >
                      {item.detail}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          minHeight: 22,
                          padding: '0 8px',
                          borderRadius: 999,
                          border: `1px solid ${UI.borderSoft}`,
                          background: UI.surface,
                          color: UI.textMuted,
                          fontSize: 10.5,
                          fontWeight: 700,
                        }}
                      >
                        {item.routeLabel}
                      </span>
                      <span style={{ fontSize: 10.5, color: UI.successFg, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        {item.openArtifacts ? 'Open output' : 'Inspect run'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <section
          style={{
            borderRadius: 14,
            border: `1px solid ${queueActive ? UI.accentBorder : UI.borderSoft}`,
            background: queueActive
              ? `linear-gradient(180deg, color-mix(in srgb, ${UI.accentSoft} 40%, ${UI.surface} 60%) 0%, ${UI.surface} 100%)`
              : UI.surface,
            padding: isMobile ? '14px 14px' : '14px 16px',
            display: 'grid',
            gap: 8,
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'grid', gap: 3 }}>
              <div style={{ fontSize: 11, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                Local queue
              </div>
              <div style={{ fontSize: 14, color: UI.textSoft, fontWeight: 800 }}>
                {queueActive ? queueLabel : 'Nothing is waiting on the local companion'}
              </div>
            </div>
            {!singleAgentMode ? (
              <button
                type="button"
                onClick={onOpenAgentsPage}
                className="orion-btn orion-btn-ghost"
                style={{ minHeight: 32, padding: '0 12px', fontSize: 11.5 }}
              >
                Open workspace
              </button>
            ) : null}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))',
              gap: 8,
            }}
          >
            {[
              { label: 'Pending', value: String(overview.localQueuePendingCount) },
              { label: 'Claimed', value: String(overview.localQueueClaimedCount) },
              { label: 'Capacity', value: localCapacityLabel },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  borderRadius: 12,
                  border: `1px solid ${UI.borderSoft}`,
                  background: UI.surface,
                  padding: '10px 12px',
                  display: 'grid',
                  gap: 3,
                }}
              >
                <div style={{ fontSize: 10.5, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 13, color: UI.textSoft, fontWeight: 800 }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: UI.textMuted, lineHeight: 1.5 }}>
            {localQueueDetail}
          </div>
          {overview.recentLocalActions.length > 0 ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {overview.recentLocalActions.slice(0, isMobile ? 2 : 3).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.runId) {
                      onOpenRunOutput(item.runId);
                      return;
                    }
                    onOpenAgentsPage();
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    minHeight: 28,
                    padding: '0 10px',
                    borderRadius: 999,
                    border: `1px solid ${UI.borderSoft}`,
                    background: UI.surface,
                    color: UI.textSoft,
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                  title={`${item.stateLabel} · ${item.detail}`}
                >
                  {item.label}
                  <span style={{ color: UI.textMuted, fontWeight: 600 }}>
                    {item.agentLabel}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </section>

        {previewApprovals.length > 0 ? (
          <button
            type="button"
            onClick={onOpenApprovalsPage}
            style={{
              borderRadius: 14,
              border: `1px solid ${UI.warningBorder}`,
              background: `linear-gradient(180deg, color-mix(in srgb, ${UI.warningBg} 74%, ${UI.surface} 26%) 0%, ${UI.surface} 100%)`,
              padding: isMobile ? '14px 14px' : '14px 16px',
              display: 'grid',
              gap: 8,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'grid', gap: 3 }}>
                <div style={{ fontSize: 11, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                  Approvals waiting
                </div>
                <div style={{ fontSize: 14, color: UI.warningFg, fontWeight: 800 }}>
                  {overview.approvalWaitingCount} decision{overview.approvalWaitingCount === 1 ? '' : 's'} need review
                </div>
              </div>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 24,
                  padding: '0 9px',
                  borderRadius: 999,
                  border: `1px solid ${UI.warningBorder}`,
                  background: UI.warningBg,
                  color: UI.warningFg,
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: '0.03em',
                  textTransform: 'uppercase',
                }}
              >
                Open approvals
              </span>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {previewApprovals.map((item) => (
                <div
                  key={`${item.runId}:${item.approvalId}:home-preview`}
                  style={{
                    display: 'grid',
                    gap: 3,
                    paddingTop: 6,
                    borderTop: `1px solid ${UI.borderSoft}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12.5,
                      color: UI.textSoft,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={approvalDisplayText(item)}
                  >
                    {approvalDisplayText(item)}
                  </div>
                  <div style={{ fontSize: 11.5, color: UI.textMuted }}>
                    run {item.runId.slice(0, 8)} · {item.status}
                  </div>
                </div>
              ))}
            </div>
          </button>
        ) : null}
      </section>

      <style jsx>{`
        .orion-home-ops-scene::after {
          content: '';
          position: absolute;
          inset: auto -10% -35% 40%;
          height: 120px;
          background: radial-gradient(circle, color-mix(in srgb, var(--primary-base) 14%, transparent) 0%, transparent 72%);
          pointer-events: none;
        }
        .orion-home-agent-courier-track {
          position: absolute;
          inset: 50% 8px auto 8px;
          height: 2px;
          transform: translateY(-50%);
          border-radius: 999px;
          background: color-mix(in srgb, var(--primary-base) 18%, transparent);
        }
        .orion-home-agent-courier-bird {
          animation: orionHomeCourierFlight 5.8s linear infinite;
        }
        .orion-home-agent-station.is-active,
        .orion-home-agent-station.is-attention,
        .orion-home-agent-station.is-success {
          animation: orionHomeNodeFloat 6.2s ease-in-out infinite;
        }
        .orion-home-agent-station-fill.is-active,
        .orion-home-agent-station-fill.is-attention,
        .orion-home-agent-station-fill.is-success {
          animation: orionHomeStationFill 3.6s ease-in-out infinite;
        }
        @keyframes orionHomeCourierFlight {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(calc(100% - 28px));
          }
        }
        @keyframes orionHomeNodeFloat {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-2px);
          }
        }
        @keyframes orionHomeStationFill {
          0%,
          100% {
            transform: scaleX(0.94);
            opacity: 0.92;
          }
          50% {
            transform: scaleX(1);
            opacity: 1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .orion-home-agent-courier-bird,
          .orion-home-agent-station,
          .orion-home-agent-station-fill {
            animation: none !important;
          }
        }
      `}</style>
    </>
  );
}

void HomeOperationsScene;

export function WorkbenchCenterPanel({
  isMobile,
  isTablet,
  experienceMode,
  chatMode,
  singleAgentMode,
  selectedAgent,
  goal,
  setGoal,
  primaryGoalRef,
  onSendChat,
  onRunCommand,
  setupReady,
  hasConnectedTools,
  onRequireSetup,
  setupGuidanceStatus = null,
  setupGuidanceAction = null,
  chatBusy,
  chatMessages,
  workerOnline,
  workerPending,
  latestRunSummary,
  autonomyStages,
  logs,
  showLiveLogs,
  setShowLiveLogs,
  runId,
  runReceipt,
  copyRunReceipt,
  packResult,
  executionSummary,
  riskColor,
  trustMode,
  copyResultSummary,
  exportRunJson,
  createFollowUpTask,
  approvalItems,
  approvalActionBusy,
  onResolvePendingApproval,
  approvalAuditItems,
  recentRuns,
  selectedRunId,
  onSelectRun,
  onOpenRun,
  onOpenRunOutput,
  onOpenRunsPage,
  onOpenApprovalsPage,
  homeOverview,
  latestInboxSession,
}: WorkbenchCenterPanelProps) {
  const isSimpleMode = experienceMode === 'simple';
  const activeStage = autonomyStages.find((stage) => stage.state === 'active')?.label ?? null;
  const waitingStages = autonomyStages.filter((stage) => stage.state === 'waiting').length;
  const completedStages = autonomyStages.filter((stage) => stage.state === 'done').length;
  const focusApprovalItems = approvalItems.slice(0, 3);
  const latestAuditItem = approvalAuditItems[0] ?? null;
  const typedExecutionSummary = executionSummary && typeof executionSummary === 'object'
    ? (executionSummary as ExecutionSummary)
    : null;
  const runContextSummary = typedExecutionSummary || packResult?.execution_summary || null;
  const artifactLedger = buildArtifactLedger(packResult);
  const localExecutionPreview = buildLocalExecutionPreviewSummary(packResult);
  const localExecutionSteps = packResult?.pack_id === 'local-execution-v1' ? packResult.outputs.steps || [] : [];
  const nextSteps = packResult?.next_steps?.slice(0, 3) ?? [];
  const approvalLead = focusApprovalItems[0] ?? null;
  const isIdleSession =
    !runId &&
    logs.length === 0 &&
    !latestRunSummary &&
    !runReceipt &&
    !packResult &&
    focusApprovalItems.length === 0 &&
    recentRuns.length === 0;
  const formatAgentLabel = (role: string | null) => {
    if (!role) return '--';
    if (singleAgentMode && role.toLowerCase() === 'orchestrator') return 'Assistant';
    return role
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };
  const panelSectionStyle = {
    padding: '10px 0 0',
    display: 'grid',
    gap: 8,
    borderTop: `1px solid ${UI.borderSoft}`,
  } as const;
  const firstPanelSectionStyle = {
    ...panelSectionStyle,
    paddingTop: 0,
    borderTop: 'none',
  } as const;
  const subtleBlockStyle = {
    borderRadius: 14,
    border: `1px solid ${UI.borderSoft}`,
    background: `linear-gradient(180deg, color-mix(in srgb, ${UI.surfaceAlt} 86%, ${UI.surface} 14%) 0%, ${UI.surfaceAlt} 100%)`,
    padding: '14px 16px',
    boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--text-primary) 4%, transparent)',
  } as const;
  const minimalMetricCardStyle = {
    borderRadius: 14,
    border: `1px solid ${UI.borderSoft}`,
    background: `linear-gradient(180deg, color-mix(in srgb, ${UI.surfaceAlt} 84%, ${UI.surface} 16%) 0%, ${UI.surface} 100%)`,
    padding: '14px 16px',
    display: 'grid',
    gap: 5,
    boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--text-primary) 4%, transparent)',
  } as const;
  const sendLabel = singleAgentMode
    ? 'Send to assistant'
    : chatMode === 'orchestrate'
      ? 'Start orchestration'
      : `Send to ${selectedAgent.label}`;
  const sendDisabled = chatBusy || !goal.trim();
  const invokePrimarySend = () => {
    if (!setupReady) {
      onRequireSetup();
      return;
    }
    if (goal.trim().startsWith('/')) {
      onRunCommand();
      return;
    }
    onSendChat();
  };
  const homeSceneStatusLabel = focusApprovalItems.length > 0
    ? 'Approval needed'
    : homeOverview.activeAgentCount > 0
      ? singleAgentMode
        ? 'Assistant active'
        : 'Agents active'
      : homeOverview.localQueuePendingCount > 0 || homeOverview.localQueueClaimedCount > 0
        ? 'Local queue busy'
        : homeOverview.workerOnlineCount === 0
          ? 'Worker offline'
          : recentRuns.length > 0 || homeOverview.recentLocalActions.length > 0
            ? 'Standby'
            : 'Idle';
  const homeSceneStatusTone =
    focusApprovalItems.length > 0
      ? { color: UI.warningFg, background: UI.warningBg, border: UI.warningBorder }
      : homeOverview.workerOnlineCount === 0
        ? { color: UI.errorFg, background: UI.errorBg, border: UI.errorBorder }
        : homeOverview.activeAgentCount > 0 || homeOverview.localQueuePendingCount > 0 || homeOverview.localQueueClaimedCount > 0
          ? { color: UI.accent, background: UI.accentSoft, border: UI.accentBorder }
          : { color: UI.textMuted, background: UI.surfaceAlt, border: UI.borderSoft };
  const snapshotStatusLabel = isSimpleMode
    ? homeSceneStatusLabel
    : focusApprovalItems.length > 0
      ? 'Approval needed'
      : runReceipt?.status
        ? toTitleCase(runReceipt.status)
        : activeStage
          ? 'Running'
          : latestRunSummary
            ? 'Completed'
            : 'Idle';
  const snapshotStatusTone = isSimpleMode
    ? homeSceneStatusTone
    : focusApprovalItems.length > 0
      ? { color: UI.warningFg, background: UI.warningBg, border: UI.warningBorder }
      : runReceipt?.status === 'error'
        ? { color: UI.errorFg, background: UI.errorBg, border: UI.errorBorder }
        : activeStage || latestRunSummary
          ? { color: UI.successFg, background: UI.successBg, border: UI.successBorder }
          : { color: UI.textMuted, background: UI.surfaceAlt, border: UI.borderSoft };
  const snapshotRiskLabel = String(runContextSummary?.risk_level || 'low').toUpperCase();
  const snapshotTrustLabel = String(runContextSummary?.trust_mode_applied || trustMode || '--');
  const snapshotRouteLabel = runReceipt?.routeSelected || runReceipt?.routeRequested || '--';
  const snapshotNextAction =
    (approvalLead ? approvalDisplayText(approvalLead) : null) ||
    runContextSummary?.next_action ||
    (activeStage ? `Continue ${activeStage.toLowerCase()}.` : null) ||
    (singleAgentMode
      ? 'Describe the outcome you want so the assistant can proceed.'
      : chatMode === 'orchestrate'
        ? 'Describe the outcome you want so Empyralis can route the work.'
        : `Send the next message to ${selectedAgent.label}.`);
  const showOperatingSnapshot = !isSimpleMode || !isIdleSession || Boolean(approvalLead);
  const showApprovalQueue = !isSimpleMode || focusApprovalItems.length > 0 || Boolean(latestAuditItem);
  const showRecentActivity = !isSimpleMode || recentRuns.length > 0;
  const starterPrompts =
    isSimpleMode
      ? [
          'Plan my next task.',
          'Summarize what needs attention.',
          'Help me finish setup.',
        ]
      : singleAgentMode
        ? [
            'Plan the next workflow and keep approvals grouped together.',
            'Summarize open items and propose next steps.',
          ]
        : chatMode === 'orchestrate'
          ? [
              'Plan the next workflow and keep approvals grouped together.',
              'Check the current blockers and route the next actions.',
            ]
          : [
              `Ask ${selectedAgent.label} to handle one concrete task.`,
              `Prepare the next message or follow-up for ${selectedAgent.label}.`,
            ];
  const applyStarterPrompt = (prompt: string) => {
    setGoal(prompt);
    primaryGoalRef.current?.focus();
  };
  const hasReturningSignals =
    Boolean(latestInboxSession) ||
    recentRuns.length > 0 ||
    homeOverview.recentLocalActions.length > 0 ||
    homeOverview.activeAgentCount > 0 ||
    focusApprovalItems.length > 0;
  const isReturningHome = setupReady && hasConnectedTools && hasReturningSignals;
  const hasChatHistory = chatMessages.length > 0;
  const inlineProviderError = useMemo(() => {
    const providerError = [...chatMessages]
      .reverse()
      .find((message) => message.status === 'error' && message.content.toLowerCase().includes('provider profiles path is not writable'));
    return providerError ? normalizeInlineErrorMessage(providerError.content) : null;
  }, [chatMessages]);
  const renderedSimpleChatMessages = useMemo(
    () =>
      chatMessages.filter(
        (message) => !(message.status === 'error' && message.content.toLowerCase().includes('provider profiles path is not writable')),
      ),
    [chatMessages],
  );
  const simpleChatThreadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isSimpleMode) return;
    const element = primaryGoalRef.current;
    if (!element) return;
    const minHeight = 36;
    const maxHeight = 140;
    element.style.height = '0px';
    const nextHeight = Math.max(minHeight, Math.min(element.scrollHeight, maxHeight));
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [goal, isSimpleMode, primaryGoalRef]);

  useEffect(() => {
    if (!isSimpleMode || renderedSimpleChatMessages.length === 0) return;
    const element = simpleChatThreadRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [isSimpleMode, renderedSimpleChatMessages.length]);

  if (isSimpleMode) {
    return (
      <section
        className={`orion-chat-surface${renderedSimpleChatMessages.length > 0 ? ' has-history' : ''}`}
        style={{
          minHeight: renderedSimpleChatMessages.length > 0 ? (isMobile ? 'calc(100vh - 146px)' : 'calc(100vh - 158px)') : isMobile ? 'calc(100vh - 124px)' : 'calc(100vh - 136px)',
          borderRadius: 0,
          border: 'none',
          background: 'transparent',
          padding: renderedSimpleChatMessages.length > 0 ? (isMobile ? '8px 8px 18px' : '6px 12px 22px') : isMobile ? '18px 8px 28px' : '30px 12px 40px',
          display: 'grid',
          justifyItems: 'center',
          alignContent: renderedSimpleChatMessages.length > 0 ? 'start' : 'center',
          alignSelf: 'stretch',
          boxShadow: 'none',
        }}
      >
        <div className="orion-chat-stage">
          {renderedSimpleChatMessages.length === 0 ? (
            <div className="orion-chat-hero">
              {isReturningHome ? 'What’s next?' : 'What should we work on next?'}
            </div>
          ) : null}

          <section className="orion-chat-thread-wrap">
            {renderedSimpleChatMessages.length > 0 ? (
              <div className="orion-chat-thread" ref={simpleChatThreadRef}>
                {renderedSimpleChatMessages.slice(-12).map((message) => {
                  const isUser = message.role === 'user';
                  const isErrorMessage = message.status === 'error';
                  const displayContent = isUser ? message.content : sanitizeAssistantDisplayText(message.content);
                  const inlineError = isErrorMessage ? normalizeInlineErrorMessage(displayContent) : '';
                  return (
                    <div key={message.id} className={`orion-chat-turn${isUser ? ' is-user' : ' is-assistant'}${isErrorMessage ? ' is-error' : ''}`}>
                      {isUser ? (
                        <div className="orion-chat-user-pill">
                          <div className="orion-chat-user-text">{displayContent}</div>
                          <div className="orion-chat-meta">
                            <span>{fmtTime(message.ts)}</span>
                          </div>
                        </div>
                      ) : isErrorMessage && inlineError ? (
                        <div className="orion-chat-assistant-block">
                          <div className="orion-chat-error-line">⚠ {inlineError}</div>
                          <div className="orion-chat-meta">
                            <span>{fmtTime(message.ts)}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="orion-chat-assistant-block">
                          <div className="orion-chat-markdown">{renderChatMarkdown(displayContent, message.id)}</div>
                          <div className="orion-chat-meta">
                            <span>{fmtTime(message.ts)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {inlineProviderError ? <div className="orion-chat-inline-error">⚠ {inlineProviderError}</div> : null}
            {setupGuidanceStatus ? (
              <div className="orion-chat-v2-status-line" style={{ marginBottom: 8 }}>
                <span>⚠ {setupGuidanceStatus}</span>
                {setupGuidanceAction ? (
                  <button
                    type="button"
                    className="orion-chat-v2-status-action"
                    onClick={() => safeNavigate(setupGuidanceAction.href)}
                  >
                    {setupGuidanceAction.label}
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className={`orion-chat-composer${renderedSimpleChatMessages.length > 0 ? ' is-docked' : ''}`}>
              <div className="orion-chat-composer-row">
                <button
                  type="button"
                  className="orion-chat-composer-plus"
                  aria-label="Add context"
                >
                  +
                </button>
                <textarea
                  ref={primaryGoalRef}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder={hasChatHistory ? 'Reply to your assistant' : 'Ask anything'}
                  rows={1}
                  style={{
                    width: '100%',
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    padding: 0,
                    resize: 'none',
                    fontSize: hasChatHistory ? (isMobile ? 17 : 18) : isMobile ? 18 : 19,
                    lineHeight: 1.45,
                    height: 36,
                    minHeight: 36,
                    maxHeight: 140,
                    textAlign: 'left',
                  }}
                  className="orion-chat-composer-input"
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault();
                      invokePrimarySend();
                    }
                  }}
                />
                <button
                  onClick={invokePrimarySend}
                  disabled={sendDisabled}
                  className="orion-chat-composer-send"
                  aria-label="Send"
                >
                  →
                </button>
              </div>
              {goal.trim().length > 0 ? (
                <div className="orion-chat-composer-hint">
                  Cmd+Enter to send.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    );
  }

  return (
    <section
      style={{
        borderRadius: 10,
        border: `1px solid ${UI.borderSoft}`,
        background: UI.surface,
        padding: isMobile ? 14 : 18,
        display: 'grid',
        gap: 16,
        alignContent: 'start',
        alignSelf: 'stretch',
        boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--text-primary) 4%, transparent)',
      }}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <section style={firstPanelSectionStyle}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gap: 5 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {singleAgentMode ? 'Assistant lane' : 'Operator lane'}
              </div>
              <div style={{ fontSize: 14, color: UI.textSoft, fontWeight: 700 }}>
                {singleAgentMode ? 'Assistant thread' : chatMode === 'orchestrate' ? 'Main assistant thread' : `${selectedAgent.label} lane`}
              </div>
              <div style={{ fontSize: 12.5, color: UI.textMuted, lineHeight: 1.45 }}>
                {singleAgentMode
                  ? 'Describe the outcome you want. The assistant will handle it end to end.'
                  : chatMode === 'orchestrate'
                    ? 'Describe the outcome you want. Empyralis will decide the next execution path and tools to use.'
                    : `Speak directly to ${selectedAgent.label} and keep the work scoped to that lane.`}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gap: 8,
                maxHeight: isMobile ? 280 : 340,
                overflowY: 'auto',
                paddingRight: 2,
              }}
            >
              {chatMessages.length === 0 ? (
                <div
                  style={{
                    ...subtleBlockStyle,
                    fontSize: 13,
                    color: UI.textMuted,
                    lineHeight: 1.55,
                    background: UI.surfaceAlt,
                  }}
                >
                  {chatMode === 'orchestrate'
                    ? singleAgentMode
                      ? 'No work is active yet. Start with one outcome and the assistant will pick it up.'
                      : 'No routed work is active yet. Start with one outcome and Empyralis will turn it into tracked work.'
                    : `No direct lane is active yet. Ask ${selectedAgent.label} to handle one concrete task.`}
                </div>
              ) : (
                chatMessages.slice(-10).map((message) => {
                  const isUser = message.role === 'user';
                  const tone =
                    message.status === 'error'
                      ? { background: 'var(--error-bg)', border: '1px solid var(--error-border)', color: 'var(--error-fg)' }
                      : message.status === 'waiting'
                        ? { background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', color: 'var(--warning-fg)' }
                        : isUser
                          ? { background: UI.accentSoft, border: `1px solid ${UI.accentBorder}`, color: UI.text }
                          : { background: UI.surfaceAlt, border: `1px solid ${UI.borderSoft}`, color: UI.text };
                  return (
                    <div key={message.id} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                      <div
                        style={{
                          width: isMobile ? '100%' : 'min(720px, 92%)',
                          display: 'grid',
                          gap: 5,
                          padding: '12px 14px',
                          borderRadius: 14,
                          fontSize: 13.5,
                          lineHeight: 1.5,
                          boxShadow: isUser ? 'inset 0 1px 0 color-mix(in srgb, var(--primary-base) 18%, transparent)' : 'inset 0 1px 0 color-mix(in srgb, var(--text-primary) 4%, transparent)',
                          ...tone,
                        }}
                      >
                        <div style={{ fontSize: 11.5, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                          {isUser ? 'You' : singleAgentMode ? 'Assistant' : chatMode === 'orchestrate' ? 'Orchestrator' : selectedAgent.label}
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message.content}</div>
                        <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 11.5, color: UI.textMuted }}>{fmtTime(message.ts)}</span>
                          {message.status && !isUser ? (
                            <span style={{ fontSize: 11.5, color: message.status === 'completed' ? UI.success : message.status === 'running' ? UI.textMuted : UI.warning, fontWeight: 700 }}>
                              {message.status}
                            </span>
                          ) : null}
                          {message.run_id ? (
                            <button
                              onClick={() => onOpenRun(message.run_id || '')}
                              className="orion-btn orion-btn-ghost"
                              style={{ minHeight: 28, fontSize: 11, padding: '0 9px' }}
                            >
                              Inspect
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {setupGuidanceStatus ? (
                <div className="orion-chat-v2-status-line">
                  <span>⚠ {setupGuidanceStatus}</span>
                  {setupGuidanceAction ? (
                    <button
                      type="button"
                      className="orion-chat-v2-status-action"
                      onClick={() => safeNavigate(setupGuidanceAction.href)}
                    >
                      {setupGuidanceAction.label}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <textarea
                ref={primaryGoalRef}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={
                  singleAgentMode
                    ? 'What should happen next? Describe the outcome you want.'
                    : chatMode === 'orchestrate'
                      ? 'What should happen next? Describe the outcome you want.'
                      : `Give ${selectedAgent.label} one concrete task.`
                }
                rows={isMobile ? 5 : 6}
              style={{
                width: '100%',
                borderRadius: 14,
                border: `1px solid ${UI.borderSoft}`,
                background: UI.surfaceAlt,
                color: UI.text,
                padding: 14,
                  resize: 'vertical',
                  fontSize: 14,
                  lineHeight: 1.55,
                  minHeight: isMobile ? 116 : 132,
                  boxShadow: 'none',
                }}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault();
                    invokePrimarySend();
                  }
                }}
              />
              {isIdleSession ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {starterPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="orion-btn orion-btn-ghost"
                      style={{
                        minHeight: 34,
                        padding: '0 12px',
                        fontSize: 11.5,
                        borderRadius: 999,
                        background: `linear-gradient(180deg, color-mix(in srgb, ${UI.surfaceAlt} 88%, ${UI.surface} 12%) 0%, ${UI.surface} 100%)`,
                      }}
                      onClick={() => applyStarterPrompt(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              ) : null}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ fontSize: 12, color: UI.textMuted, lineHeight: 1.4 }}>
                  {singleAgentMode
                  ? 'Cmd+Enter sends to the assistant. Use /commands here to jump to another page or action.'
                  : chatMode === 'orchestrate'
                      ? 'Cmd+Enter to start assistant routing. Use /commands here to jump to another page or action.'
                      : `Cmd+Enter sends directly to ${selectedAgent.label}.`}
                </div>
                <button
                  onClick={invokePrimarySend}
                  disabled={sendDisabled}
                  className="orion-btn orion-btn-primary"
                  style={{
                    minHeight: 44,
                    paddingInline: 18,
                    background: sendDisabled ? UI.surfaceAlt : UI.accent,
                    borderColor: sendDisabled ? UI.borderSoft : UI.accent,
                    fontSize: 13,
                    color: sendDisabled ? UI.textMuted : 'var(--primary-text)',
                  }}
                >
                  {chatBusy ? 'Sending...' : sendLabel}
                </button>
              </div>
            </div>
          </div>
        </section>

        <div style={panelSectionStyle}>
          <div style={{ display: 'grid', gap: 5 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Lane context
            </div>
            <div style={{ fontSize: 14, color: UI.textSoft, fontWeight: 700 }}>
              {singleAgentMode
                ? `Assistant · ${selectedAgent.description}`
                : chatMode === 'orchestrate'
                  ? `Orchestrator · ${selectedAgent.description}`
                  : `${selectedAgent.label} · ${selectedAgent.description}`}
            </div>
            <div style={{ fontSize: 12.5, color: UI.textMuted, lineHeight: 1.5 }}>
              {activeStage
                ? `Current stage: ${activeStage}`
                : singleAgentMode
                  ? 'No live run yet. Start with one outcome and the assistant will take it from there.'
                  : chatMode === 'orchestrate'
                    ? 'No live run yet. Route one outcome here and Empyralis will turn it into tracked work.'
                    : 'No live run yet. Start here when you want to steer one focused lane directly.'}
            </div>
          </div>
          {isIdleSession ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                gap: 10,
              }}
            >
              <div
                style={{
                  ...minimalMetricCardStyle,
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div style={{ fontSize: 10.5, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Lead</div>
                <div style={{ fontSize: 13.5, color: UI.textSoft, fontWeight: 700 }}>
                  {singleAgentMode ? 'Assistant' : chatMode === 'orchestrate' ? 'Orchestrator' : selectedAgent.label}
                </div>
                <div style={{ fontSize: 12, color: UI.textMuted }}>
                  {singleAgentMode
                    ? 'Plans and executes the work end to end.'
                    : chatMode === 'orchestrate'
                      ? 'Plans the run, chooses tools, and keeps approvals together.'
                      : selectedAgent.description}
                </div>
              </div>
              <div
                style={{
                  ...minimalMetricCardStyle,
                  display: 'grid',
                  gap: 5,
                  minHeight: 116,
                }}
                >
                <div style={{ fontSize: 10.5, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                  Mode
                </div>
                <div style={{ fontSize: 13.5, color: UI.textSoft, fontWeight: 700 }}>
                  {singleAgentMode ? 'Assistant flow' : chatMode === 'orchestrate' ? 'Assistant routing' : `Direct ${selectedAgent.label}`}
                </div>
                <div style={{ fontSize: 12, color: UI.textMuted }}>
                  {singleAgentMode
                    ? 'All tasks route through one assistant with shared context.'
                    : chatMode === 'orchestrate'
                      ? 'Empyralis picks the right tools and keeps the work linked together.'
                      : 'Use this lane for direct task steering or one-off interventions.'}
                </div>
              </div>
              <div
                style={{
                  ...minimalMetricCardStyle,
                  display: 'grid',
                  gap: 5,
                  minHeight: 116,
                }}
              >
                <div style={{ fontSize: 10.5, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Runtime</div>
                <div style={{ fontSize: 13.5, color: UI.textSoft, fontWeight: 700 }}>{runtimeLabel(workerOnline, workerPending)}</div>
                <div style={{ fontSize: 12, color: UI.textMuted }}>
                  Approvals and run history appear here after the first run starts.
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                gap: 6,
              }}
            >
              <div style={{ display: 'grid', gap: 3 }}>
                <div style={{ fontSize: 10, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Progress</div>
                <div style={{ fontSize: 12, color: UI.textSoft }}>
                  done {completedStages}/{autonomyStages.length}{waitingStages > 0 ? ` · waiting ${waitingStages}` : ''}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 3 }}>
                <div style={{ fontSize: 10, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Workers</div>
                <div style={{ fontSize: 12, color: UI.textSoft }}>{workerOnline} online · queue {workerPending}</div>
              </div>
              <div style={{ display: 'grid', gap: 3 }}>
                <div style={{ fontSize: 10, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Latest result</div>
                <div
                  style={{
                    fontSize: 12,
                    color: latestRunSummary ? UI.textSoft : UI.textMuted,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={latestRunSummary || ''}
                >
                  {latestRunSummary || 'No completed run yet.'}
                </div>
              </div>
            </div>
          )}
        </div>

        {showOperatingSnapshot ? (
        <section style={panelSectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Run snapshot
            </div>
            {approvalLead ? (
              <button
                onClick={onOpenApprovalsPage}
                className="orion-btn orion-btn-ghost"
                style={{ minHeight: 28, fontSize: 11, padding: '0 8px' }}
              >
                Open Approvals
              </button>
            ) : null}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
              gap: 8,
            }}
          >
            <div
              style={{
                borderRadius: 14,
                border: `1px solid ${snapshotStatusTone.border}`,
                background: snapshotStatusTone.background,
                padding: '12px 14px',
                display: 'grid',
                gap: 4,
              }}
            >
              <div style={{ fontSize: 10.5, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                Status
              </div>
              <div style={{ fontSize: 13.5, color: snapshotStatusTone.color, fontWeight: 700 }}>
                {snapshotStatusLabel}
              </div>
            </div>
            <div
              style={{
                ...minimalMetricCardStyle,
                padding: '10px 12px',
              }}
            >
              <div style={{ fontSize: 10.5, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                Risk
              </div>
              <div style={{ fontSize: 13.5, color: riskColor, fontWeight: 700 }}>
                {snapshotRiskLabel}
              </div>
            </div>
            <div
              style={{
                ...minimalMetricCardStyle,
                padding: '10px 12px',
              }}
            >
              <div style={{ fontSize: 10.5, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                Trust
              </div>
              <div style={{ fontSize: 13.5, color: UI.textSoft, fontWeight: 700 }}>
                {snapshotTrustLabel}
              </div>
            </div>
            <div
              style={{
                ...minimalMetricCardStyle,
                padding: '10px 12px',
              }}
            >
              <div style={{ fontSize: 10.5, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                Route
              </div>
              <div style={{ fontSize: 13.5, color: UI.textSoft, fontWeight: 700 }}>
                {snapshotRouteLabel}
              </div>
            </div>
          </div>
          <div
            style={{
              borderRadius: 10,
              border: `1px solid ${approvalLead ? UI.warningBorder : UI.borderSoft}`,
              background: approvalLead ? UI.warningBg : UI.surfaceAlt,
              padding: '14px 16px',
              display: 'grid',
              gap: 8,
              boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--text-primary) 4%, transparent)',
            }}
          >
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 10.5, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                Next action
              </div>
              <div style={{ fontSize: 13, color: approvalLead ? UI.warningFg : UI.textSoft, lineHeight: 1.45, fontWeight: 600 }}>
                {snapshotNextAction}
              </div>
              {runReceipt?.routeReason ? (
                <div style={{ fontSize: 11.5, color: UI.textMuted, lineHeight: 1.45 }}>
                  Why this route: {runReceipt.routeReason}
                </div>
              ) : latestAuditItem ? (
                <div style={{ fontSize: 11.5, color: UI.textMuted, lineHeight: 1.45 }}>
                  Latest decision {latestAuditItem.decision} · {fmtTime(latestAuditItem.ts)}
                </div>
              ) : null}
            </div>
            {approvalLead ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  onClick={() => onResolvePendingApproval(approvalLead.runId, approvalLead.approvalId, 'Proceed')}
                  disabled={Boolean(approvalActionBusy[`${approvalLead.runId}:${approvalLead.approvalId}:Proceed`])}
                  className="orion-btn orion-btn-success"
                  style={{ minHeight: 30, fontSize: 11, padding: '0 10px' }}
                >
                  Approve
                </button>
                <button
                  onClick={() => onResolvePendingApproval(approvalLead.runId, approvalLead.approvalId, 'Hold')}
                  disabled={Boolean(approvalActionBusy[`${approvalLead.runId}:${approvalLead.approvalId}:Hold`])}
                  className="orion-btn orion-btn-ghost"
                  style={{ minHeight: 30, fontSize: 11, padding: '0 10px' }}
                >
                  Hold
                </button>
                <button
                  onClick={() => onOpenRun(approvalLead.runId)}
                  className="orion-btn orion-btn-ghost"
                  style={{ minHeight: 30, fontSize: 11, padding: '0 10px' }}
                >
                  Inspect run
                </button>
              </div>
            ) : null}
          </div>
        </section>
        ) : null}

        {showApprovalQueue ? (
        <div style={panelSectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {isSimpleMode ? 'Needs your decision' : 'Approvals'}
            </div>
            <button
              onClick={onOpenApprovalsPage}
              className="orion-btn orion-btn-ghost"
              style={{ minHeight: 28, fontSize: 11, padding: '0 8px' }}
            >
              Open Approvals
            </button>
          </div>
          {focusApprovalItems.length > 0 ? (
            <div style={{ display: 'grid', gap: 6 }}>
              {focusApprovalItems.map((item) => (
                <div
                  key={`${item.runId}:${item.approvalId}:focus`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '88px minmax(0, 1fr) auto',
                    gap: 8,
                    alignItems: 'center',
                    padding: '8px 0',
                    borderTop: `1px solid ${UI.borderSoft}`,
                  }}
                >
                  <button
                    onClick={() => onOpenRun(item.runId)}
                    className="orion-btn orion-btn-ghost"
                    style={{
                      minHeight: 28,
                      justifyContent: 'flex-start',
                      padding: '0 8px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                    }}
                  >
                    Inspect
                  </button>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        color: UI.textSoft,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={approvalDisplayText(item)}
                    >
                      {approvalDisplayText(item)}
                    </div>
                    <div style={{ fontSize: 11, color: UI.textMuted }}>
                      {item.status}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => onResolvePendingApproval(item.runId, item.approvalId, 'Proceed')}
                      disabled={Boolean(approvalActionBusy[`${item.runId}:${item.approvalId}:Proceed`])}
                      className="orion-btn orion-btn-success"
                      style={{ minHeight: 28, fontSize: 11, padding: '0 8px' }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => onResolvePendingApproval(item.runId, item.approvalId, 'Hold')}
                      disabled={Boolean(approvalActionBusy[`${item.runId}:${item.approvalId}:Hold`])}
                      className="orion-btn orion-btn-ghost"
                      style={{ minHeight: 28, fontSize: 11, padding: '0 8px' }}
                    >
                      Hold
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 3 }}>
              <div style={{ fontSize: 12, color: UI.textMuted }}>
                Nothing needs permission right now.
              </div>
              {latestAuditItem ? (
                <div style={{ fontSize: 11, color: UI.textMuted }}>
                  Latest decision {latestAuditItem.decision} · {fmtTime(latestAuditItem.ts)}
                </div>
              ) : null}
            </div>
          )}
        </div>
        ) : null}

        {isIdleSession ? (
          <section style={panelSectionStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {isSimpleMode ? 'What to try' : 'Next steps'}
            </div>
            <div style={{ display: 'grid', gap: 7 }}>
              <div style={{ fontSize: 12, color: UI.textSoft }}>
                {isSimpleMode
                  ? 'Describe one concrete outcome for the assistant.'
                  : singleAgentMode
                    ? 'Describe one concrete outcome for the assistant.'
                    : `Ask ${selectedAgent.label} to handle one concrete task.`}
              </div>
              <div style={{ fontSize: 11.5, color: UI.textMuted }}>
                {isSimpleMode
                  ? 'Use Workflows when the pattern becomes repeatable, or open Runs after the first result lands.'
                  : singleAgentMode
                    ? 'Use Workflows when the pattern should be reusable, or open Runs after you start work.'
                    : chatMode === 'orchestrate'
                      ? 'Use orchestration for multi-step outcomes. Use Workflows when the pattern should be reusable.'
                      : 'Use Workflows when the task should be reusable, or open Runs after you start work.'}
              </div>
            </div>
          </section>
        ) : (
          <LogViewer
            logs={logs}
            showLiveLogs={showLiveLogs}
            setShowLiveLogs={setShowLiveLogs}
            isMobile={isMobile}
            isTablet={isTablet}
            runId={runId}
          />
        )}

        {showRecentActivity ? (
        <section style={panelSectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Run history
            </div>
            <button
              onClick={onOpenRunsPage}
              className="orion-btn orion-btn-ghost"
              style={{ minHeight: 28, fontSize: 11, padding: '0 8px' }}
            >
              Open Runs
            </button>
          </div>
          {recentRuns.length === 0 ? (
            <div style={{ fontSize: 12, color: UI.textMuted }}>No recent runs yet.</div>
          ) : (
            <div style={{ borderTop: `1px solid ${UI.borderSoft}` }}>
              {recentRuns.slice(0, 4).map((item) => {
                const active = selectedRunId === item.run_id;
                const statusTone = runStatusTone(item.status);
                const recentActivityMeta = [
                  item.pack_id ? toTitleCase(item.pack_id) : null,
                  item.execution_target_selected ? formatExecutionTargetLabel(item.execution_target_selected) : null,
                  item.usage_provider ? item.usage_provider : null,
                  item.usage_model ? item.usage_model : null,
                ].filter(Boolean).join(' · ');
                return (
                  <div
                    key={item.run_id}
                    onClick={() => onSelectRun(item.run_id)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : '112px 132px minmax(0, 1fr)',
                      gap: 8,
                      padding: '10px 0',
                      borderBottom: `1px solid ${UI.borderSoft}`,
                      alignItems: 'start',
                      cursor: 'pointer',
                      background: active ? UI.accentSoft : 'transparent',
                    }}
                  >
                    <div style={{ fontSize: 11, color: UI.textMuted }}>
                      {item.created_at ? fmtTime(item.created_at) : '--'}
                    </div>
                    <div style={{ display: 'grid', gap: 2 }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          minHeight: 22,
                          width: 'fit-content',
                          padding: '0 8px',
                          borderRadius: 999,
                          border: `1px solid ${statusTone.border}`,
                          background: statusTone.background,
                          fontSize: 10.5,
                          color: statusTone.color,
                          fontWeight: 800,
                          letterSpacing: '0.03em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {toTitleCase(item.status)}
                      </span>
                      <div style={{ fontSize: 11, color: UI.textMuted }}>
                        {formatAgentLabel(item.agent_role)}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: UI.textSoft,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={item.result_summary || ''}
                      >
                        {item.result_summary || 'No summary available.'}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: recentActivityMeta ? UI.textMuted : UI.textMuted,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={recentActivityMeta}
                      >
                        {recentActivityMeta || `run ${item.run_id.slice(0, 8)}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        ) : null}

        {runReceipt || packResult ? (
          <section
            style={{
              ...panelSectionStyle,
              gap: 8,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
                <div style={{ display: 'grid', gap: 3 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Latest run
                  </div>
                  <div style={{ fontSize: 12, color: UI.textSoft }}>
                  {runReceipt?.summary || packResult?.summary || 'Latest run context'}
                </div>
              </div>
              {runReceipt ? (
                <div style={{ fontSize: 11, color: UI.textMuted }}>
                  run {runReceipt.id.slice(0, 8)} · {runReceipt.packId}
                </div>
              ) : null}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))',
                gap: 6,
              }}
            >
              {runReceipt ? (
                <>
                  <div style={{ display: 'grid', gap: 3 }}>
                    <div style={{ fontSize: 10, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Pack</div>
                    <div style={{ fontSize: 12, color: UI.textSoft }}>{runReceipt.packId}</div>
                  </div>
                  <div style={{ display: 'grid', gap: 3 }}>
                    <div style={{ fontSize: 10, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Duration</div>
                    <div style={{ fontSize: 12, color: UI.textSoft }}>{runReceipt.durationMs !== null ? formatDurationMs(runReceipt.durationMs) : '--'}</div>
                  </div>
                  <div style={{ display: 'grid', gap: 3 }}>
                    <div style={{ fontSize: 10, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>First value</div>
                    <div style={{ fontSize: 12, color: UI.textSoft }}>{runReceipt.firstValueMs !== null ? formatDurationMs(runReceipt.firstValueMs) : '--'}</div>
                  </div>
                  <div style={{ display: 'grid', gap: 3 }}>
                    <div style={{ fontSize: 10, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Started</div>
                    <div style={{ fontSize: 12, color: UI.textSoft }}>{runReceipt.createdAt ? fmtTime(runReceipt.createdAt) : '--'}</div>
                  </div>
                  <div style={{ display: 'grid', gap: 3 }}>
                    <div style={{ fontSize: 10, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Human wait</div>
                    <div style={{ fontSize: 12, color: UI.textSoft }}>{runReceipt.hitlWaitMs !== null ? formatDurationMs(runReceipt.hitlWaitMs) : '--'}</div>
                  </div>
                  <div style={{ display: 'grid', gap: 3 }}>
                    <div style={{ fontSize: 10, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Route reason</div>
                    <div
                      style={{
                        fontSize: 12,
                        color: runReceipt.routeReason ? UI.textSoft : UI.textMuted,
                        lineHeight: 1.45,
                      }}
                      title={runReceipt.routeReason || ''}
                    >
                      {runReceipt.routeReason || '--'}
                    </div>
                  </div>
                </>
              ) : null}
              {runContextSummary && typeof runContextSummary.estimated_time_saved_minutes === 'number' ? (
                <div style={{ display: 'grid', gap: 3 }}>
                  <div style={{ fontSize: 10, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Time saved</div>
                  <div style={{ fontSize: 12, color: UI.textSoft }}>
                    ~{runContextSummary.estimated_time_saved_minutes} min
                  </div>
                </div>
              ) : null}
            </div>

            {artifactLedger.length > 0 ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Output ledger
                </div>
                <div style={{ borderTop: `1px solid ${UI.borderSoft}` }}>
                  {artifactLedger.map((item) => (
                    <div
                      key={`${item.label}:${item.detail}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : '140px minmax(0, 1fr)',
                        gap: 8,
                        padding: '8px 0',
                        borderBottom: `1px solid ${UI.borderSoft}`,
                        alignItems: 'start',
                      }}
                    >
                      <div style={{ fontSize: 11, color: UI.textMuted, fontWeight: 700 }}>{item.label}</div>
                      <div style={{ fontSize: 12, color: UI.textSoft, lineHeight: 1.4 }}>{item.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {packResult?.pack_id === 'local-execution-v1' && (localExecutionPreview.textPreview || localExecutionPreview.screenshotPath) ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Local preview
                </div>
                {localExecutionPreview.textPreview ? (
                  <pre
                    style={{
                      margin: 0,
                      padding: 10,
                      borderRadius: 10,
                      border: `1px solid ${UI.borderSoft}`,
                      background: UI.surfaceAlt,
                      color: UI.textSoft,
                      fontSize: 12,
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: 180,
                      overflow: 'auto',
                    }}
                  >
                    {localExecutionPreview.textPreview}
                  </pre>
                ) : null}
                {localExecutionPreview.screenshotPath ? (
                  <div style={{ fontSize: 12, color: UI.textMuted }}>
                    Screenshot captured: <span style={{ color: UI.textSoft }}>{localExecutionPreview.screenshotPath}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {packResult?.pack_id === 'local-execution-v1' && localExecutionSteps.length > 0 ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Execution steps
                </div>
                <div style={{ borderTop: `1px solid ${UI.borderSoft}` }}>
                  {localExecutionSteps.map((step) => {
                    const tone = localExecutionStepTone(step.status);
                    return (
                      <div
                        key={`local-step:${step.step_number}:${step.summary}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: isMobile ? '1fr' : '88px minmax(0, 1fr) auto',
                          gap: 8,
                          padding: '8px 0',
                          borderBottom: `1px solid ${UI.borderSoft}`,
                          alignItems: 'start',
                        }}
                      >
                        <div style={{ display: 'grid', gap: 5, alignContent: 'start' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minWidth: 52,
                              width: 'fit-content',
                              minHeight: 22,
                              padding: '0 8px',
                              borderRadius: 999,
                              border: `1px solid ${UI.borderSoft}`,
                              background: UI.surfaceAlt,
                              fontSize: 10,
                              color: UI.textMuted,
                              fontWeight: 800,
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                            }}
                          >
                            Step {step.step_number}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gap: 4 }}>
                          <div style={{ fontSize: 12, color: UI.textSoft }}>{step.summary}</div>
                          <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                minHeight: 20,
                                padding: '0 7px',
                                borderRadius: 999,
                                border: `1px solid ${UI.borderSoft}`,
                                background: UI.surfaceAlt,
                                fontSize: 10,
                                color: UI.textMuted,
                                fontWeight: 700,
                              }}
                            >
                              {step.tool}
                            </span>
                          </div>
                          {step.artifact_file_path ? (
                            <div style={{ fontSize: 11, color: UI.textMuted, wordBreak: 'break-all' }}>
                              Output: {step.artifact_file_path}
                            </div>
                          ) : null}
                          {step.message ? (
                            <div style={{ fontSize: 11, color: UI.errorFg, wordBreak: 'break-word' }}>
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
              </div>
            ) : null}

            {nextSteps.length > 0 ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Next steps
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  {nextSteps.map((step, index) => (
                    <div key={`${index}:${step}`} style={{ fontSize: 12, color: UI.textSoft, lineHeight: 1.45 }}>
                      {step}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {runReceipt || runId ? (
                <button
                  onClick={() => onOpenRun((runReceipt?.id || runId)!)}
                  className="orion-btn orion-btn-ghost"
                  style={{ minHeight: 30, fontSize: 11, padding: '0 10px' }}
                >
                  {runReceipt ? 'Full inspect' : 'Open live run'}
                </button>
              ) : null}
              {runReceipt && !packResult ? (
                <button
                  onClick={copyRunReceipt}
                  className="orion-btn orion-btn-ghost"
                  style={{ minHeight: 30, fontSize: 11, padding: '0 10px' }}
                >
                  Copy receipt
                </button>
              ) : null}
              {packResult ? (
                <button
                  onClick={copyResultSummary}
                  className="orion-btn orion-btn-ghost"
                  style={{ minHeight: 30, fontSize: 11, padding: '0 10px' }}
                >
                  Copy summary
                </button>
              ) : null}
              {packResult ? (
                <button
                  onClick={exportRunJson}
                  className="orion-btn orion-btn-ghost"
                  style={{ minHeight: 30, fontSize: 11, padding: '0 10px' }}
                >
                  Export JSON
                </button>
              ) : null}
              {packResult ? (
                <button
                  onClick={createFollowUpTask}
                  className="orion-btn orion-btn-ghost"
                  style={{ minHeight: 30, fontSize: 11, padding: '0 10px' }}
                >
                  Follow-up
                </button>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}

function runtimeLabel(workerOnline: number, workerPending: number): string {
  if (workerOnline > 0) return `Workers ${workerOnline} online`;
  if (workerPending > 0) return `Queue ${workerPending} waiting`;
  return 'No active run';
}

function toTitleCase(value: string): string {
  return String(value || '')
    .trim()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function runStatusTone(status: string): { color: string; background: string; border: string } {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'error' || normalized === 'failed') {
    return { color: UI.errorFg, background: UI.errorBg, border: UI.errorBorder };
  }
  if (normalized === 'waiting' || normalized === 'waiting_for_input') {
    return { color: UI.warningFg, background: UI.warningBg, border: UI.warningBorder };
  }
  if (normalized === 'completed' || normalized === 'success') {
    return { color: UI.successFg, background: UI.successBg, border: UI.successBorder };
  }
  return { color: UI.textSoft, background: UI.surfaceAlt, border: UI.borderSoft };
}

function homeAgentCardIcon(card: HomeLiveAgentCard): typeof Bot {
  const action = String(card.localActionLabel || '').trim().toLowerCase();
  if (card.state === 'waiting') return ShieldCheck;
  if (card.state === 'completed') return CheckCircle2;
  if (card.state === 'planning') return Sparkles;
  if (action.includes('screenshot')) return Camera;
  if (action.includes('shell')) return Terminal;
  if (action.includes('browser')) return Globe;
  if (action.includes('file')) return FileText;
  return Bot;
}
