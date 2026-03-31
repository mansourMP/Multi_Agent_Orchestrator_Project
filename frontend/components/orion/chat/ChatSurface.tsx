'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUp,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  LoaderCircle,
  Plus,
  PlugZap,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { fmtTime } from '@/app/page.catalog';
import type { ChatMessageActionRecord, ChatMessageRecord, ChatRunCardStatus, ChatStepRecord } from './chatSchema';
import { normalizeAssistantDisplayText, normalizeInlineErrorMessage } from './displayText';

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

export type ChatDepthOption = {
  value: string;
  label: string;
  description?: string;
};

type ChatEmptyState = {
  title: string;
  suggestions: string[];
  onSelectSuggestion: (value: string) => void;
};

type ChatPermissionPrompt = {
  title: string;
  prompt: string;
  labels: string[];
  capabilities: string[];
  actions: string[];
  target?: string | null;
  scope: 'once';
  reusable: boolean;
  consequence?: string | null;
  busyKey: string | null;
  onAllowOnce: () => void;
  onDeny: () => void;
};

type ChatSurfaceProps = {
  isMobile: boolean;
  goal: string;
  setGoal: (value: string) => void;
  primaryGoalRef: RefObject<HTMLTextAreaElement | null>;
  onSend: () => void;
  onMessageAction?: (messageId: string, action: ChatMessageActionRecord) => void;
  onRunApprovalDecision?: (scope: 'once' | 'deny') => void;
  chatBusy: boolean;
  messages: ChatMessageRecord[];
  emptyState?: ChatEmptyState | null;
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
  selectedModel: string;
  modelOptions: string[];
  modelsLoading?: boolean;
  onSelectModel: (value: string) => void;
  trustLabel: string;
  selectedDepth: string;
  depthLabel: string;
  depthOptions: ChatDepthOption[];
  onSelectDepth: (value: string) => void;
  identityDrawerOpen: boolean;
  onToggleIdentityDrawer: () => void;
  onCloseIdentityDrawer: () => void;
  identitySections: ChatIdentitySection[];
  identityActions: ChatIdentityAction[];
};

function resolveAssistantLifecycle(status: ChatMessageRecord['status']): {
  label: string;
  tone: 'thinking' | 'working' | 'confirmation' | 'failed' | 'done';
} | null {
  if (status === 'sending') return { label: 'Thinking', tone: 'thinking' };
  if (status === 'running') return { label: 'Working', tone: 'working' };
  if (status === 'waiting') return { label: 'Confirmation required', tone: 'confirmation' };
  if (status === 'error') return { label: 'Failed', tone: 'failed' };
  return null;
}

function shouldSuppressAssistantBody(content: string, status: ChatMessageRecord['status']): boolean {
  const normalized = content.trim().toLowerCase();
  if (!normalized) return true;
  return (status === 'sending' || status === 'running') && (normalized === 'working on it...' || normalized === 'working on it…');
}

function renderRunCardStatusLabel(status: ChatRunCardStatus): string {
  if (status === 'preparing') return 'Preparing';
  if (status === 'running') return 'Running';
  if (status === 'waiting') return 'Confirmation required';
  if (status === 'completed') return 'Completed';
  if (status === 'needs_attention') return 'Needs attention';
  return 'Failed';
}

function renderChatStepIcon(step: ChatStepRecord) {
  if (step.kind === 'thinking') return <Sparkles size={14} />;
  if (step.kind === 'shell') return <Terminal size={14} />;
  if (step.kind === 'connector') return <PlugZap size={14} />;
  if (step.kind === 'screenshot') return <Camera size={14} />;
  return <FileText size={14} />;
}

export function ChatSurface({
  goal,
  setGoal,
  primaryGoalRef,
  onSend,
  onMessageAction,
  onRunApprovalDecision,
  chatBusy,
  messages,
  emptyState = null,
  inlineStatus,
  inlineAction = null,
  emptyAction = null,
  permissionPrompt = null,
  targetLabel,
  targetHref = '/agents',
  selectedModel,
  modelOptions,
  modelsLoading = false,
  onSelectModel,
  trustLabel,
  selectedDepth,
  depthLabel,
  depthOptions,
  onSelectDepth,
  identityDrawerOpen,
  onToggleIdentityDrawer,
  onCloseIdentityDrawer,
  identitySections,
  identityActions,
}: ChatSurfaceProps) {
  const router = useRouter();
  const isLoading = chatBusy;
  const sendDisabled = chatBusy || goal.trim().length === 0;
  const threadRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [controlsMenuOpen, setControlsMenuOpen] = useState(false);
  const [expandedStepMessages, setExpandedStepMessages] = useState<Record<string, boolean>>({});
  const visibleMessages = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    const lastLifecycle = lastMessage?.role === 'assistant'
      ? resolveAssistantLifecycle(lastMessage.status)
      : null;
    if (lastLifecycle && (lastLifecycle.tone === 'thinking' || lastLifecycle.tone === 'working')) {
      return messages;
    }
    if (!chatBusy) return messages;
    const syntheticThinkingMessage: ChatMessageRecord = {
      id: 'synthetic:thinking',
      role: 'assistant',
      content: '',
      ts: lastMessage?.ts || '',
      status: 'sending',
      run_id: null,
    };
    return [...messages, syntheticThinkingMessage];
  }, [chatBusy, messages]);
  const hasMessages = visibleMessages.length > 0;
  const isFirstThread = visibleMessages.length > 0 && visibleMessages.length <= 2;

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
    if (!threadRef.current) return;
    const frame = requestAnimationFrame(() => {
      if (!threadRef.current) return;
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [messages, isLoading]);

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
    <section
      className={`orion-chat-v2${hasMessages ? ' has-history' : ' is-empty'}${isFirstThread ? ' is-first-thread' : ''}`}
      suppressHydrationWarning
    >
      <div className="orion-chat-v2-thread-shell" ref={threadRef}>
        <div className="orion-chat-v2-session-bar">
          <button
            type="button"
            className="orion-chat-v2-session-pill"
            onClick={onToggleIdentityDrawer}
            aria-label="Open chat context"
          >
            <span>{targetLabel}</span>
            <ChevronDown size={14} />
          </button>
        </div>

        {!hasMessages && emptyState ? (
          <div className="orion-chat-v2-compact-empty" aria-live="polite">
            <h1 className="orion-chat-v2-compact-title">{emptyState.title}</h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {emptyState.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="orion-chip orion-chip-action"
                  onClick={() => emptyState.onSelectSuggestion(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {visibleMessages.length > 0 ? (
          <div className="orion-chat-v2-thread" aria-live="polite">
            {visibleMessages.map((message, index) => {
              const isUser = message.role === 'user';
              const isError = message.status === 'error';
              const previousMessage = index > 0 ? visibleMessages[index - 1] : null;
              const followsUser = !isUser && previousMessage?.role === 'user';
              const lifecycle = !isUser ? resolveAssistantLifecycle(message.status) : null;
              const showLoadingIndicator = Boolean(lifecycle && (lifecycle.tone === 'thinking' || lifecycle.tone === 'working'));
              const displayContent = isUser ? message.content : normalizeAssistantDisplayText(message.content);
              const suppressBody = !isUser && shouldSuppressAssistantBody(displayContent, message.status);
              const inlineError = isError ? normalizeInlineErrorMessage(displayContent) : '';
              const isFirstAssistantEntry = !isUser && isFirstThread && index <= 1;
              const steps = !isUser && Array.isArray(message.steps) ? message.steps : [];
              const hasSteps = steps.length > 0;
              const activeStep = hasSteps ? steps.find((step) => step.status === 'active') || null : null;
              const stepsExpanded = hasSteps ? (expandedStepMessages[message.id] ?? message.status !== 'completed') : false;
              return (
                <article
                  key={message.id}
                  className={`orion-chat-v2-turn${isUser ? ' is-user' : ' is-assistant'}${isError ? ' is-error' : ''}${isFirstAssistantEntry ? ' is-first-assistant-entry' : ''}${followsUser ? ' is-following-user' : ''}`}
                >
                  {isUser ? (
                    <div className="orion-chat-v2-user-stack">
                      <div className="orion-chat-v2-user-bubble">
                        <div className="orion-chat-v2-user-text">{displayContent}</div>
                      </div>
                      <div className="orion-chat-v2-meta">{fmtTime(message.ts)}</div>
                    </div>
                  ) : (
                    <div className="orion-chat-v2-assistant">
                      {showLoadingIndicator && lifecycle ? (
                        <div className={`orion-chat-v2-loading is-${lifecycle.tone}`} role="status" aria-live="polite">
                          <span className="orion-chat-v2-loading-orb" aria-hidden />
                          <span className="orion-chat-v2-loading-copy">
                            {lifecycle.tone === 'working' ? 'Working' : 'Thinking'}
                          </span>
                          <span className="orion-chat-v2-state-dots" aria-hidden>
                            <span />
                            <span />
                            <span />
                          </span>
                        </div>
                      ) : null}
                      {lifecycle && !showLoadingIndicator ? (
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
                      {hasSteps ? (
                        <div className={`orion-chat-v2-steps${stepsExpanded ? ' is-expanded' : ''}`}>
                          <button
                            type="button"
                            className="orion-chat-v2-steps-toggle"
                            onClick={() => {
                              setExpandedStepMessages((current) => ({
                                ...current,
                                [message.id]: !stepsExpanded,
                              }));
                            }}
                            aria-expanded={stepsExpanded}
                          >
                            <div className="orion-chat-v2-steps-toggle-copy">
                              <span className="orion-chat-v2-steps-toggle-title">
                                {activeStep ? activeStep.label : `${steps.length} step${steps.length === 1 ? '' : 's'}`}
                              </span>
                              <span className="orion-chat-v2-steps-toggle-detail">
                                {activeStep?.detail || (message.status === 'completed' ? 'Completed' : 'Click to inspect')}
                              </span>
                            </div>
                            <span className="orion-chat-v2-steps-toggle-meta">
                              <span>{stepsExpanded ? 'Hide' : 'Show'}</span>
                              {stepsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </span>
                          </button>
                          {stepsExpanded ? (
                            <div className="orion-chat-v2-step-list">
                              {steps.map((step) => (
                                <div key={step.id} className={`orion-chat-v2-step is-${step.status}`}>
                                  <div className="orion-chat-v2-step-icon" aria-hidden>
                                    {renderChatStepIcon(step)}
                                  </div>
                                  <div className="orion-chat-v2-step-copy">
                                    <div className="orion-chat-v2-step-label">{step.label}</div>
                                    {step.detail ? (
                                      <div className="orion-chat-v2-step-detail">{step.detail}</div>
                                    ) : null}
                                  </div>
                                  <div className="orion-chat-v2-step-state" aria-hidden>
                                    {step.status === 'done' ? (
                                      <CheckCircle2 size={14} />
                                    ) : step.status === 'active' ? (
                                      <LoaderCircle size={14} className="spin" />
                                    ) : (
                                      <X size={14} />
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {isError && inlineError ? (
                        <div className="orion-chat-v2-inline-error">⚠ {inlineError}</div>
                      ) : !suppressBody ? (
                        <div className="orion-chat-v2-markdown">
                          <ReactMarkdown>{displayContent}</ReactMarkdown>
                        </div>
                      ) : null}
                      {message.runCard ? (
                        <div className={`orion-chat-v2-run-card is-${message.runCard.status}`}>
                          <div className="orion-chat-v2-run-card-header">
                            <div className="orion-chat-v2-run-card-title">{message.runCard.title}</div>
                            <div className={`orion-chat-v2-run-card-status is-${message.runCard.status}`}>
                              {renderRunCardStatusLabel(message.runCard.status)}
                            </div>
                          </div>
                          {message.runCard.meta && message.runCard.meta.length > 0 ? (
                            <div className="orion-chat-v2-run-card-meta">
                              {message.runCard.meta.map((entry) => (
                                <div key={entry.id} className="orion-chat-v2-run-card-meta-item">
                                  <span className="orion-chat-v2-run-card-meta-label">{entry.label}</span>
                                  <span className="orion-chat-v2-run-card-meta-value">{entry.value}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {message.runCard.summary ? (
                            <div className="orion-chat-v2-run-card-summary">{message.runCard.summary}</div>
                          ) : null}
                          {message.runCard.evidence && message.runCard.evidence.length > 0 ? (
                            <div className="orion-chat-v2-run-card-evidence">
                              {message.runCard.evidence.map((entry) => (
                                <div key={entry.id} className="orion-chat-v2-run-card-evidence-item">
                                  <span className="orion-chat-v2-run-card-evidence-label">{entry.label}</span>
                                  <span className="orion-chat-v2-run-card-evidence-value">{entry.value}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {message.runCard.approval ? (
                            <div className="orion-chat-v2-run-card-approval">
                              <div className="orion-chat-v2-run-card-approval-copy">{message.runCard.approval.prompt}</div>
                              {message.runCard.approval.labels.length > 0 ? (
                                <div className="orion-chat-v2-run-card-approval-tags">
                                  {message.runCard.approval.labels.map((label) => (
                                    <div key={label} className="orion-chat-v2-run-card-approval-tag">
                                      <span className="orion-chat-v2-run-card-evidence-value">{label}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              <div className="orion-chat-v2-run-card-evidence">
                                <div className="orion-chat-v2-run-card-evidence-item">
                                  <span className="orion-chat-v2-run-card-evidence-label">Action</span>
                                  <span className="orion-chat-v2-run-card-evidence-value">{message.runCard.approval.actions.join(', ') || 'Not recorded'}</span>
                                </div>
                                <div className="orion-chat-v2-run-card-evidence-item">
                                  <span className="orion-chat-v2-run-card-evidence-label">Target</span>
                                  <span className="orion-chat-v2-run-card-evidence-value">{message.runCard.approval.target || 'Not recorded'}</span>
                                </div>
                                <div className="orion-chat-v2-run-card-evidence-item">
                                  <span className="orion-chat-v2-run-card-evidence-label">Scope</span>
                                  <span className="orion-chat-v2-run-card-evidence-value">One-time for this pending step</span>
                                </div>
                                <div className="orion-chat-v2-run-card-evidence-item">
                                  <span className="orion-chat-v2-run-card-evidence-label">Consequence</span>
                                  <span className="orion-chat-v2-run-card-evidence-value">{message.runCard.approval.consequence || 'This confirmation applies only to this pending step in this run.'}</span>
                                </div>
                              </div>
                              <div className="orion-chat-v2-actions">
                                <button
                                  type="button"
                                  className="orion-chat-v2-action is-primary"
                                  onClick={() => onRunApprovalDecision?.('once')}
                                  disabled={!onRunApprovalDecision}
                                >
                                  Confirm once
                                </button>
                                <button
                                  type="button"
                                  className="orion-chat-v2-action is-danger"
                                  onClick={() => onRunApprovalDecision?.('deny')}
                                  disabled={!onRunApprovalDecision}
                                >
                                  Decline
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {message.actions && message.actions.length > 0 ? (
                        <div className="orion-chat-v2-actions">
                          {message.actions.map((action) => (
                            <button
                              key={action.id}
                              type="button"
                              className={`orion-chat-v2-action${action.variant === 'primary' ? ' is-primary' : ''}${action.kind === 'connect' ? ' is-connect' : ''}`}
                              onClick={() => onMessageAction?.(message.id, action)}
                              disabled={!onMessageAction}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <div className="orion-chat-v2-meta">{fmtTime(message.ts)}</div>
                    </div>
                  )}
                </article>
              );
            })}
            <div ref={bottomRef} />
          </div>
        ) : null}
        <div className={`orion-chat-v2-composer-shell${hasMessages ? ' is-docked' : ' is-empty'}`}>
          <div className="orion-chat-v2-composer-frame">
            {permissionPrompt ? (
              <div className="orion-chat-v2-permission-card" role="status" aria-live="polite">
                <div className="orion-chat-v2-permission-header">
                  <div className="orion-chat-v2-permission-title">Confirmation required</div>
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
                <div className="orion-chat-v2-permission-detail">Action: {permissionPrompt.actions.join(', ') || 'Not recorded'}</div>
                <div className="orion-chat-v2-permission-detail">Target: {permissionPrompt.target || 'Not recorded'}</div>
                <div className="orion-chat-v2-permission-detail">Scope: One-time for this pending step</div>
                <div className="orion-chat-v2-permission-detail">{permissionPrompt.consequence || 'This confirmation applies only to this pending step in this run.'}</div>
                <div className="orion-chat-v2-permission-actions">
                  <button
                    type="button"
                    className="orion-chat-v2-permission-action is-primary"
                    onClick={permissionPrompt.onAllowOnce}
                    disabled={Boolean(permissionPrompt.busyKey)}
                  >
                    {permissionPrompt.busyKey === 'Proceed:once' ? 'Confirming…' : 'Confirm once'}
                  </button>
                  <button
                    type="button"
                    className="orion-chat-v2-permission-action is-danger"
                    onClick={permissionPrompt.onDeny}
                    disabled={Boolean(permissionPrompt.busyKey)}
                  >
                    {permissionPrompt.busyKey === 'Hold:once' ? 'Declining…' : 'Decline'}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="orion-chat-v2-composer">
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

              <div className="orion-chat-v2-composer-toolbar">
                <div className="orion-chat-v2-composer-toolbar-left">
                  <div className="orion-chat-v2-composer-menu" data-chat-menu-root>
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
                          Open context
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="orion-chat-v2-composer-toolbar-right">
                  <div className="orion-chat-v2-composer-menu" data-chat-menu-root>
                    <button
                      type="button"
                      className="orion-chat-v2-model-pill"
                      aria-label="Choose model"
                      aria-haspopup="menu"
                      aria-expanded={modelMenuOpen}
                      title={modelsLoading ? 'Refreshing models' : 'Choose model'}
                      onClick={() => {
                        setModelMenuOpen((current) => !current);
                        setAttachMenuOpen(false);
                        setControlsMenuOpen(false);
                      }}
                    >
                      <span>Models</span>
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
                        <div className="orion-chat-v2-menu-section-label">Response depth</div>
                        <div className="orion-chat-v2-menu-meta">{depthLabel}</div>
                        {depthOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={`orion-chat-v2-menu-item${option.value === selectedDepth ? ' is-selected' : ''}`}
                            onClick={() => {
                              onSelectDepth(option.value);
                              setControlsMenuOpen(false);
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                        <button type="button" className="orion-chat-v2-menu-item" onClick={() => { setControlsMenuOpen(false); onToggleIdentityDrawer(); }}>
                          Open context
                        </button>
                        <button type="button" className="orion-chat-v2-menu-item" onClick={() => { setControlsMenuOpen(false); router.push('/credentials'); }}>
                          Open integrations
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
            </div>

            {inlineStatus || emptyAction ? (
              <div className="orion-chat-v2-status-line">
                <span>{inlineStatus ? `⚠ ${inlineStatus}` : 'Connect an AI account to start chatting.'}</span>
                {inlineAction ? (
                  <button type="button" className="orion-chat-v2-status-action" onClick={() => router.push(inlineAction.href)}>
                    {inlineAction.label}
                  </button>
                ) : emptyAction ? (
                  <button type="button" className="orion-chat-v2-status-action" onClick={() => router.push(emptyAction.href)}>
                    {emptyAction.label}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {identityDrawerOpen ? (
        <>
          <button type="button" className="orion-chat-v2-drawer-backdrop" aria-label="Close setup details" onClick={onCloseIdentityDrawer} />
          <aside className="orion-chat-v2-drawer" aria-label="Chat context">
            <div className="orion-chat-v2-drawer-header">
              <div>
                <div className="orion-chat-v2-drawer-eyebrow">Context</div>
                <h2 className="orion-chat-v2-drawer-title">What this reply uses</h2>
              </div>
              <button type="button" className="orion-chat-v2-drawer-close" onClick={onCloseIdentityDrawer} aria-label="Close context">
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
