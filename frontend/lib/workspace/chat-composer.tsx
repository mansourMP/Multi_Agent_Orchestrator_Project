'use client';

import type { FormEvent, KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Square,
  Wrench,
  X,
  Zap,
} from 'lucide-react';

import { AppButton, AppSelect, joinClassNames } from '@/lib/ui/primitives';

type ComposerOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type ComposerOptionGroup = {
  label: string;
  options: ComposerOption[];
};

type ComposerModelOption = ComposerOption | ComposerOptionGroup;

export type ComposerToolItem = {
  id: string;
  label: string;
  detail?: string;
  enabled: boolean;
};

export type ComposerToolGroup = {
  id: string;
  label: string;
  items: ComposerToolItem[];
};

function isComposerOptionGroup(option: ComposerModelOption): option is ComposerOptionGroup {
  return 'options' in option;
}

function composerOptionLabel(options: ComposerModelOption[], value: string): string {
  for (const option of options) {
    if (isComposerOptionGroup(option)) {
      const nested = option.options.find((item) => item.value === value);
      if (nested) {
        return nested.label;
      }
      continue;
    }
    if (option.value === value) {
      return option.label;
    }
  }
  return '';
}

function flattenComposerOptions(options: ComposerModelOption[]): ComposerOption[] {
  return options.flatMap((option) => (isComposerOptionGroup(option) ? option.options : [option]));
}

function compactModelLabel(label: string, fallback: string): string {
  const normalized = label.trim() || fallback;
  const parts = normalized
    .split('·')
    .map((part) => part.trim())
    .filter(Boolean);
  const routeSuffixes = new Set(['hosted', 'local', 'workspace key']);
  const visibleParts = parts.filter((part) => !routeSuffixes.has(part.toLowerCase()));
  if (visibleParts.length > 0 && visibleParts.length < parts.length) {
    return visibleParts.join(' · ');
  }
  if (parts.length >= 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) {
    return parts[0];
  }
  return normalized;
}

export function ChatComposer({
  draft,
  onDraftChange,
  onSubmit,
  onStop,
  onOpenIntegrations,
  runTarget,
  runTargetOptions,
  onRunTargetChange,
  autonomyMode,
  autonomyOptions,
  onAutonomyModeChange,
  targetLabel,
  model,
  modelOptions,
  onModelChange,
  reasoningEffort,
  reasoningOptions,
  onReasoningEffortChange,
  contextWindowLabel = null,
  controlsDisabled = false,
  sendDisabled = false,
  placeholder = '',
  providerGateVisible = false,
  providerSummary = null,
  showAutonomySelector = true,
  autonomyFallbackLabel = 'Offline',
  busy = false,
  runtimeStatusLabel = 'Cloud',
  runtimeStatusTone = 'neutral',
  toolGroups = [],
  smallModelWarning = null,
  onDismissSmallModelWarning,
}: {
  draft: string;
  onDraftChange: (nextDraft: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  onOpenIntegrations?: () => void;
  runTarget: string;
  runTargetOptions: ComposerOption[];
  onRunTargetChange: (nextValue: string) => void;
  autonomyMode: string;
  autonomyOptions: ComposerOption[];
  onAutonomyModeChange: (nextValue: string) => void;
  targetLabel: string;
  model: string;
  modelOptions: ComposerModelOption[];
  onModelChange: (nextValue: string) => void;
  reasoningEffort: string;
  reasoningOptions: ComposerOption[];
  onReasoningEffortChange: (nextValue: string) => void;
  contextWindowLabel?: string | null;
  controlsDisabled?: boolean;
  sendDisabled?: boolean;
  placeholder?: string;
  providerGateVisible?: boolean;
  providerSummary?: {
    label: string;
    actionLabel?: string;
  } | null;
  showAutonomySelector?: boolean;
  autonomyFallbackLabel?: string;
  busy?: boolean;
  runtimeStatusLabel?: string;
  runtimeStatusTone?: 'neutral' | 'warning' | 'success';
  toolGroups?: ComposerToolGroup[];
  smallModelWarning?: string | null;
  onDismissSmallModelWarning?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const runtimePickerRef = useRef<HTMLDivElement | null>(null);
  const toolsPickerRef = useRef<HTMLDivElement | null>(null);
  const [runtimePickerOpen, setRuntimePickerOpen] = useState(false);
  const [toolPaletteOpen, setToolPaletteOpen] = useState(false);
  const hasDraft = draft.trim().length > 0;
  const canSend = !busy && !sendDisabled && hasDraft;
  const canStop = busy && typeof onStop === 'function';
  const showSendButton = busy || hasDraft;
  const selectedModelLabel = composerOptionLabel(modelOptions, model);
  const selectedReasoningOption = reasoningOptions.find((option) => option.value === reasoningEffort);
  const flatModelOptions = flattenComposerOptions(modelOptions);
  const compactSelectedModelLabel = compactModelLabel(selectedModelLabel, model || 'Auto route');
  const reasoningLabel = selectedReasoningOption?.label ?? reasoningEffort;
  const runtimePillLabel = [compactSelectedModelLabel, reasoningLabel].filter(Boolean).join(' · ');
  const availableToolCount = toolGroups.reduce(
    (total, group) => total + group.items.filter((item) => item.enabled).length,
    0,
  );
  void onOpenIntegrations;
  void providerSummary;
  void contextWindowLabel;

  const submitDraft = () => {
    if (!canSend) {
      return;
    }
    onSubmit();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitDraft();
  };

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) {
      return;
    }
    element.style.height = '0px';
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
    element.style.overflowY = element.scrollHeight > 200 ? 'auto' : 'hidden';
  }, [draft]);

  useEffect(() => {
    if (!runtimePickerOpen && !toolPaletteOpen) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (runtimePickerRef.current?.contains(target) || toolsPickerRef.current?.contains(target)) {
        return;
      }
      setRuntimePickerOpen(false);
      setToolPaletteOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [runtimePickerOpen, toolPaletteOpen]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') {
      if (event.key === 'Escape' && canStop) {
        event.preventDefault();
        onStop?.();
      }
      return;
    }
    if (event.shiftKey) {
      return;
    }
    event.preventDefault();
    submitDraft();
  };

  return (
    <section data-workstation-chat-composer="root" className="app-chat-composer">
      <form className="app-chat-composer__surface" onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => onDraftChange(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={placeholder}
          className="app-textarea app-chat-composer__textarea"
          disabled={sendDisabled && !busy}
        />

        {smallModelWarning ? (
          <div className="app-chat-composer__small-model-warning" role="status">
            <span>{smallModelWarning}</span>
            <button
              type="button"
              className="app-chat-composer__small-model-warning-dismiss"
              aria-label="Dismiss small model warning"
              onClick={onDismissSmallModelWarning}
            >
              <X size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <div className="app-chat-composer__toolbar">
          <div className="app-chat-composer__toolbar-left">
            <div className="app-chat-composer__runtime" ref={runtimePickerRef}>
              <button
                type="button"
                className={joinClassNames(
                  'app-chat-composer__provider-pill',
                  providerGateVisible && 'app-chat-composer__provider-pill--warning',
                )}
                onClick={() => {
                  setToolPaletteOpen(false);
                  setRuntimePickerOpen((current) => !current);
                }}
                aria-expanded={runtimePickerOpen}
                aria-label="Change model and reasoning"
                title={runtimePillLabel}
              >
                <Zap size={13} strokeWidth={2.15} aria-hidden="true" />
                <span>{runtimePillLabel}</span>
                <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
              </button>

              {runtimePickerOpen ? (
                <div className="app-chat-composer__runtime-popover" role="dialog" aria-label="Model and reasoning">
                  <div className="app-chat-composer__runtime-section">
                    <div className="app-chat-composer__runtime-section-title">Intelligence</div>
                    {reasoningOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          onReasoningEffortChange(option.value);
                          setRuntimePickerOpen(false);
                        }}
                        disabled={controlsDisabled || busy || option.disabled}
                        className={joinClassNames(
                          'app-chat-composer__runtime-menu-row',
                          reasoningEffort === option.value && 'app-chat-composer__runtime-menu-row--active',
                        )}
                      >
                        <span>{option.label}</span>
                        {reasoningEffort === option.value ? <Check size={18} strokeWidth={2.1} aria-hidden="true" /> : null}
                      </button>
                    ))}
                  </div>

                  <div className="app-chat-composer__runtime-divider" />

                  <div className="app-chat-composer__runtime-section">
                    <div className="app-chat-composer__runtime-section-title">Model</div>
                    {flatModelOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          onModelChange(option.value);
                          setRuntimePickerOpen(false);
                        }}
                        disabled={controlsDisabled || busy || option.disabled}
                        className={joinClassNames(
                          'app-chat-composer__runtime-menu-row',
                          model === option.value && 'app-chat-composer__runtime-menu-row--active',
                        )}
                      >
                        <span>{compactModelLabel(option.label, option.value)}</span>
                        {model === option.value ? (
                          <Check size={18} strokeWidth={2.1} aria-hidden="true" />
                        ) : (
                          <ChevronRight size={16} strokeWidth={1.9} aria-hidden="true" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div
              className={joinClassNames(
                'app-chat-composer__status-pill',
                runtimeStatusTone === 'warning' && 'app-chat-composer__status-pill--warning',
                runtimeStatusTone === 'success' && 'app-chat-composer__status-pill--success',
              )}
            >
              <span className="app-chat-composer__status-dot" aria-hidden="true" />
              <span>{runtimeStatusLabel}</span>
            </div>

            <div className="app-chat-composer__toolbar-divider" />

            <div className="app-chat-composer__tools" ref={toolsPickerRef}>
              <button
                type="button"
                className="app-chat-composer__tool-trigger"
                aria-expanded={toolPaletteOpen}
                aria-label="Open tools palette"
                onClick={() => {
                  setRuntimePickerOpen(false);
                  setToolPaletteOpen((current) => !current);
                }}
              >
                <Wrench size={15} strokeWidth={2} aria-hidden="true" />
                <span>Tools</span>
                <span className="app-chat-composer__tool-count">{availableToolCount}</span>
              </button>

              {toolPaletteOpen ? (
                <div className="app-chat-composer__tools-popover" role="dialog" aria-label="Tools palette">
                  {toolGroups.map((group) => (
                    <section key={group.id} className="app-chat-composer__tools-section">
                      <div className="app-chat-composer__tools-section-title">{group.label}</div>
                      <div className="app-chat-composer__tools-list">
                        {group.items.map((item) => (
                          <div
                            key={item.id}
                            className={joinClassNames(
                              'app-chat-composer__tools-row',
                              !item.enabled && 'app-chat-composer__tools-row--disabled',
                            )}
                          >
                            <div className="app-chat-composer__tools-copy">
                              <strong>{item.label}</strong>
                              {item.detail ? <span>{item.detail}</span> : null}
                            </div>
                            <span
                              className={joinClassNames(
                                'app-chat-composer__tools-badge',
                                item.enabled && 'app-chat-composer__tools-badge--enabled',
                              )}
                            >
                              {item.enabled ? 'Available' : 'Unavailable'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <AppButton
            type={busy ? 'button' : 'submit'}
            onClick={busy ? onStop : undefined}
            disabled={busy ? !canStop : !canSend}
            aria-label={sendDisabled && !busy ? 'Send message and review provider setup' : busy ? 'Stop response' : 'Send message'}
            className={joinClassNames(
              'app-chat-composer__send',
              busy && 'app-chat-composer__send--stop',
              !showSendButton && 'app-chat-composer__send--hidden',
            )}
          >
            {busy ? (
              <Square size={14} strokeWidth={2.6} aria-hidden="true" fill="currentColor" />
            ) : (
              <ArrowUp size={16} strokeWidth={2.1} aria-hidden="true" />
            )}
          </AppButton>
        </div>
      </form>

      <div className="app-chat-composer__rail" aria-label="Conversation runtime controls" hidden>
        {runTargetOptions.length <= 1 ? (
          <span className="app-chat-composer__token app-chat-composer__token--static">
            {runTargetOptions[0]?.label ?? runTarget}
          </span>
        ) : (
          <AppSelect
            aria-label="Run target"
            value={runTarget}
            onChange={(event) => {
              onRunTargetChange(event.currentTarget.value);
            }}
            disabled={controlsDisabled || busy}
            className="app-chat-composer__token-select app-chat-composer__token-select--runtime"
          >
            {runTargetOptions.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </AppSelect>
        )}

        <span className="app-chat-composer__token app-chat-composer__token--static">
          {targetLabel}
        </span>

        {showAutonomySelector ? (
          <AppSelect
            aria-label="Autonomy mode"
            value={autonomyMode}
            onChange={(event) => {
              onAutonomyModeChange(event.currentTarget.value);
            }}
            disabled={controlsDisabled || busy}
            className={`app-chat-composer__token-select app-chat-composer__token-select--autonomy${autonomyMode === 'full' ? ' app-chat-composer__token-select--warning' : ''}`}
          >
            {autonomyOptions.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </AppSelect>
        ) : (
          <span className="app-chat-composer__token app-chat-composer__token--static">
            {autonomyFallbackLabel}
          </span>
        )}
      </div>
    </section>
  );
}
