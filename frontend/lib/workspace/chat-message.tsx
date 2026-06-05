'use client';

import Link from 'next/link';
import { type ReactNode, memo, useState } from 'react';
import {
  Brain,
  Check,
  ChevronRight,
  CircleAlert,
  FileText,
  Search,
  Wrench,
} from 'lucide-react';

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

export type WorkstationChatArtifactReference = {
  id: string;
  label: string;
  kind?: string | null;
  mediaType?: string | null;
};

export type WorkstationChatMessageRecord = {
  id: string;
  role: string;
  content: string;
  status: string | null;
  createdAt: string | null;
  runId: string | null;
  approvals: Record<string, unknown>[];
  interventions: Record<string, unknown>[];
  artifacts: WorkstationChatArtifactReference[];
  metadata: Record<string, unknown>;
};

function humanizeToken(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '';
  }
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function effectiveProviderLabel(metadata: Record<string, unknown>): string {
  const contextUsed = metadata.context_used && typeof metadata.context_used === 'object'
    ? metadata.context_used as Record<string, unknown>
    : null;
  const billingSource = String(metadata.billing_source ?? contextUsed?.billing_source ?? '').trim();
  const aiLabel = String(metadata.ai_label ?? contextUsed?.ai_label ?? '').trim();
  if (billingSource === 'empyralis_credits' && aiLabel) {
    return `${aiLabel} · Workspace AI`;
  }
  const provider = String(
    metadata.effective_provider
      ?? metadata.provider
      ?? contextUsed?.effective_provider
      ?? '',
  ).trim();
  const model = String(
    metadata.effective_model
      ?? metadata.model
      ?? contextUsed?.effective_model
      ?? '',
  ).trim();
  const parts: string[] = [];
  if (provider) {
    parts.push(humanizeToken(provider));
  }
  if (model) {
    parts.push(model);
  }
  return parts.join(' · ');
}

function stepIcon(kind: string) {
  switch (kind) {
    case 'thinking':
      return Brain;
    case 'file':
      return FileText;
    case 'search':
      return Search;
    default:
      return Wrench;
  }
}

const SYNTHETIC_THINKING_TEXT = new Set([
  'planning the response',
  'planning the next step',
  'prepared the next action',
  'answer ready',
]);

const ASSISTANT_PSEUDO_TOOL_LINE_PATTERN = /^\s*(?:run[_\s-]?command|shell[_\s-]?command|tool\s*:\s*computer|tool\s*:\s*hardware)\s*:?\s*.+$/gim;
const SYNTHETIC_ASSISTANT_GATE_PATTERN = /\b(?:i do not have a verified agent computer result|i cannot confirm that action completed because no tool result was returned|connect or approve the required system|hardware actions need the computer to be connected|computer is already connected)\b/i;
const SYNTHETIC_ASSISTANT_GATE_PREFIX_PATTERN = /\b(?:i do not have a verified agent computer|i cannot confirm that action|connect or approve the required|hardware actions need the computer|computer is already connected)\b/i;

function stripAssistantPseudoToolText(value: string): string {
  const hadPseudoToolLine = ASSISTANT_PSEUDO_TOOL_LINE_PATTERN.test(value);
  ASSISTANT_PSEUDO_TOOL_LINE_PATTERN.lastIndex = 0;
  const cleaned = value
    .replace(ASSISTANT_PSEUDO_TOOL_LINE_PATTERN, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (SYNTHETIC_ASSISTANT_GATE_PATTERN.test(cleaned) || SYNTHETIC_ASSISTANT_GATE_PREFIX_PATTERN.test(cleaned)) {
    return '';
  }
  if ((hadPseudoToolLine || value !== cleaned) && looksLikeAssistantActionPlanPreamble(cleaned)) {
    return '';
  }
  if (looksLikeAssistantActionPlanPreamble(cleaned)) {
    return '';
  }
  return cleaned;
}

function looksLikeAssistantActionPlanPreamble(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ');
  if (!normalized) {
    return true;
  }
  if (normalized.length > 320) {
    return false;
  }
  const planMarkers = [
    "i'll check",
    'i will check',
    "i'll run",
    'i will run',
    "i'll retrieve",
    'i will retrieve',
    'running a command',
    'running a command now',
    'running the command',
    'run a command',
    'retrieve the details',
    'retrieve details',
    'hardware information',
    'checking your system',
    'checking the system',
    'need to run',
    'approve?',
  ];
  const resultMarkers = [
    'the result is',
    'here is',
    'here are',
    'i found',
    'completed',
    'captured',
    'output',
  ];
  return planMarkers.some((marker) => normalized.includes(marker))
    && !resultMarkers.some((marker) => normalized.includes(marker));
}

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

function thinkingSyntheticKey(value: string): string {
  return value.toLowerCase().replace(/[.!]+$/g, '').trim();
}

function visibleThinkingContent(rawText: string): string {
  const text = normalizedThinkingContent(rawText);
  if (!text) {
    return '';
  }
  return text
    .split('\n')
    .filter((line) => !SYNTHETIC_THINKING_TEXT.has(thinkingSyntheticKey(line)))
    .join('\n')
    .trim();
}

const ThinkingRow = memo(({
  message,
}: {
  message: WorkstationChatMessageRecord;
}) => {
  const [expanded, setExpanded] = useState(false);
  const text = visibleThinkingContent(String(message.metadata.thinking_text ?? message.content ?? ''));
  const isStreaming = message.metadata.step_streaming === true;
  const isDimmed = message.metadata.step_dimmed === true;

  if (!text) {
    return null;
  }

  return (
    <article className={`app-chat-thinking-row${isStreaming ? ' app-chat-thinking-row--streaming' : ''}${isDimmed ? ' app-chat-thinking-row--dimmed' : ''}`}>
      <button
        type="button"
        className="app-chat-thinking-row__toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <ChevronRight
          size={12}
          strokeWidth={2}
          className={`app-chat-thinking-row__chevron${expanded ? ' app-chat-thinking-row__chevron--expanded' : ''}`}
          aria-hidden="true"
        />
        <span className="app-chat-thinking-row__label">{isStreaming ? 'Thinking' : 'Thought process'}</span>
      </button>
      {expanded ? (
        <div className="app-chat-thinking-row__detail">
          <pre className="app-chat-thinking-row__detail-text">{text}</pre>
        </div>
      ) : null}
    </article>
  );
});

const SystemInlineRow = memo(({
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
}) => {
  return (
    <article className={`app-chat-system-row app-chat-system-row--${state}${dimmed ? ' app-chat-system-row--dimmed' : ''}`}>
      <span className="app-chat-system-row__icon" aria-hidden="true">{icon}</span>
      <span className="app-chat-system-row__primary">{primary}</span>
      <span className="app-chat-system-row__secondary">{secondary}</span>
    </article>
  );
});

export const ChatMessage = memo(({
  message,
}: {
  message: WorkstationChatMessageRecord;
  resolvingApprovalId?: string | null;
  onResolveApproval?: (approvalId: string, resolution: 'approved' | 'rejected') => void;
}) => {
  const isUser = message.role === 'user';
  const text = isUser ? message.content.trim() : stripAssistantPseudoToolText(message.content);
  const timestamp = formatTimestamp(message.createdAt);
  const displayKind = typeof message.metadata.display_kind === 'string' ? message.metadata.display_kind : '';
  const actionHref = typeof message.metadata.action_href === 'string' ? message.metadata.action_href : '';
  const actionLabel = typeof message.metadata.action_label === 'string' ? message.metadata.action_label : '';
  const providerLabel = effectiveProviderLabel(message.metadata);
  const isIncomplete = message.metadata.incomplete === true || message.status === 'incomplete';

  if (displayKind === 'thinking_row') {
    return <ThinkingRow message={message} />;
  }

  if (displayKind === 'tool_row') {
    const stepStatus = typeof message.metadata.step_status === 'string' ? message.metadata.step_status : 'running';
    const dimmed = message.metadata.step_dimmed === true;
    return (
      <SystemInlineRow
        icon={stepStatus === 'done'
          ? <Check size={14} strokeWidth={2} />
          : stepStatus === 'error'
            ? <CircleAlert size={14} strokeWidth={2} />
            : <Wrench size={14} strokeWidth={1.9} />}
        primary={stepStatus === 'done'
          ? `Used ${String(message.metadata.tool_name ?? message.content ?? 'tool')}`
          : String(message.metadata.tool_name ?? message.content ?? 'Tool')}
        secondary={stepStatus === 'done' ? 'Done' : stepStatus === 'error' ? 'Failed' : 'Running'}
        state={stepStatus === 'done' ? 'done' : stepStatus === 'error' ? 'error' : 'running'}
        dimmed={dimmed}
      />
    );
  }

  if (displayKind === 'file_row') {
    return (
      <SystemInlineRow
        icon={<FileText size={14} strokeWidth={1.9} />}
        primary="Read file"
        secondary={String(message.metadata.file_action ?? 'Read')}
        state="done"
        dimmed={message.metadata.step_dimmed === true}
      />
    );
  }

  if (displayKind === 'search_row') {
    const stepStatus = typeof message.metadata.step_status === 'string' ? message.metadata.step_status : 'running';
    return (
      <SystemInlineRow
        icon={<Search size={14} strokeWidth={1.9} />}
        primary={stepStatus === 'done' ? 'Searched web' : 'Searching web'}
        secondary={stepStatus === 'done' ? 'Done' : 'Searching'}
        state={stepStatus === 'done' ? 'done' : 'running'}
        dimmed={message.metadata.step_dimmed === true}
      />
    );
  }

  if (displayKind === 'activity_step') {
    const stepKind = typeof message.metadata.step_kind === 'string' ? message.metadata.step_kind : 'tool';
    const stepStatus = typeof message.metadata.step_status === 'string' ? message.metadata.step_status : 'active';
    const Icon = stepIcon(stepKind);
    return (
      <article
        data-chat-role="assistant"
        className={`app-chat-activity-row app-chat-activity-row--${stepStatus}`}
      >
        <span className="app-chat-activity-row__icon" aria-hidden="true">
          <Icon size={14} strokeWidth={1.9} />
        </span>
        <span className="app-chat-activity-row__label">{stripAssistantPseudoToolText(message.content) || (stepStatus === 'done' ? 'Completed' : stepStatus === 'error' ? 'Failed' : 'Working')}</span>
      </article>
    );
  }

  if (displayKind === 'provider_error') {
    const lowerText = text.toLowerCase();
    const providerNoticeText = lowerText.includes('ollama')
      || lowerText.includes('selected provider')
      || lowerText.includes('selected for chat')
      || lowerText.includes('local-only')
      ? 'Choose Workspace AI, add an AI model key, or connect a computer.'
      : text;
    return (
      <article
        data-chat-role="system"
        className="app-chat-transcript-error"
      >
        <span className="app-chat-transcript-error__icon" aria-hidden="true">
          <CircleAlert size={14} strokeWidth={1.9} />
        </span>
        <div className="app-chat-transcript-error__copy">
          <strong>AI model attention needed</strong>
          <span>{providerNoticeText}</span>
        </div>
        {actionHref && actionLabel ? (
          <Link href={actionHref} className="app-chat-transcript-error__link">
            {actionLabel}
          </Link>
        ) : null}
      </article>
    );
  }

  if (!isUser && !text) {
    return null;
  }

  return (
    <article
      data-chat-role={isUser ? 'user' : 'assistant'}
      className="app-chat-message"
    >
      <div className="app-chat-message__content">
        {text}
      </div>
      {(timestamp || providerLabel || isIncomplete) ? (
        <div className={`app-chat-message__meta${providerLabel || isIncomplete ? ' app-chat-message__meta--visible' : ''}`}>
          {providerLabel ? (
            <span className="app-chat-message__provider">
              {providerLabel}
            </span>
          ) : null}
          {isIncomplete ? (
            <span className="app-chat-message__status">
              Incomplete
            </span>
          ) : null}
          <time className="app-chat-message__timestamp" dateTime={message.createdAt ?? undefined}>
            {timestamp}
          </time>
        </div>
      ) : null}
    </article>
  );
});
