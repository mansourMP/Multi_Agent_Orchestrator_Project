'use client';

import type { FormEvent, KeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Brain,
  Check,
  ChevronRight,
  Mic,
  MicOff,
  Plus,
  Square,
  X,
  type LucideIcon,
} from 'lucide-react';

import { AppButton, joinClassNames } from '@/lib/ui/primitives';

type ComposerOption = {
  value: string;
  label: string;
  detail?: string;
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
  icon: LucideIcon;
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

function flattenComposerOptions(options: ComposerModelOption[]): Array<ComposerOption & { groupLabel?: string }> {
  return options.flatMap((option) => {
    if (isComposerOptionGroup(option)) {
      return option.options.map((nested) => ({
        ...nested,
        groupLabel: option.label,
      }));
    }
    return [option];
  });
}

function compactModelLabel(label: string, fallback: string): string {
  const normalized = label.trim() || fallback;
  const parts = normalized
    .split('·')
    .map((part) => part.trim())
    .filter(Boolean);
  const routeSuffixes = new Set(['hosted', 'local', 'workspace key', 'empyralis credits']);
  const visibleParts = parts.filter((part) => !routeSuffixes.has(part.toLowerCase()));
  if (visibleParts.length > 0 && visibleParts.length < parts.length) {
    return visibleParts.join(' · ');
  }
  if (parts.length >= 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) {
    return parts[0];
  }
  return normalized;
}

function productProviderLabel(label: string | null | undefined, hostedCredits: boolean): string | null {
  const normalized = (label ?? '').trim();
  if (hostedCredits) {
    if (!normalized || normalized.toLowerCase() === 'empyralis credits') {
      return 'Empyralis AI';
    }
    return normalized.replace(/\s*credits$/i, ' AI');
  }
  return normalized || null;
}

export function ChatComposer({
  draft,
  onDraftChange,
  onSubmit,
  onStop,
  onOpenIntegrations,
  model,
  modelOptions,
  modelProviderLabel = null,
  onModelChange,
  reasoningEffort,
  reasoningOptions,
  onReasoningEffortChange,
  controlsDisabled = false,
  sendDisabled = false,
  placeholder = '',
  providerGateVisible = false,
  providerSummary = null,
  busy = false,
  smallModelWarning = null,
  onDismissSmallModelWarning,
  slashCommands = [],
  onSlashCommandSelect,
  onVoiceTranscribe,
}: {
  draft: string;
  onDraftChange: (nextDraft: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  onOpenIntegrations?: () => void;
  model: string;
  modelOptions: ComposerModelOption[];
  modelProviderLabel?: string | null;
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
  busy?: boolean;
  smallModelWarning?: string | null;
  onDismissSmallModelWarning?: () => void;
  preRunCostEstimate?: ComposerPreRunCostEstimate | null;
  slashCommands?: readonly ComposerSlashCommand[];
  onSlashCommandSelect?: (command: ComposerSlashCommand) => void;
  onVoiceTranscribe?: (audio: Blob) => Promise<string>;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const actionLauncherRef = useRef<HTMLDivElement | null>(null);
  const commandPaletteRef = useRef<HTMLDivElement | null>(null);
  const modelPanelRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const draftRef = useRef(draft);
  const [actionPaletteOpen, setActionPaletteOpen] = useState(false);
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const [voiceState, setVoiceState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [commandPaletteDismissed, setCommandPaletteDismissed] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const hasDraft = draft.trim().length > 0;
  const canSend = !busy && !sendDisabled && hasDraft;
  const canStop = busy && typeof onStop === 'function';
  const showSendButton = busy || hasDraft;
  const rawSelectedModelLabel = compactModelLabel(composerOptionLabel(modelOptions, model), model || 'Model');
  const visibleModelOptions = useMemo(() => flattenComposerOptions(modelOptions), [modelOptions]);
  const selectedModelOption = visibleModelOptions.find((option) => option.value === model) ?? null;
  const hostedCreditOptions = useMemo(
    () => visibleModelOptions.filter((option) => {
      const groupLabel = (option.groupLabel ?? '').toLowerCase();
      const label = compactModelLabel(option.label, option.value).toLowerCase();
      return groupLabel === 'empyralis credits' || label === 'light' || label === 'pro' || label === 'max';
    }),
    [visibleModelOptions],
  );
  const selectedModelIsDefaultRoute = !selectedModelOption || selectedModelOption.value === 'default';
  const isHostedCreditsModel = (selectedModelOption?.groupLabel ?? '').toLowerCase() === 'empyralis credits'
    || (modelProviderLabel ?? '').toLowerCase() === 'empyralis credits'
    || ['light', 'pro', 'max'].includes(rawSelectedModelLabel.toLowerCase())
    || (selectedModelIsDefaultRoute && hostedCreditOptions.length > 0);
  const selectedModelLabel = selectedModelIsDefaultRoute && hostedCreditOptions.length > 0
    ? compactModelLabel(hostedCreditOptions[0]?.label ?? 'Light', 'Light')
    : selectedModelIsDefaultRoute && visibleModelOptions.length <= 1
      ? 'Connect AI'
      : rawSelectedModelLabel;
  const modelMenuOptions = isHostedCreditsModel && hostedCreditOptions.length > 0
    ? hostedCreditOptions
    : visibleModelOptions;
  const modelMenuProviderLabel = productProviderLabel(modelProviderLabel, isHostedCreditsModel);
  const canOpenProviderPicker = typeof onOpenIntegrations === 'function';
  const selectedReasoningLabel = composerOptionLabel(reasoningOptions, reasoningEffort) || reasoningEffort || 'Auto';
  const voiceSupported = typeof onVoiceTranscribe === 'function'
    && typeof window !== 'undefined'
    && typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== 'undefined';

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
  const filteredSlashCommands = useMemo(() => {
    if (commandQuery === null) {
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
  }, [commandQuery, slashCommands]);
  const commandPaletteVisible = !commandPaletteDismissed
    && commandQuery !== null
    && filteredSlashCommands.length > 0
    && typeof onSlashCommandSelect === 'function';
  const actionMenuVisible = actionPaletteOpen && typeof onOpenIntegrations === 'function';

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
    draftRef.current = draft;
  }, [draft]);

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
    if (!actionPaletteOpen && !commandPaletteVisible && !modelPanelOpen) {
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
        || modelPanelRef.current?.contains(target)
      ) {
        return;
      }
      setActionPaletteOpen(false);
      setModelPanelOpen(false);
      setCommandPaletteDismissed(true);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [actionPaletteOpen, commandPaletteVisible, modelPanelOpen]);

  const selectSlashCommand = (command: ComposerSlashCommand) => {
    setCommandPaletteDismissed(true);
    setActionPaletteOpen(false);
    onSlashCommandSelect?.(command);
  };

  const stopVoiceRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      return;
    }
    recorder.stop();
  };

  const startVoiceRecording = async () => {
    if (!voiceSupported) {
      setVoiceNotice('Voice is unavailable in this browser.');
      return;
    }
    setVoiceNotice(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const audio = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        recordedChunksRef.current = [];
        mediaRecorderRef.current = null;
        if (!audio.size || !onVoiceTranscribe) {
          setVoiceState('idle');
          return;
        }
        setVoiceState('transcribing');
        void onVoiceTranscribe(audio)
          .then((transcript) => {
            const cleanTranscript = transcript.trim();
            if (!cleanTranscript) {
              setVoiceNotice('No speech detected.');
              return;
            }
            const currentDraft = draftRef.current.trim();
            onDraftChange(currentDraft ? `${currentDraft}\n${cleanTranscript}` : cleanTranscript);
            setVoiceNotice('Voice added. Press send when ready.');
          })
          .catch((error) => {
            setVoiceNotice(error instanceof Error ? error.message : 'Voice could not be transcribed.');
          })
          .finally(() => {
            setVoiceState('idle');
          });
      };
      recorder.start();
      setVoiceState('recording');
    } catch {
      setVoiceNotice('Microphone access was blocked.');
      setVoiceState('idle');
    }
  };

  const handleVoiceButton = () => {
    if (voiceState === 'recording') {
      stopVoiceRecording();
      return;
    }
    if (voiceState === 'transcribing' || busy) {
      return;
    }
    void startVoiceRecording();
  };

  const handleDraftChange = (nextDraft: string) => {
    if (!nextDraft.startsWith('/')) {
      setCommandPaletteDismissed(true);
      setActionPaletteOpen(false);
    } else {
      setActionPaletteOpen(false);
      setModelPanelOpen(false);
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

        {voiceNotice ? (
          <div className="app-chat-composer__small-model-warning" role="status">
            <span>{voiceNotice}</span>
            <button
              type="button"
              className="app-chat-composer__small-model-warning-dismiss"
              aria-label="Dismiss voice notice"
              onClick={() => setVoiceNotice(null)}
            >
              <X size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <div className="app-chat-composer__toolbar">
          <div
            className={joinClassNames(
              'app-chat-composer__toolbar-left',
              (actionMenuVisible || commandPaletteVisible || modelPanelOpen)
                && 'app-chat-composer__toolbar-left--menu-open',
            )}
          >
            <div className="app-chat-composer__actions" ref={actionLauncherRef}>
              <button
                type="button"
                className={joinClassNames(
                  'app-chat-composer__action-trigger',
                  'app-chat-composer__icon-trigger',
                  providerGateVisible && 'app-chat-composer__provider-pill--warning',
                )}
                  onClick={() => {
                    setCommandPaletteDismissed(true);
                    setModelPanelOpen(false);
                    setActionPaletteOpen((current) => !current);
                  }}
                aria-expanded={actionMenuVisible}
                aria-label={providerGateVisible ? (providerSummary?.actionLabel ?? 'Set up Sage') : 'Add or connect'}
              >
                <Plus size={18} strokeWidth={2.1} aria-hidden="true" />
              </button>

              {actionMenuVisible ? (
                <div
                  className="app-chat-composer__action-menu"
                  role="dialog"
                  aria-label="Add context"
                >
                  {providerGateVisible && providerSummary && typeof onOpenIntegrations === 'function' ? (
                    <button
                      type="button"
                      className="app-chat-composer__command-setup"
                      onClick={() => {
                        setActionPaletteOpen(false);
                        onOpenIntegrations();
                      }}
                    >
                      <Plus size={16} strokeWidth={2.1} aria-hidden="true" />
                      <span className="app-chat-composer__command-copy">
                        <span className="app-chat-composer__command-title-row">
                          <strong>{providerSummary.actionLabel ?? 'Set up Sage'}</strong>
                          <span>{providerSummary.label}</span>
                        </span>
                      </span>
                      <ChevronRight
                        className="app-chat-composer__command-chevron"
                        size={16}
                        strokeWidth={1.9}
                        aria-hidden="true"
                      />
                    </button>
                  ) : null}
                  {typeof onOpenIntegrations === 'function' ? (
                    <button
                      type="button"
                      className="app-chat-composer__command-item"
                      onClick={() => {
                        setActionPaletteOpen(false);
                        onOpenIntegrations();
                      }}
                    >
                      <Plus size={16} strokeWidth={1.9} aria-hidden="true" />
                      <span className="app-chat-composer__command-copy">
                        <span className="app-chat-composer__command-title-row">
                          <strong>Add files, apps, or tools</strong>
                          <span className="app-chat-composer__command-description">
                            Connect sources and capabilities.
                          </span>
                        </span>
                      </span>
                      <ChevronRight
                        className="app-chat-composer__command-chevron"
                        size={16}
                        strokeWidth={1.9}
                        aria-hidden="true"
                      />
                    </button>
                  ) : null}
                </div>
              ) : null}

              {commandPaletteVisible ? (
                <div
                  ref={commandPaletteRef}
                  className="app-chat-composer__command-palette"
                  role="dialog"
                  aria-label="Sage actions"
                >
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
                        <command.icon size={16} strokeWidth={1.9} aria-hidden="true" />
                        <span className="app-chat-composer__command-copy">
                          <span className="app-chat-composer__command-title-row">
                            <strong>{command.title}</strong>
                            <span className="app-chat-composer__command-description">{command.description}</span>
                          </span>
                        </span>
                        <span className="app-chat-composer__command-shortcut">{command.slash}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="app-chat-composer__model" ref={modelPanelRef}>
              <button
                type="button"
                className="app-chat-composer__provider-pill"
                disabled={controlsDisabled || busy}
                aria-expanded={modelPanelOpen}
                aria-label="Choose AI model"
                onClick={() => {
                  setActionPaletteOpen(false);
                  setCommandPaletteDismissed(true);
                  setModelPanelOpen((current) => !current);
                }}
              >
                <Brain size={15} strokeWidth={2} aria-hidden="true" />
                <span>{selectedModelLabel}</span>
              </button>
              {modelPanelOpen ? (
                <div
                  className={joinClassNames(
                    'app-chat-composer__model-popover',
                    isHostedCreditsModel && 'app-chat-composer__model-popover--hosted',
                  )}
                  role="dialog"
                  aria-label="Model settings"
                >
                  {!isHostedCreditsModel && reasoningOptions.length > 0 ? (
                    <div className="app-chat-composer__model-menu-section">
                      <span className="app-chat-composer__model-menu-title">Reasoning</span>
                      <div className="app-chat-composer__model-menu-list" role="listbox" aria-label="Reasoning">
                        {reasoningOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={joinClassNames(
                              'app-chat-composer__model-menu-row',
                              option.value === reasoningEffort && 'app-chat-composer__model-menu-row--selected',
                            )}
                            disabled={controlsDisabled || busy || option.disabled}
                            onClick={() => {
                              onReasoningEffortChange(option.value);
                              setModelPanelOpen(false);
                            }}
                            role="option"
                            aria-selected={option.value === reasoningEffort}
                          >
                            <span>{option.label}</span>
                            {option.value === reasoningEffort ? <Check size={16} strokeWidth={2} aria-hidden="true" /> : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="app-chat-composer__model-menu-section">
                    {!isHostedCreditsModel ? <span className="app-chat-composer__model-menu-title">Model</span> : null}
                    <div className="app-chat-composer__model-menu-list" role="listbox" aria-label="Model">
                      {modelMenuOptions.map((option) => {
                        const compactLabel = compactModelLabel(option.label, option.value);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={joinClassNames(
                              'app-chat-composer__model-menu-row',
                              option.value === model && 'app-chat-composer__model-menu-row--selected',
                            )}
                            disabled={controlsDisabled || busy || option.disabled}
                            onClick={() => {
                              onModelChange(option.value);
                              setModelPanelOpen(false);
                            }}
                            role="option"
                            aria-selected={option.value === model}
                          >
                            <span>
                              <strong>{compactLabel}</strong>
                              {option.detail ? <small>{option.detail}</small> : null}
                            </span>
                            {option.value === model ? <Check size={16} strokeWidth={2} aria-hidden="true" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {modelMenuProviderLabel ? (
                    <div className="app-chat-composer__model-menu-section">
                      <div className="app-chat-composer__model-menu-separator" aria-hidden="true" />
                      <button
                        type="button"
                        className="app-chat-composer__model-menu-row app-chat-composer__model-menu-row--provider"
                        disabled={controlsDisabled || busy || !canOpenProviderPicker}
                        onClick={() => {
                          setModelPanelOpen(false);
                          onOpenIntegrations?.();
                        }}
                      >
                        <span>
                          <strong>{modelMenuProviderLabel}</strong>
                        </span>
                        <ChevronRight size={16} strokeWidth={1.9} aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                  {!isHostedCreditsModel && reasoningOptions.length <= 0 ? (
                    <div className="app-chat-composer__model-readout">
                      <span>Reasoning</span>
                      <strong>{selectedReasoningLabel}</strong>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            className={joinClassNames(
              'app-chat-composer__voice',
              voiceState === 'recording' && 'app-chat-composer__voice--recording',
            )}
            disabled={busy || voiceState === 'transcribing'}
            aria-label={voiceState === 'recording' ? 'Stop voice recording' : 'Record voice'}
            onClick={handleVoiceButton}
          >
            {voiceState === 'recording' ? (
              <MicOff size={17} strokeWidth={2.1} aria-hidden="true" />
            ) : (
              <Mic size={17} strokeWidth={2.1} aria-hidden="true" />
            )}
          </button>

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

    </section>
  );
}
