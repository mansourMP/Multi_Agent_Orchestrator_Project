'use client';

import { Fragment, createElement, useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { fmtTime } from '@/app/page.catalog';
import type { ChatMessageRecord } from './chatSchema';

export type ChatIdentityItem = {
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'warning';
  priority?: 'high';
};

export type ChatIdentitySection = {
  title: string;
  note?: string;
  items: ChatIdentityItem[];
};

export type ChatIdentityAction = {
  label: string;
  onClick: () => void;
  priority?: 'primary' | 'default';
};

export type ChatOnboardingPrompt = {
  toolLabel: string;
  welcome: string;
  tasks: string[];
};

type ChatSurfaceProps = {
  isMobile: boolean;
  goal: string;
  setGoal: (value: string) => void;
  primaryGoalRef: RefObject<HTMLTextAreaElement | null>;
  onSend: () => void;
  chatBusy: boolean;
  messages: ChatMessageRecord[];
  inlineStatus: string | null;
  inlineAction?: {
    label: string;
    href: string;
  } | null;
  heroTitle?: string;
  heroNote?: string | null;
  onboardingPrompt?: ChatOnboardingPrompt | null;
  onSelectOnboardingTask?: (task: string) => void;
  identityItems: ChatIdentityItem[];
  identityDrawerOpen: boolean;
  onToggleIdentityDrawer: () => void;
  onCloseIdentityDrawer: () => void;
  identitySections: ChatIdentitySection[];
  identityActions: ChatIdentityAction[];
};

type AssistantLifecycleTone = 'thinking' | 'working' | 'approval' | 'failed' | 'done';

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

function isSuppressedTechnicalMessage(content: string): boolean {
  return content.trim().toLowerCase().includes('provider profiles path is not writable');
}

function sanitizeAssistantDisplayText(content: string): string {
  let text = content.replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  if (
    (text.startsWith('{') && text.endsWith('}')) ||
    (text.startsWith('[') && text.endsWith(']'))
  ) {
    return 'Done. Open Control Center for structured details.';
  }

  const filtered: string[] = [];
  let skippingTechnicalTail = false;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (!skippingTechnicalTail && filtered[filtered.length - 1] !== '') filtered.push('');
      continue;
    }

    if (hasAbsolutePath(trimmed)) continue;

    if (
      /^validation:?/i.test(trimmed) ||
      /^sources?:/i.test(trimmed) ||
      /^source refs?:/i.test(trimmed)
    ) {
      skippingTechnicalTail = true;
      continue;
    }

    if (skippingTechnicalTail) {
      if (
        /^[-*]\s*`/.test(trimmed) ||
        /^`/.test(trimmed) ||
        /^[-*]\s*[A-Za-z0-9_./-]+:\d+/.test(trimmed) ||
        /^\.\//.test(trimmed)
      ) {
        continue;
      }
      skippingTechnicalTail = false;
    }

    if (/^next move/i.test(trimmed) || /^next step/i.test(trimmed)) continue;
    if (/^open control center for details\.?$/i.test(trimmed)) continue;

    filtered.push(line);
  }

  text = filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return text || 'Done.';
}

function resolveAssistantLifecycle(status: ChatMessageRecord['status']): { label: string; tone: AssistantLifecycleTone } | null {
  if (status === 'sending') return { label: 'Thinking', tone: 'thinking' };
  if (status === 'running') return { label: 'Working', tone: 'working' };
  if (status === 'waiting') return { label: 'Needs approval', tone: 'approval' };
  if (status === 'error') return { label: 'Failed', tone: 'failed' };
  if (status === 'completed') return { label: 'Done', tone: 'done' };
  return null;
}

function shouldSuppressAssistantBody(content: string, status: ChatMessageRecord['status']): boolean {
  const normalized = content.trim().toLowerCase();
  if (!normalized) return true;
  if ((status === 'sending' || status === 'running') && (normalized === 'working on it...' || normalized === 'working on it…')) {
    return true;
  }
  return false;
}

export function ChatSurface({
  isMobile,
  goal,
  setGoal,
  primaryGoalRef,
  onSend,
  chatBusy,
  messages,
  inlineStatus,
  inlineAction = null,
  heroTitle = 'What should we work on next?',
  heroNote = null,
  onboardingPrompt = null,
  onSelectOnboardingTask,
  identityItems,
  identityDrawerOpen,
  onToggleIdentityDrawer,
  onCloseIdentityDrawer,
  identitySections,
  identityActions,
}: ChatSurfaceProps) {
  const router = useRouter();
  const hasMessages = messages.length > 0;
  const sendDisabled = chatBusy || goal.trim().length === 0;
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const renderedMessages = useMemo(
    () =>
      messages.filter(
        (message) => !(message.status === 'error' && isSuppressedTechnicalMessage(message.content)),
      ),
    [messages],
  );
  const isFirstThread = renderedMessages.length > 0 && renderedMessages.length <= 2;

  const invokeSend = useCallback(() => {
    if (sendDisabled) return;
    onSend();
  }, [onSend, sendDisabled]);

  useEffect(() => {
    const element = primaryGoalRef.current;
    if (!element) return;
    const minHeight = hasMessages ? 28 : 36;
    const maxHeight = hasMessages ? 200 : 160;
    element.style.height = '0px';
    const nextHeight = Math.max(minHeight, Math.min(element.scrollHeight, maxHeight));
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [goal, hasMessages, primaryGoalRef]);

  useEffect(() => {
    if (!hasMessages) return;
    anchorRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [hasMessages, renderedMessages.length]);

  useEffect(() => {
    if (!identityDrawerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseIdentityDrawer();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [identityDrawerOpen, onCloseIdentityDrawer]);

  return (
    <section className={`orion-chat-v2${hasMessages ? ' has-history' : ' is-empty'}${isFirstThread ? ' is-first-thread' : ''}`}>
      <div className="orion-chat-v2-thread-shell">
        {identityItems.length > 0 ? (
          <button
            type="button"
            className="orion-chat-v2-identity-bar"
            aria-label="Open current assistant session details"
            aria-expanded={identityDrawerOpen}
            onClick={onToggleIdentityDrawer}
          >
            {identityItems.map((item) => (
              <div
                key={`${item.label}:${item.value}`}
                className={`orion-chat-v2-identity-chip${item.tone ? ` is-${item.tone}` : ''}${item.priority === 'high' ? ' is-priority' : ''}`}
              >
                <span className="orion-chat-v2-identity-label">{item.label}</span>
                <span className="orion-chat-v2-identity-value">{item.value}</span>
              </div>
            ))}
            <span className="orion-chat-v2-identity-cta">{identityDrawerOpen ? 'Hide details' : 'Open details'}</span>
          </button>
        ) : null}
        {!hasMessages ? <h1 className="orion-chat-v2-hero">{heroTitle}</h1> : null}
        {!hasMessages && heroNote ? <p className="orion-chat-v2-hero-note">{heroNote}</p> : null}
        {!hasMessages && onboardingPrompt ? (
          <section className="orion-chat-v2-onboarding" aria-label={`${onboardingPrompt.toolLabel} starter tasks`}>
            <div className="orion-chat-v2-onboarding-eyebrow">Connected tool</div>
            <div className="orion-chat-v2-onboarding-title">{onboardingPrompt.toolLabel} is ready</div>
            <p className="orion-chat-v2-onboarding-copy">{onboardingPrompt.welcome}</p>
            <div className="orion-chat-v2-onboarding-actions">
              {onboardingPrompt.tasks.map((task) => (
                <button
                  key={task}
                  type="button"
                  className="orion-chat-v2-onboarding-task"
                  onClick={() => onSelectOnboardingTask?.(task)}
                >
                  {task}
                </button>
              ))}
            </div>
          </section>
        ) : null}
        {isFirstThread ? <div className="orion-chat-v2-hero-ghost" aria-hidden>{heroTitle}</div> : null}

        {renderedMessages.length > 0 ? (
          <div className="orion-chat-v2-thread" aria-live="polite">
            {renderedMessages.map((message, index) => {
              const isUser = message.role === 'user';
              const isError = message.status === 'error';
              const lifecycle = !isUser ? resolveAssistantLifecycle(message.status) : null;
              const displayContent = isUser ? message.content : sanitizeAssistantDisplayText(message.content);
              const suppressBody = !isUser && shouldSuppressAssistantBody(displayContent, message.status);
              const inlineError = isError ? normalizeInlineErrorMessage(displayContent) : '';
              const isFirstAssistantEntry = !isUser && isFirstThread && index <= 1;
              return (
                <article
                  key={message.id}
                  className={`orion-chat-v2-turn${isUser ? ' is-user' : ' is-assistant'}${isError ? ' is-error' : ''}${isFirstAssistantEntry ? ' is-first-assistant-entry' : ''}`}
                >
                  {isUser ? (
                    <div className="orion-chat-v2-user-bubble">
                      <div className="orion-chat-v2-user-text">{displayContent}</div>
                      <div className="orion-chat-v2-meta">{fmtTime(message.ts)}</div>
                    </div>
                  ) : (
                    <div className="orion-chat-v2-assistant">
                      {lifecycle ? (
                        <div className={`orion-chat-v2-state is-${lifecycle.tone}`}>
                          <span className="orion-chat-v2-state-label">{lifecycle.label}</span>
                          {lifecycle.tone === 'thinking' || lifecycle.tone === 'working' ? (
                            <span className="orion-chat-v2-state-dots" aria-hidden>
                              <span />
                              <span />
                              <span />
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {isError && inlineError ? (
                        <div className="orion-chat-v2-inline-error">⚠ {inlineError}</div>
                      ) : !suppressBody ? (
                        <div className="orion-chat-v2-markdown">{renderChatMarkdown(displayContent, message.id)}</div>
                      ) : null}
                      <div className="orion-chat-v2-meta">{fmtTime(message.ts)}</div>
                    </div>
                  )}
                </article>
              );
            })}
            <div ref={anchorRef} />
          </div>
        ) : null}
      </div>

      <div className={`orion-chat-v2-composer-shell${hasMessages ? ' is-docked' : ' is-empty'}`}>
        <div className="orion-chat-v2-composer-frame">
          {inlineStatus ? (
            <div className="orion-chat-v2-status-line">
              <span>⚠ {inlineStatus}</span>
              {inlineAction ? (
                <button
                  type="button"
                  className="orion-chat-v2-status-action"
                  onClick={() => router.push(inlineAction.href)}
                >
                  {inlineAction.label}
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="orion-chat-v2-composer">
            <button type="button" className="orion-chat-v2-plus" aria-label="Add context">
              +
            </button>
            <textarea
              ref={primaryGoalRef}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder={hasMessages ? 'Reply to your assistant' : 'Message your assistant'}
              rows={1}
              className="orion-chat-v2-input"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  invokeSend();
                }
              }}
            />
            <button
              type="button"
              onClick={invokeSend}
              disabled={sendDisabled}
              className="orion-chat-v2-send"
              aria-label="Send"
            >
              →
            </button>
          </div>
          <div className="orion-chat-v2-footer">
            {hasMessages ? 'Enter to send • Shift+Enter for a new line' : isMobile ? 'Start with one concrete task' : 'Start with one concrete task or next step'}
          </div>
        </div>
      </div>

      {identityDrawerOpen ? (
        <>
          <button
            type="button"
            className="orion-chat-v2-drawer-backdrop"
            aria-label="Close assistant session details"
            onClick={onCloseIdentityDrawer}
          />
          <aside className="orion-chat-v2-drawer" aria-label="Assistant session details">
            <div className="orion-chat-v2-drawer-header">
              <div>
                <div className="orion-chat-v2-drawer-eyebrow">Session details</div>
                <h2 className="orion-chat-v2-drawer-title">Current assistant state</h2>
              </div>
              <button type="button" className="orion-chat-v2-drawer-close" onClick={onCloseIdentityDrawer} aria-label="Close details">
                <X size={16} />
              </button>
            </div>
            <div className="orion-chat-v2-drawer-body">
              {identityActions.length > 0 ? (
                <div className="orion-chat-v2-drawer-actions">
                  {identityActions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      className={`orion-chat-v2-drawer-action${action.priority === 'primary' ? ' is-primary' : ''}`}
                      onClick={action.onClick}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {identitySections.map((section) => (
                <section key={section.title} className="orion-chat-v2-drawer-section">
                  <div className="orion-chat-v2-drawer-section-title">{section.title}</div>
                  {section.note ? <p className="orion-chat-v2-drawer-note">{section.note}</p> : null}
                  <div className="orion-chat-v2-drawer-grid">
                    {section.items.map((item) => (
                      <div key={`${section.title}:${item.label}:${item.value}`} className="orion-chat-v2-drawer-item">
                        <div className="orion-chat-v2-drawer-item-label">{item.label}</div>
                        <div className={`orion-chat-v2-drawer-item-value${item.tone ? ` is-${item.tone}` : ''}`}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </aside>
        </>
      ) : null}
    </section>
  );
}
