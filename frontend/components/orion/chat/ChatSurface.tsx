'use client';

import { Fragment, createElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, ChevronDown, Plus, SlidersHorizontal, X } from 'lucide-react';
import { fmtTime } from '@/app/page.catalog';
import { RUN_COMPLETED_STATUS_COPY } from '@/lib/runStartCopy';
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

type ChatPermissionPrompt = {
  title: string;
  prompt: string;
  labels: string[];
  capabilities: string[];
  busyKey: string | null;
  onAllowOnce: () => void;
  onAllowWorkflow?: (() => void) | undefined;
  onAllowAgent?: (() => void) | undefined;
  onDeny: () => void;
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
  emptyAction?: {
    label: string;
    href: string;
  } | null;
  permissionPrompt?: ChatPermissionPrompt | null;
  targetLabel: string;
  targetHref?: string;
  modelLabel: string;
  selectedModel: string;
  modelOptions: string[];
  modelsLoading?: boolean;
  onSelectModel: (value: string) => void;
  trustLabel: string;
  identityDrawerOpen: boolean;
  onToggleIdentityDrawer: () => void;
  onCloseIdentityDrawer: () => void;
  identitySections: ChatIdentitySection[];
  identityActions: ChatIdentityAction[];
};

type AssistantLifecycleTone = 'thinking' | 'working' | 'approval' | 'failed' | 'done';

function renderInlineMarkdown(text: string, keyPrefix: string) {
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

function renderParagraphWithBreaks(text: string, keyPrefix: string) {
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

function renderMarkdownBlocks(segment: string, keyPrefix: string) {
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
    .filter(Boolean);
}

function renderChatMarkdown(content: string, keyPrefix: string) {
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
      parts.push(...(renderMarkdownBlocks(before, `${keyPrefix}:segment:${segmentIndex}`) as ReactNode[]));
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
    parts.push(...(renderMarkdownBlocks(trailing, `${keyPrefix}:segment:${segmentIndex}`) as ReactNode[]));
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
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    return `${RUN_COMPLETED_STATUS_COPY} Open Runs for structured details.`;
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

    if (/^validation:?/i.test(trimmed) || /^sources?:/i.test(trimmed) || /^source refs?:/i.test(trimmed)) {
      skippingTechnicalTail = true;
      continue;
    }

    if (skippingTechnicalTail) {
      if (/^[-*]\s*`/.test(trimmed) || /^`/.test(trimmed) || /^[-*]\s*[A-Za-z0-9_./-]+:\d+/.test(trimmed) || /^\.\//.test(trimmed)) {
        continue;
      }
      skippingTechnicalTail = false;
    }

    if (/^next move/i.test(trimmed) || /^next step/i.test(trimmed)) continue;
    if (/^open (control center|admin|runs) for details\.?$/i.test(trimmed)) continue;

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
  return null;
}

function shouldSuppressAssistantBody(content: string, status: ChatMessageRecord['status']): boolean {
  const normalized = content.trim().toLowerCase();
  if (!normalized) return true;
  return (status === 'sending' || status === 'running') && (normalized === 'working on it...' || normalized === 'working on it…');
}

export function ChatSurface({
  goal,
  setGoal,
  primaryGoalRef,
  onSend,
  chatBusy,
  messages,
  inlineStatus,
  inlineAction = null,
  emptyAction = null,
  permissionPrompt = null,
  targetLabel,
  targetHref = '/agents',
  modelLabel,
  selectedModel,
  modelOptions,
  modelsLoading = false,
  onSelectModel,
  trustLabel,
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
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [controlsMenuOpen, setControlsMenuOpen] = useState(false);
  const renderedMessages = useMemo(
    () => messages.filter((message) => !(message.status === 'error' && isSuppressedTechnicalMessage(message.content))),
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
    const minHeight = 28;
    const maxHeight = 160;
    element.style.height = '0px';
    const nextHeight = Math.max(minHeight, Math.min(element.scrollHeight, maxHeight));
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [goal, primaryGoalRef]);

  useEffect(() => {
    if (!hasMessages) return;
    anchorRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [hasMessages, renderedMessages.length]);

  useEffect(() => {
    if (!attachMenuOpen && !modelMenuOpen && !controlsMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest('[data-chat-menu-root]')) return;
      setAttachMenuOpen(false);
      setModelMenuOpen(false);
      setControlsMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setAttachMenuOpen(false);
      setModelMenuOpen(false);
      setControlsMenuOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [attachMenuOpen, controlsMenuOpen, modelMenuOpen]);

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
        <div className="orion-chat-v2-topline">
          <button type="button" className="orion-chat-v2-target-chip" onClick={() => router.push(targetHref)}>
            {targetLabel}
          </button>
          {hasMessages ? (
            <button type="button" className="orion-chat-v2-topline-link" onClick={() => router.push('/workspace')}>
              Open workbench
            </button>
          ) : null}
        </div>

        {!hasMessages ? (
          <section className="orion-chat-v2-compact-empty" aria-label="Empty chat">
            <h1 className="orion-chat-v2-compact-title">What should this do?</h1>
            <p className="orion-chat-v2-compact-copy">Describe one task in plain language.</p>
            {emptyAction ? (
              <button type="button" className="orion-chat-v2-empty-action" onClick={() => router.push(emptyAction.href)}>
                {emptyAction.label}
              </button>
            ) : null}
          </section>
        ) : null}

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
                          {(lifecycle.tone === 'thinking' || lifecycle.tone === 'working') ? (
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
          <div className="orion-chat-v2-control-strip">
            <span className="orion-chat-v2-control-chip is-target">{targetLabel}</span>
            <span className="orion-chat-v2-control-chip is-trust">{trustLabel}</span>
          </div>

          {permissionPrompt ? (
            <div className="orion-chat-v2-permission-card" role="status" aria-live="polite">
              <div className="orion-chat-v2-permission-header">
                <div className="orion-chat-v2-permission-title">Approval needed</div>
                <div className="orion-chat-v2-permission-copy">{permissionPrompt.prompt}</div>
              </div>
              {permissionPrompt.labels.length > 0 ? (
                <div className="orion-chat-v2-permission-chips">
                  {permissionPrompt.labels.map((label) => (
                    <span key={`label:${label}`} className="orion-chat-v2-permission-chip">{label}</span>
                  ))}
                </div>
              ) : null}
              {permissionPrompt.capabilities.length > 0 ? (
                <div className="orion-chat-v2-permission-detail">Requested: {permissionPrompt.capabilities.join(', ')}</div>
              ) : null}
              <div className="orion-chat-v2-permission-actions">
                <button
                  type="button"
                  className="orion-chat-v2-permission-action is-primary"
                  onClick={permissionPrompt.onAllowOnce}
                  disabled={Boolean(permissionPrompt.busyKey)}
                >
                  {permissionPrompt.busyKey === 'Proceed:once' ? 'Allowing…' : 'Allow once'}
                </button>
                {permissionPrompt.onAllowWorkflow ? (
                  <button
                    type="button"
                    className="orion-chat-v2-permission-action"
                    onClick={permissionPrompt.onAllowWorkflow}
                    disabled={Boolean(permissionPrompt.busyKey)}
                  >
                    {permissionPrompt.busyKey === 'Proceed:workflow' ? 'Saving…' : 'Always for this task'}
                  </button>
                ) : null}
                {permissionPrompt.onAllowAgent ? (
                  <button
                    type="button"
                    className="orion-chat-v2-permission-action"
                    onClick={permissionPrompt.onAllowAgent}
                    disabled={Boolean(permissionPrompt.busyKey)}
                  >
                    {permissionPrompt.busyKey === 'Proceed:agent' ? 'Saving…' : 'Always for this agent'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="orion-chat-v2-permission-action is-danger"
                  onClick={permissionPrompt.onDeny}
                  disabled={Boolean(permissionPrompt.busyKey)}
                >
                  {permissionPrompt.busyKey === 'Hold:once' ? 'Blocking…' : 'Deny'}
                </button>
              </div>
            </div>
          ) : null}

          <div className="orion-chat-v2-composer">
            <div className="orion-chat-v2-composer-leading" data-chat-menu-root>
              <button
                type="button"
                className="orion-chat-v2-icon-btn"
                aria-label="Add context"
                aria-haspopup="menu"
                aria-expanded={attachMenuOpen}
                onClick={() => {
                  setAttachMenuOpen((current) => !current);
                  setModelMenuOpen(false);
                  setControlsMenuOpen(false);
                }}
              >
                <Plus size={16} />
              </button>
              {attachMenuOpen ? (
                <div className="orion-chat-v2-menu" role="menu">
                  <button type="button" className="orion-chat-v2-menu-item" onClick={() => { setAttachMenuOpen(false); router.push('/artifacts'); }}>
                    Open artifacts
                  </button>
                  <button type="button" className="orion-chat-v2-menu-item" onClick={() => { setAttachMenuOpen(false); router.push('/executions'); }}>
                    Open runs
                  </button>
                  <button type="button" className="orion-chat-v2-menu-item" onClick={() => { setAttachMenuOpen(false); onToggleIdentityDrawer(); }}>
                    Review setup
                  </button>
                </div>
              ) : null}
            </div>

            <textarea
              ref={primaryGoalRef}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="Ask anything or tell it what to do"
              rows={1}
              className="orion-chat-v2-input"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  invokeSend();
                }
              }}
            />

            <div className="orion-chat-v2-composer-actions">
              <div className="orion-chat-v2-composer-menu" data-chat-menu-root>
                <button
                  type="button"
                  className="orion-chat-v2-model-pill"
                  aria-label="Choose model"
                  aria-haspopup="menu"
                  aria-expanded={modelMenuOpen}
                  onClick={() => {
                    setModelMenuOpen((current) => !current);
                    setAttachMenuOpen(false);
                    setControlsMenuOpen(false);
                  }}
                >
                  <span>{modelsLoading ? 'Loading models…' : modelLabel}</span>
                  <ChevronDown size={14} />
                </button>
                {modelMenuOpen ? (
                  <div className="orion-chat-v2-menu is-model" role="menu">
                    {modelOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`orion-chat-v2-menu-item${option === selectedModel ? ' is-selected' : ''}`}
                        onClick={() => {
                          onSelectModel(option);
                          setModelMenuOpen(false);
                        }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="orion-chat-v2-composer-menu" data-chat-menu-root>
                <button
                  type="button"
                  className="orion-chat-v2-icon-btn"
                  aria-label="More controls"
                  aria-haspopup="menu"
                  aria-expanded={controlsMenuOpen}
                  onClick={() => {
                    setControlsMenuOpen((current) => !current);
                    setAttachMenuOpen(false);
                    setModelMenuOpen(false);
                  }}
                >
                  <SlidersHorizontal size={16} />
                </button>
                {controlsMenuOpen ? (
                  <div className="orion-chat-v2-menu is-controls" role="menu">
                    <div className="orion-chat-v2-menu-section-label">Current access</div>
                    <div className="orion-chat-v2-menu-meta">{trustLabel}</div>
                    <button type="button" className="orion-chat-v2-menu-item" onClick={() => { setControlsMenuOpen(false); onToggleIdentityDrawer(); }}>
                      Review setup
                    </button>
                    <button type="button" className="orion-chat-v2-menu-item" onClick={() => { setControlsMenuOpen(false); router.push('/workspace'); }}>
                      Open workbench
                    </button>
                    <button type="button" className="orion-chat-v2-menu-item" onClick={() => { setControlsMenuOpen(false); router.push('/agents'); }}>
                      Open agents
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={invokeSend}
                disabled={sendDisabled}
                className="orion-chat-v2-send"
                aria-label="Send"
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </div>

          {inlineStatus ? (
            <div className="orion-chat-v2-status-line">
              <span>⚠ {inlineStatus}</span>
              {inlineAction ? (
                <button type="button" className="orion-chat-v2-status-action" onClick={() => router.push(inlineAction.href)}>
                  {inlineAction.label}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="orion-chat-v2-footer">Enter to send • Shift+Enter for a new line</div>
        </div>
      </div>

      {identityDrawerOpen ? (
        <>
          <button type="button" className="orion-chat-v2-drawer-backdrop" aria-label="Close setup details" onClick={onCloseIdentityDrawer} />
          <aside className="orion-chat-v2-drawer" aria-label="Task setup">
            <div className="orion-chat-v2-drawer-header">
              <div>
                <div className="orion-chat-v2-drawer-eyebrow">Setup</div>
                <h2 className="orion-chat-v2-drawer-title">Review before running</h2>
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
