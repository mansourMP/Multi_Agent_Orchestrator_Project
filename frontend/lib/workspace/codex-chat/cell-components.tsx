'use client';

import Link from 'next/link';
import { type ReactNode, useMemo, useState } from 'react';
import {
  Brain,
  Camera,
  Check,
  ChevronRight,
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

type ThinkingDisclosureSection = {
  id: string;
  title: string;
  detail: string;
};

type ThinkingDisclosureContent = {
  sections: ThinkingDisclosureSection[];
  fallbackText: string;
  showsDisclosure: boolean;
};

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

function summaryTitle(line: string): string | null {
  const match = line.match(/^\s*\*\*(.+?)\*\*\s*$/);
  return match?.[1]?.trim() || null;
}

function joinedThinkingBlock(lines: string[]): string {
  return lines.join('\n').trim();
}

function coalescedAdjacentSections(sections: ThinkingDisclosureSection[]): ThinkingDisclosureSection[] {
  const collapsed: ThinkingDisclosureSection[] = [];
  for (const section of sections) {
    const previous = collapsed.at(-1);
    if (!previous || previous.title !== section.title) {
      collapsed.push(section);
      continue;
    }
    const mergedDetail = previous.detail === section.detail || !section.detail
      ? previous.detail
      : !previous.detail || section.detail.includes(previous.detail)
        ? section.detail
        : previous.detail.includes(section.detail)
          ? previous.detail
          : [previous.detail, section.detail].filter(Boolean).join('\n\n');
    collapsed[collapsed.length - 1] = {
      ...previous,
      detail: mergedDetail,
    };
  }
  return collapsed;
}

function parseThinkingDisclosure(rawText: string): ThinkingDisclosureContent {
  const normalizedText = normalizedThinkingContent(rawText);
  if (!normalizedText) {
    return { sections: [], fallbackText: '', showsDisclosure: false };
  }
  const lines = normalizedText.split('\n');
  const preambleLines: string[] = [];
  const sections: ThinkingDisclosureSection[] = [];
  let currentTitle: string | null = null;
  let currentDetailLines: string[] = [];

  const flushCurrent = () => {
    if (!currentTitle) {
      return;
    }
    sections.push({
      id: `${sections.length}-${currentTitle}`,
      title: currentTitle,
      detail: joinedThinkingBlock(currentDetailLines),
    });
    currentDetailLines = [];
  };

  for (const line of lines) {
    const title = summaryTitle(line);
    if (title) {
      flushCurrent();
      currentTitle = title;
      continue;
    }
    if (currentTitle === null) {
      preambleLines.push(line);
    } else {
      currentDetailLines.push(line);
    }
  }
  flushCurrent();

  if (sections.length > 0) {
    const preamble = joinedThinkingBlock(preambleLines);
    if (preamble) {
      const first = sections[0];
      sections[0] = {
        ...first,
        detail: [preamble, first.detail].filter(Boolean).join('\n\n'),
      };
    }
    const mergedSections = coalescedAdjacentSections(sections);
    return {
      sections: mergedSections,
      fallbackText: normalizedText,
      showsDisclosure: mergedSections.length > 0,
    };
  }

  return {
    sections: [],
    fallbackText: normalizedText,
    showsDisclosure: false,
  };
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

function SystemInlineRow({
  icon,
  primary,
  secondary,
  state,
  dimmed,
}: {
  icon: ReactNode;
  primary: string;
  secondary: string;
  state: 'running' | 'done' | 'error';
  dimmed: boolean;
}) {
  return (
    <article className={`app-chat-system-row app-chat-system-row--${state}${dimmed ? ' app-chat-system-row--dimmed' : ''}`}>
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
  const [expanded, setExpanded] = useState(false);
  const text = cell.text.trim();
  const activityLine = cell.activityLine || compactActivityPreview(text);
  const disclosure = useMemo(
    () => parseThinkingDisclosure(text),
    [text],
  );

  if (activityLine) {
    return (
      <article className={`app-chat-thinking-row${cell.isStreaming ? ' app-chat-thinking-row--streaming' : ''}${cell.dimmed ? ' app-chat-thinking-row--dimmed' : ''}`}>
        <div className="app-chat-thinking-row__header">
          <span className="app-chat-thinking-row__pulse" aria-hidden="true" />
          <span className="app-chat-thinking-row__label">Thinking</span>
        </div>
        <div className="app-chat-thinking-row__activity">{activityLine}</div>
      </article>
    );
  }

  return (
    <article className={`app-chat-thinking-row${cell.isStreaming ? ' app-chat-thinking-row--streaming' : ''}${cell.dimmed ? ' app-chat-thinking-row--dimmed' : ''}`}>
      <button
        type="button"
        className="app-chat-thinking-row__toggle"
        onClick={() => setExpanded((current) => !current)}
      >
        <ChevronRight
          size={12}
          strokeWidth={2}
          className={`app-chat-thinking-row__chevron${expanded ? ' app-chat-thinking-row__chevron--expanded' : ''}`}
          aria-hidden="true"
        />
        <span className="app-chat-thinking-row__label">Thinking</span>
      </button>
      {expanded ? (
        <div className="app-chat-thinking-row__detail">
          {disclosure.showsDisclosure
            ? disclosure.sections.map((section) => (
              <div key={section.id} className="app-chat-thinking-row__section">
                <div className="app-chat-thinking-row__section-title">{section.title}</div>
                {section.detail ? (
                  <pre className="app-chat-thinking-row__detail-text">{section.detail}</pre>
                ) : null}
              </div>
            ))
            : <pre className="app-chat-thinking-row__detail-text">{disclosure.fallbackText}</pre>}
        </div>
      ) : null}
    </article>
  );
}

export function ExecCell({ cell }: { cell: Extract<CodexTranscriptCell, { kind: 'exec' }> }) {
  return (
    <SystemInlineRow
      icon={cell.status === 'done'
        ? <Check size={14} strokeWidth={2} />
        : cell.status === 'error'
          ? <CircleAlert size={14} strokeWidth={2} />
          : <SquareTerminal size={14} strokeWidth={1.9} />}
      primary={cell.command || 'Shell'}
      secondary={cell.status === 'done' ? 'Done' : cell.status === 'error' ? 'Failed' : 'Running'}
      state={cell.status}
      dimmed={cell.dimmed === true}
    />
  );
}

export function ToolCallCell({ cell }: { cell: Extract<CodexTranscriptCell, { kind: 'tool' }> }) {
  return (
    <SystemInlineRow
      icon={cell.status === 'done'
        ? <Check size={14} strokeWidth={2} />
        : cell.status === 'error'
          ? <CircleAlert size={14} strokeWidth={2} />
          : <Wrench size={14} strokeWidth={1.9} />}
      primary={cell.name || 'Tool'}
      secondary={cell.status === 'done' ? 'Done' : cell.status === 'error' ? 'Failed' : 'Running'}
      state={cell.status}
      dimmed={cell.dimmed === true}
    />
  );
}

export function WebSearchCell({ cell }: { cell: Extract<CodexTranscriptCell, { kind: 'web_search' }> }) {
  const state = cell.status === 'searching' ? 'running' : cell.status;
  return (
    <SystemInlineRow
      icon={cell.status === 'done'
        ? <Check size={14} strokeWidth={2} />
        : cell.status === 'error'
          ? <CircleAlert size={14} strokeWidth={2} />
          : <Search size={14} strokeWidth={1.9} />}
      primary={cell.query || 'Search'}
      secondary={cell.status === 'done' ? 'Done' : cell.status === 'error' ? 'Failed' : 'Searching'}
      state={state}
      dimmed={cell.dimmed === true}
    />
  );
}

export function FileChangeCell({ cell }: { cell: Extract<CodexTranscriptCell, { kind: 'file_change' }> }) {
  return (
    <SystemInlineRow
      icon={cell.status === 'done'
        ? <Check size={14} strokeWidth={2} />
        : cell.status === 'error'
          ? <CircleAlert size={14} strokeWidth={2} />
          : <FileText size={14} strokeWidth={1.9} />}
      primary={cell.filename || 'File'}
      secondary={cell.action || (cell.status === 'done' ? 'Done' : 'Reading')}
      state={cell.status}
      dimmed={cell.dimmed === true}
    />
  );
}

export function ScreenshotCell({ cell }: { cell: Extract<CodexTranscriptCell, { kind: 'screenshot' }> }) {
  const sizeLabel = cell.width && cell.height ? ` · ${cell.width}x${cell.height}` : '';
  return (
    <SystemInlineRow
      icon={cell.status === 'done'
        ? <Camera size={14} strokeWidth={1.9} />
        : <CircleAlert size={14} strokeWidth={2} />}
      primary={cell.caption || 'Screenshot'}
      secondary={cell.status === 'done' ? `Captured${sizeLabel}` : 'Failed'}
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
    <article className={`app-chat-approval-cell app-chat-system-row--${cell.status === 'waiting' ? 'running' : cell.status}${cell.dimmed ? ' app-chat-system-row--dimmed' : ''}`}>
      <span className="app-chat-system-row__icon" aria-hidden="true">
        <ShieldCheck size={14} strokeWidth={1.9} />
      </span>
      <div className="app-chat-approval-cell__copy">
        <span className="app-chat-system-row__primary">{cell.prompt || 'Approval required'}</span>
        <span className="app-chat-system-row__secondary">
          {cell.status === 'waiting' ? 'Choose 1 allow once, 2 allow session, or 3 deny' : cell.status === 'done' ? 'Done' : 'Failed'}
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
      icon={cell.status === 'done'
        ? <Check size={14} strokeWidth={2} />
        : cell.status === 'error'
          ? <CircleAlert size={14} strokeWidth={2} />
          : <Brain size={14} strokeWidth={1.9} />}
      primary={cell.label || 'Status'}
      secondary={cell.detail || (cell.status === 'done' ? 'Done' : cell.status === 'error' ? 'Failed' : 'Running')}
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
    ? 'Choose Empyralis credits, add a provider key, or connect the required local runtime.'
    : cell.message;
  return (
    <article data-chat-role="system" className="app-chat-transcript-error">
      <span className="app-chat-transcript-error__icon" aria-hidden="true">
        <CircleAlert size={14} strokeWidth={1.9} />
      </span>
      <div className="app-chat-transcript-error__copy">
        <strong>Provider attention needed</strong>
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
