'use client';

import type { FormEvent, KeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  ChevronRight,
  Command,
  Plus,
  Square,
  X,
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

export type ComposerPreRunCostEstimate = {
  estimateLabel: string;
  detail: string;
  warnings: string[];
};

export type ComposerSlashCommand = {
  id: string;
  slash: `/${string}`;
  title: string;
  description: string;
  category?: string;
  keywords?: readonly string[];
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
  preRunCostEstimate = null,
  slashCommands = [],
  onSlashCommandSelect,
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
  preRunCostEstimate?: ComposerPreRunCostEstimate | null;
  slashCommands?: readonly ComposerSlashCommand[];
  onSlashCommandSelect?: (command: ComposerSlashCommand) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const actionLauncherRef = useRef<HTMLDivElement | null>(null);
  const commandPaletteRef = useRef<HTMLDivElement | null>(null);
  const [actionPaletteOpen, setActionPaletteOpen] = useState(false);
  const [commandPaletteDismissed, setCommandPaletteDismissed] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const hasDraft = draft.trim().length > 0;
  const canSend = !busy && !sendDisabled && hasDraft;
  const canStop = busy && typeof onStop === 'function';
  const showSendButton = busy || hasDraft;
  void model;
  void modelOptions;
  void onModelChange;
  void reasoningEffort;
  void reasoningOptions;
  void onReasoningEffortChange;
  void runtimeStatusLabel;
  void runtimeStatusTone;
  void toolGroups;
  void contextWindowLabel;
  void preRunCostEstimate;

  const commandQuery = useMemo(() => {
    if (!draft.startsWith('/') || draft.includes('\n')) {
      return null;
    }
    const normalized = draft.slice(1).trimStart();
    if (!normalized) {
      return '';
    }
    if (/\s/.test(normalized)) {
      return null;
    }
    return normalized.toLowerCase();
  }, [draft]);
  const showAllSlashCommands = actionPaletteOpen && typeof onSlashCommandSelect === 'function';
  const filteredSlashCommands = useMemo(() => {
    if (commandQuery === null && !showAllSlashCommands) {
      return [];
    }
    if (!commandQuery) {
      return [...slashCommands];
    }
    return slashCommands.filter((command) => {
      const haystack = [
        command.slash,
        command.title,
        command.description,
        ...(command.keywords ?? []),
      ].join(' ').toLowerCase();
      return haystack.includes(commandQuery);
    });
  }, [commandQuery, showAllSlashCommands, slashCommands]);
  const commandPaletteVisible = (
    actionPaletteOpen
    || (!commandPaletteDismissed && commandQuery !== null)
  )
    && filteredSlashCommands.length > 0
    && typeof onSlashCommandSelect === 'function';

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
    textareaRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    setSelectedCommandIndex(0);
  }, [actionPaletteOpen, commandQuery]);

  useEffect(() => {
    if (selectedCommandIndex < filteredSlashCommands.length) {
      return;
    }
    setSelectedCommandIndex(Math.max(0, filteredSlashCommands.length - 1));
  }, [filteredSlashCommands.length, selectedCommandIndex]);

  useEffect(() => {
    if (!actionPaletteOpen && !commandPaletteVisible) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (
        actionLauncherRef.current?.contains(target)
        || commandPaletteRef.current?.contains(target)
      ) {
        return;
      }
      setActionPaletteOpen(false);
      setCommandPaletteDismissed(true);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [actionPaletteOpen, commandPaletteVisible]);

  const selectSlashCommand = (command: ComposerSlashCommand) => {
    setCommandPaletteDismissed(true);
    setActionPaletteOpen(false);
    onSlashCommandSelect?.(command);
  };

  const handleDraftChange = (nextDraft: string) => {
    if (!nextDraft.startsWith('/')) {
      setCommandPaletteDismissed(true);
      setActionPaletteOpen(false);
    } else {
      setCommandPaletteDismissed(false);
    }
    onDraftChange(nextDraft);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (commandPaletteVisible) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedCommandIndex((current) => (current + 1) % filteredSlashCommands.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedCommandIndex((current) => (
          current === 0 ? filteredSlashCommands.length - 1 : current - 1
        ));
        return;
      }
      if (event.key === 'Tab' || event.key === 'Enter') {
        const selectedCommand = filteredSlashCommands[selectedCommandIndex];
        if (selectedCommand) {
          event.preventDefault();
          selectSlashCommand(selectedCommand);
          return;
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setActionPaletteOpen(false);
        setCommandPaletteDismissed(true);
        return;
      }
    }
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
          onChange={(event) => handleDraftChange(event.currentTarget.value)}
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
            <div className="app-chat-composer__actions" ref={actionLauncherRef}>
              <button
                type="button"
                className={joinClassNames(
                  'app-chat-composer__action-trigger',
                  providerGateVisible && 'app-chat-composer__provider-pill--warning',
                )}
                onClick={() => {
                  setCommandPaletteDismissed(false);
                  setActionPaletteOpen((current) => !current);
                }}
                aria-expanded={commandPaletteVisible}
                aria-label={providerGateVisible ? (providerSummary?.actionLabel ?? 'Set up Sage') : 'Open Sage commands'}
              >
                {providerGateVisible ? (
                  <Plus size={15} strokeWidth={2.1} aria-hidden="true" />
                ) : (
                  <Command size={15} strokeWidth={2.1} aria-hidden="true" />
                )}
                <span>{providerGateVisible ? (providerSummary?.actionLabel ?? 'Set up Sage') : 'Commands'}</span>
              </button>

              {commandPaletteVisible ? (
                <div
                  ref={commandPaletteRef}
                  className="app-chat-composer__command-palette"
                  role="dialog"
                  aria-label="Sage actions"
                >
                  {providerGateVisible && providerSummary && typeof onOpenIntegrations === 'function' ? (
                    <button
                      type="button"
                      className="app-chat-composer__command-setup"
                      onClick={() => {
                        setActionPaletteOpen(false);
                        setCommandPaletteDismissed(true);
                        onOpenIntegrations();
                      }}
                    >
                      <span className="app-chat-composer__command-copy">
                        <span className="app-chat-composer__command-title-row">
                          <strong>{providerSummary.actionLabel ?? 'Set up Sage'}</strong>
                        </span>
                        <span>{providerSummary.label}</span>
                      </span>
                      <span className="app-chat-composer__command-shortcut">Open</span>
                      <ChevronRight
                        className="app-chat-composer__command-chevron"
                        size={16}
                        strokeWidth={1.9}
                        aria-hidden="true"
                      />
                    </button>
                  ) : null}
                  <div className="app-chat-composer__command-head">
                    <span>Sage commands</span>
                    <span>{commandQuery !== null ? 'Type to filter' : 'Built-in and custom controls'}</span>
                  </div>
                  <div className="app-chat-composer__command-list" role="listbox" aria-label="Available Sage actions">
                    {filteredSlashCommands.map((command, index) => (
                      <button
                        key={command.id}
                        type="button"
                        className={joinClassNames(
                          'app-chat-composer__command-item',
                          index === selectedCommandIndex && 'app-chat-composer__command-item--active',
                        )}
                        onMouseEnter={() => setSelectedCommandIndex(index)}
                        onClick={() => selectSlashCommand(command)}
                        role="option"
                        aria-selected={index === selectedCommandIndex}
                      >
                        <span className="app-chat-composer__command-copy">
                          <span className="app-chat-composer__command-title-row">
                            <strong>{command.title}</strong>
                            {command.category ? (
                              <span className="app-chat-composer__command-category">{command.category}</span>
                            ) : null}
                          </span>
                          <span>{command.description}</span>
                        </span>
                        <span className="app-chat-composer__command-shortcut">{command.slash}</span>
                        <ChevronRight
                          className="app-chat-composer__command-chevron"
                          size={16}
                          strokeWidth={1.9}
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                  </div>
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
