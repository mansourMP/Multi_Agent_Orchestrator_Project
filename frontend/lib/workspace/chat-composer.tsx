'use client';

import type { KeyboardEvent } from 'react';
import { useEffect, useRef } from 'react';
import { ArrowUp, Brain, ChevronDown } from 'lucide-react';

import { AppButton, AppSelect } from '@/lib/ui/primitives';

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

function isComposerOptionGroup(option: ComposerModelOption): option is ComposerOptionGroup {
  return 'options' in option;
}

export function ChatComposer({
  draft,
  onDraftChange,
  onSubmit,
  onOpenMemory,
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
  showAutonomySelector = true,
  autonomyFallbackLabel = 'Offline',
  busy = false,
}: {
  draft: string;
  onDraftChange: (nextDraft: string) => void;
  onSubmit: () => void;
  onOpenMemory?: () => void;
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
  showAutonomySelector?: boolean;
  autonomyFallbackLabel?: string;
  busy?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const canSend = !sendDisabled && !busy && draft.trim().length > 0;

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) {
      return;
    }
    element.style.height = '0px';
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
    element.style.overflowY = element.scrollHeight > 200 ? 'auto' : 'hidden';
  }, [draft]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') {
      return;
    }
    if (event.shiftKey) {
      return;
    }
    event.preventDefault();
    if (canSend) {
      onSubmit();
    }
  };

  return (
    <section data-workstation-chat-composer="root" className="app-chat-composer">
      {providerGateVisible ? (
        <div className="app-chat-composer__notice" role="status" aria-live="polite">
          <span>No AI provider connected · </span>
          <button
            type="button"
            className="app-chat-composer__notice-link"
            onClick={() => {
              onOpenIntegrations?.();
            }}
          >
            Set up in Integrations
          </button>
        </div>
      ) : null}
      <div className="app-chat-composer__surface">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => onDraftChange(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={placeholder}
          className="app-textarea app-chat-composer__textarea"
        />

        <div className="app-chat-composer__footer">
          <div className="app-chat-composer__footer-group">
            <button
              type="button"
              aria-label="Open memory"
              onClick={() => {
                onOpenMemory?.();
              }}
              disabled={busy}
              className="app-chat-composer__icon-button"
            >
              <Brain size={15} strokeWidth={1.85} aria-hidden="true" />
            </button>

            <div className="app-chat-composer__select-stack">
              <div className="app-chat-composer__select-shell app-chat-composer__select-shell--model">
                <AppSelect
                  aria-label="Model"
                  value={model}
                  onChange={(event) => {
                    onModelChange(event.currentTarget.value);
                  }}
                  disabled={controlsDisabled || busy}
                  className="app-chat-composer__token-select app-chat-composer__token-select--model"
                >
                  {modelOptions.map((option) => (isComposerOptionGroup(option) ? (
                    <optgroup key={option.label} label={option.label}>
                      {option.options.map((groupOption) => (
                        <option
                          key={`${option.label}:${groupOption.value}`}
                          value={groupOption.value}
                          disabled={groupOption.disabled}
                        >
                          {groupOption.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : (
                    <option key={option.value} value={option.value} disabled={option.disabled}>
                      {option.label}
                    </option>
                  )))}
                </AppSelect>
                <ChevronDown
                  size={14}
                  strokeWidth={1.8}
                  className="app-chat-composer__select-chevron"
                  aria-hidden="true"
                />
              </div>
              {contextWindowLabel ? (
                <span className="app-chat-composer__context-hint">
                  {contextWindowLabel}
                </span>
              ) : null}
            </div>

            <div className="app-chat-composer__select-shell app-chat-composer__select-shell--reasoning">
              <AppSelect
                aria-label="Reasoning effort"
                value={reasoningEffort}
                onChange={(event) => {
                  onReasoningEffortChange(event.currentTarget.value);
                }}
                disabled={controlsDisabled || busy}
                className="app-chat-composer__token-select app-chat-composer__token-select--reasoning"
              >
                {reasoningOptions.map((option) => (
                  <option key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                  </option>
                ))}
              </AppSelect>
              <ChevronDown
                size={14}
                strokeWidth={1.8}
                className="app-chat-composer__select-chevron"
                aria-hidden="true"
              />
            </div>
          </div>

          <div className="app-chat-composer__footer-group app-chat-composer__footer-group--end">
            <AppButton
              type="button"
              onClick={onSubmit}
              disabled={!canSend}
              aria-label={busy ? 'Sending message' : 'Send message'}
              className="app-chat-composer__send"
            >
              {busy ? (
                <span className="app-chat-composer__busy-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              ) : (
                <ArrowUp size={16} strokeWidth={1.95} aria-hidden="true" />
              )}
            </AppButton>
          </div>
        </div>
      </div>

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
