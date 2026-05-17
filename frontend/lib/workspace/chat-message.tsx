'use client';

import Link from 'next/link';
import { type ReactNode, memo, useMemo, useState } from 'react';
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

const ThinkingRow = memo(({
  message,
}: {
  message: WorkstationChatMessageRecord;
}) => {
  const [expanded, setExpanded] = useState(false);
  const text = String(message.metadata.thinking_text ?? message.content ?? '').trim();
  const activityLine = useMemo(
    () => compactActivityPreview(text),
    [text],
  );
  const disclosure = useMemo(
    () => parseThinkingDisclosure(text),
    [text],
  );
  const isStreaming = message.metadata.step_streaming === true;
  const isDimmed = message.metadata.step_dimmed === true;

  if (activityLine) {
    return (
      <article className={`app-chat-thinking-row${isStreaming ? ' app-chat-thinking-row--streaming' : ''}${isDimmed ? ' app-chat-thinking-row--dimmed' : ''}`}>
        <div className="app-chat-thinking-row__header">
          <span className="app-chat-thinking-row__pulse" aria-hidden="true" />
          <span className="app-chat-thinking-row__label">Thinking</span>
        </div>
        <div className="app-chat-thinking-row__activity">{activityLine}</div>
      </article>
    );
  }

  return (
    <article className={`app-chat-thinking-row${isStreaming ? ' app-chat-thinking-row--streaming' : ''}${isDimmed ? ' app-chat-thinking-row--dimmed' : ''}`}>
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
  const text = message.content.trim();
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
        primary={String(message.metadata.tool_name ?? message.content ?? 'Tool')}
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
        primary={String(message.metadata.filename ?? message.content ?? 'File')}
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
        primary={String(message.metadata.query ?? message.content ?? 'Search')}
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
        <span className="app-chat-activity-row__label">{message.content.trim()}</span>
      </article>
    );
  }

  if (displayKind === 'provider_error') {
    const lowerText = text.toLowerCase();
    const providerNoticeText = lowerText.includes('ollama')
      || lowerText.includes('selected provider')
      || lowerText.includes('selected for chat')
      || lowerText.includes('local-only')
      ? 'Choose Empyralis credits, add an AI model key, or connect a computer.'
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
