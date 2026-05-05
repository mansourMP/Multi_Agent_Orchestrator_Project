'use client';

import Link from 'next/link';
import { type ReactNode } from 'react';
import {
  Brain,
  Camera,
  Check,
  CircleAlert,
  FileText,
  Search,
  ShieldCheck,
  SquareTerminal,
  Wrench,
} from 'lucide-react';

import type { CodexTranscriptCell } from './cells';

export type CodexApprovalAction = 'allow_once' | 'allow_session' | 'deny';

function formatTimestamp(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function humanizeToken(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '';
  }
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toolActivityLabel(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return 'Using tool';
  }
  if (normalized.includes('telegram')) {
    return normalized.includes('sending') ? 'Sending Telegram' : 'Telegram';
  }
  if (normalized.includes('whatsapp')) {
    return normalized.includes('sending') ? 'Sending WhatsApp' : 'WhatsApp';
  }
  if (normalized.includes('sending email')) {
    return 'Sending email';
  }
  if (normalized.includes('browser')) {
    return 'Browser action';
  }
  if (normalized.includes('web search') || normalized.includes('search')) {
    return 'Searching web';
  }
  return humanizeToken(name) || 'Using tool';
}

function fileActivityLabel(action: string): string {
  const normalized = action.trim().toLowerCase();
  if (
    normalized.includes('write')
    || normalized.includes('delete')
    || normalized.includes('rename')
    || normalized.includes('move')
  ) {
    return 'Updating file';
  }
  return 'Reading file';
}

function providerLabel(cell: CodexTranscriptCell): string {
  if (cell.kind !== 'assistant') {
    return '';
  }
  const parts = [
    humanizeToken(cell.effectiveProvider),
    cell.effectiveModel,
  ].filter(Boolean);
  return parts.join(' · ');
}

const THINKING_ACTIVITY_PREFIXES = [
  'running ',
  'completed ',
  'failed ',
  'stopped ',
  'read ',
  'reading ',
  'search ',
  'searched ',
  'searching ',
  'exploring ',
  'list ',
  'listing ',
  'open ',
  'opened ',
  'find ',
  'finding ',
  'edit ',
  'edited ',
  'write ',
  'writing ',
  'wrote ',
  'apply ',
  'applied ',
] as const;

function normalizedThinkingContent(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.toLowerCase().startsWith('thinking...')) {
    return trimmed.slice('thinking...'.length).trim();
  }
  if (trimmed.toLowerCase() === 'thinking') {
    return '';
  }
  return trimmed;
}

function compactActivityPreview(text: string): string | null {
  const lines = normalizedThinkingContent(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return null;
  }
  const activityLines = lines.filter((line) => {
    const lower = line.toLowerCase();
    return THINKING_ACTIVITY_PREFIXES.some((prefix) => lower.startsWith(prefix));
  });
  if (activityLines.length === lines.length) {
    return activityLines.at(-1) ?? null;
  }
  if (activityLines.length === 1) {
    return activityLines[0] ?? null;
  }
  return null;
}

function compactSystemDetail(value: string | null | undefined, fallback: string): string {
  const trimmed = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return fallback;
  }
  const lower = trimmed.toLowerCase();
  const isJsonLike = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
  const looksDebugLike =
    isJsonLike
    || lower.startsWith('event:')
    || lower.startsWith('data:')
    || lower.includes('"event_type"')
    || lower.includes('"payload"')
    || lower.includes('"metadata"')
    || lower.includes('trace_id')
    || lower.includes('tool_call_id')
    || lower.includes('activity_event_id');
  if (looksDebugLike) {
    return fallback;
  }
  return trimmed.length > 140 ? `${trimmed.slice(0, 137).trimEnd()}…` : trimmed;
}

function statusPrimaryLabel(label: string): string {
  const normalized = label.trim().toLowerCase();
  if (!normalized) {
    return 'Done';
  }
  if (normalized === 'final outcome ready' || normalized === 'done') {
    return 'Done';
  }
  if (normalized.includes('approval')) {
    return 'Needs your OK';
  }
  return humanizeToken(label) || 'Done';
}

function SystemInlineRow({
  icon,
  kind,
  primary,
  secondary,
  state,
  dimmed,
}: {
  icon: ReactNode;
  kind: string;
  primary: string;
  secondary: string;
  state: 'running' | 'done' | 'error';
  dimmed: boolean;
}) {
  return (
    <article
      data-chat-role="system"
      data-chat-activity-kind={kind}
      className={`app-chat-system-row app-chat-system-row--${state}${dimmed ? ' app-chat-system-row--dimmed' : ''}`}
    >
      <span className="app-chat-system-row__icon" aria-hidden="true">{icon}</span>
      <span className="app-chat-system-row__primary">{primary}</span>
      <span className="app-chat-system-row__secondary">{secondary}</span>
    </article>
  );
}

export function UserCell({ cell }: { cell: Extract<CodexTranscriptCell, { kind: 'user' }> }) {
  const timestamp = formatTimestamp(cell.createdAt);
  return (
    <article data-chat-role="user" className="app-chat-message">
      <div className="app-chat-message__content">{cell.content.trim()}</div>
      {timestamp ? (
        <div className="app-chat-message__meta">
          <time className="app-chat-message__timestamp" dateTime={cell.createdAt ?? undefined}>
            {timestamp}
          </time>
        </div>
      ) : null}
    </article>
  );
}

export function AssistantCell({ cell }: { cell: Extract<CodexTranscriptCell, { kind: 'assistant' }> }) {
  const timestamp = formatTimestamp(cell.createdAt);
  const effectiveLabel = providerLabel(cell);
  const text = cell.content.trim();
  return (
    <article data-chat-role="assistant" className="app-chat-message">
      <div className="app-chat-message__content">{text}</div>
      {(timestamp || effectiveLabel || cell.isIncomplete) ? (
        <div className={`app-chat-message__meta${effectiveLabel || cell.isIncomplete ? ' app-chat-message__meta--visible' : ''}`}>
          {effectiveLabel ? (
            <span className="app-chat-message__provider">{effectiveLabel}</span>
          ) : null}
          {cell.isIncomplete ? (
            <span className="app-chat-message__status">Incomplete</span>
          ) : null}
          <time className="app-chat-message__timestamp" dateTime={cell.createdAt ?? undefined}>
            {timestamp}
          </time>
        </div>
      ) : null}
    </article>
  );
}

export function ReasoningSummaryCell({
  cell,
}: {
  cell: Extract<CodexTranscriptCell, { kind: 'reasoning_summary' }>;
}) {
  const text = cell.text.trim();
  const activityLine = compactSystemDetail(cell.activityLine || compactActivityPreview(text), 'Working');

  return (
    <article
      data-chat-role="system"
      data-chat-activity-kind="thinking"
      className={`app-chat-thinking-row${cell.isStreaming ? ' app-chat-thinking-row--streaming' : ''}${cell.dimmed ? ' app-chat-thinking-row--dimmed' : ''}`}
    >
      <div className="app-chat-thinking-row__header">
        <span className="app-chat-thinking-row__pulse" aria-hidden="true" />
        <span className="app-chat-thinking-row__label">Thinking</span>
      </div>
      <div className="app-chat-thinking-row__activity">{activityLine}</div>
    </article>
  );
}

export function ExecCell({ cell }: { cell: Extract<CodexTranscriptCell, { kind: 'exec' }> }) {
  return (
    <SystemInlineRow
      kind="shell"
      icon={cell.status === 'done'
        ? <Check size={14} strokeWidth={2} />
        : cell.status === 'error'
          ? <CircleAlert size={14} strokeWidth={2} />
          : <SquareTerminal size={14} strokeWidth={1.9} />}
      primary="Running shell"
      secondary={compactSystemDetail(cell.command, cell.status === 'done' ? 'Done' : cell.status === 'error' ? 'Failed' : 'Running')}
      state={cell.status}
      dimmed={cell.dimmed === true}
    />
  );
}

export function ToolCallCell({ cell }: { cell: Extract<CodexTranscriptCell, { kind: 'tool' }> }) {
  return (
    <SystemInlineRow
      kind={toolActivityLabel(cell.name || '').toLowerCase().replace(/\s+/g, '_')}
      icon={cell.status === 'done'
        ? <Check size={14} strokeWidth={2} />
        : cell.status === 'error'
          ? <CircleAlert size={14} strokeWidth={2} />
          : <Wrench size={14} strokeWidth={1.9} />}
      primary={toolActivityLabel(cell.name || '')}
      secondary={compactSystemDetail(cell.result, cell.status === 'done' ? 'Done' : cell.status === 'error' ? 'Failed' : (cell.name || 'Running'))}
      state={cell.status}
      dimmed={cell.dimmed === true}
    />
  );
}

export function WebSearchCell({ cell }: { cell: Extract<CodexTranscriptCell, { kind: 'web_search' }> }) {
  const state = cell.status === 'searching' ? 'running' : cell.status;
  return (
    <SystemInlineRow
      kind="search"
      icon={cell.status === 'done'
        ? <Check size={14} strokeWidth={2} />
        : cell.status === 'error'
          ? <CircleAlert size={14} strokeWidth={2} />
          : <Search size={14} strokeWidth={1.9} />}
      primary="Searching web"
      secondary={compactSystemDetail(cell.query, cell.status === 'done' ? 'Done' : cell.status === 'error' ? 'Failed' : 'Searching')}
      state={state}
      dimmed={cell.dimmed === true}
    />
  );
}

export function FileChangeCell({ cell }: { cell: Extract<CodexTranscriptCell, { kind: 'file_change' }> }) {
  return (
    <SystemInlineRow
      kind="file"
      icon={cell.status === 'done'
        ? <Check size={14} strokeWidth={2} />
        : cell.status === 'error'
          ? <CircleAlert size={14} strokeWidth={2} />
          : <FileText size={14} strokeWidth={1.9} />}
      primary={fileActivityLabel(cell.action || '')}
      secondary={compactSystemDetail(cell.filename, cell.status === 'done' ? 'Done' : 'File')}
      state={cell.status}
      dimmed={cell.dimmed === true}
    />
  );
}

export function ScreenshotCell({ cell }: { cell: Extract<CodexTranscriptCell, { kind: 'screenshot' }> }) {
  return (
    <SystemInlineRow
      kind="artifact"
      icon={cell.status === 'done'
        ? <Camera size={14} strokeWidth={1.9} />
        : <CircleAlert size={14} strokeWidth={2} />}
      primary="Screenshot/artifact"
      secondary={compactSystemDetail(cell.caption, cell.status === 'done' ? 'Captured' : 'Failed')}
      state={cell.status}
      dimmed={cell.dimmed === true}
    />
  );
}

export function ApprovalCell({
  cell,
  resolvingApprovalId,
  onResolveApproval,
}: {
  cell: Extract<CodexTranscriptCell, { kind: 'approval_request' }>;
  resolvingApprovalId?: string | null;
  onResolveApproval?: (approvalId: string, action: CodexApprovalAction) => void;
}) {
  const approvalId = typeof cell.metadata?.approval_id === 'string'
    ? cell.metadata.approval_id
    : typeof cell.metadata?.id === 'string'
      ? cell.metadata.id
      : cell.id;
  const resolving = Boolean(resolvingApprovalId && resolvingApprovalId === approvalId);
  const canResolve = Boolean(approvalId && onResolveApproval && cell.status === 'waiting');
  return (
    <article
      data-chat-role="system"
      data-chat-activity-kind="approval"
      className={`app-chat-approval-cell app-chat-system-row--${cell.status === 'waiting' ? 'running' : cell.status}${cell.dimmed ? ' app-chat-system-row--dimmed' : ''}`}
    >
      <span className="app-chat-system-row__icon" aria-hidden="true">
        <ShieldCheck size={14} strokeWidth={1.9} />
      </span>
      <div className="app-chat-approval-cell__copy">
        <span className="app-chat-system-row__primary">Needs your OK</span>
        <span className="app-chat-system-row__secondary">
          {compactSystemDetail(
            cell.prompt,
            cell.status === 'waiting' ? 'Choose 1 allow once, 2 allow session, or 3 deny' : cell.status === 'done' ? 'Done' : 'Failed',
          )}
        </span>
      </div>
      {canResolve ? (
        <div className="app-chat-approval-cell__actions">
          <button
            type="button"
            disabled={resolving}
            onClick={() => onResolveApproval?.(approvalId, 'allow_once')}
          >
            <kbd>1</kbd>
            <span>{resolving ? 'Allowing' : 'Allow once'}</span>
          </button>
          <button
            type="button"
            disabled={resolving}
            onClick={() => onResolveApproval?.(approvalId, 'allow_session')}
          >
            <kbd>2</kbd>
            <span>Allow session</span>
          </button>
          <button
            type="button"
            disabled={resolving}
            onClick={() => onResolveApproval?.(approvalId, 'deny')}
          >
            <kbd>3</kbd>
            <span>Deny</span>
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function StatusCell({ cell }: { cell: Extract<CodexTranscriptCell, { kind: 'status' }> }) {
  return (
    <SystemInlineRow
      kind={statusPrimaryLabel(cell.label || '').toLowerCase().replace(/\s+/g, '_')}
      icon={cell.status === 'done'
        ? <Check size={14} strokeWidth={2} />
        : cell.status === 'error'
          ? <CircleAlert size={14} strokeWidth={2} />
          : <Brain size={14} strokeWidth={1.9} />}
      primary={statusPrimaryLabel(cell.label || 'Status')}
      secondary={compactSystemDetail(cell.detail, cell.status === 'done' ? 'Done' : cell.status === 'error' ? 'Failed' : 'Running')}
      state={cell.status === 'idle' ? 'running' : cell.status}
      dimmed={cell.dimmed === true}
    />
  );
}

export function ErrorCell({ cell }: { cell: Extract<CodexTranscriptCell, { kind: 'error' }> }) {
  const actionHref = typeof cell.metadata?.action_href === 'string' ? cell.metadata.action_href : '';
  const actionLabel = typeof cell.metadata?.action_label === 'string' ? cell.metadata.action_label : '';
  const lowerMessage = cell.message.toLowerCase();
  const message = lowerMessage.includes('ollama')
    || lowerMessage.includes('selected provider')
    || lowerMessage.includes('selected for chat')
    || lowerMessage.includes('local-only')
    ? 'Choose Empyralis credits, add an AI model key, or connect this computer.'
    : cell.message;
  return (
    <article data-chat-role="system" className="app-chat-transcript-error">
      <span className="app-chat-transcript-error__icon" aria-hidden="true">
        <CircleAlert size={14} strokeWidth={1.9} />
      </span>
      <div className="app-chat-transcript-error__copy">
        <strong>AI model attention needed</strong>
        <span>{message}</span>
      </div>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="app-chat-transcript-error__link">
          {actionLabel}
        </Link>
      ) : null}
    </article>
  );
}

export function CodexChatCell({
  cell,
  resolvingApprovalId,
  onResolveApproval,
}: {
  cell: CodexTranscriptCell;
  resolvingApprovalId?: string | null;
  onResolveApproval?: (approvalId: string, action: CodexApprovalAction) => void;
}) {
  switch (cell.kind) {
    case 'user':
      return <UserCell cell={cell} />;
    case 'assistant':
      return <AssistantCell cell={cell} />;
    case 'reasoning_summary':
      return <ReasoningSummaryCell cell={cell} />;
    case 'exec':
      return <ExecCell cell={cell} />;
    case 'tool':
      return <ToolCallCell cell={cell} />;
    case 'web_search':
      return <WebSearchCell cell={cell} />;
    case 'file_change':
      return <FileChangeCell cell={cell} />;
    case 'screenshot':
      return <ScreenshotCell cell={cell} />;
    case 'approval_request':
      return (
        <ApprovalCell
          cell={cell}
          resolvingApprovalId={resolvingApprovalId}
          onResolveApproval={onResolveApproval}
        />
      );
    case 'status':
      return <StatusCell cell={cell} />;
    case 'error':
      return <ErrorCell cell={cell} />;
    default:
      return null;
  }
}
