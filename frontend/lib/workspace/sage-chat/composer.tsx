'use client';

import React, { memo } from 'react';
import { ChatComposer } from '@/lib/workspace/chat-composer';
import type { ChatReasoningEffort } from './types';

type ComposerOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type ComposerModelOption = ComposerOption | {
  label: string;
  options: ComposerOption[];
};

export interface SageComposerProps {
  draft: string;
  onDraftChange: (draft: string) => void;
  onSendMessage: () => void;
  onStopStreaming: () => void;
  onOpenIntegrations: () => void;
  effectiveSelectedModel: string;
  composerModelOptions: ComposerModelOption[];
  modelProviderLabel?: string | null;
  handleModelChange: (model: string) => void;
  reasoningEffort: ChatReasoningEffort;
  reasoningOptions: ComposerOption[];
  onReasoningEffortChange: (effort: string) => void;
  contextWindowLabel: string | null;
  isSending: boolean;
  isPersistingModelSelection: boolean;
  activeProviderSummary: {
    connected: boolean;
    label: string;
  };
  smallModelWarningVisible: boolean;
  onDismissSmallModelWarning: () => void;
  preRunCostEstimate: Parameters<typeof ChatComposer>[0]['preRunCostEstimate'];
}

export const SageComposer = memo(function SageComposer(props: SageComposerProps) {
  return (
    <ChatComposer
      draft={props.draft}
      onDraftChange={props.onDraftChange}
      onSubmit={props.onSendMessage}
      onStop={props.onStopStreaming}
      onOpenIntegrations={props.onOpenIntegrations}
      model={props.effectiveSelectedModel}
      modelOptions={props.composerModelOptions}
      modelProviderLabel={props.modelProviderLabel ?? null}
      onModelChange={props.handleModelChange}
      reasoningEffort={props.reasoningEffort}
      reasoningOptions={props.reasoningOptions}
      onReasoningEffortChange={props.onReasoningEffortChange}
      contextWindowLabel={props.contextWindowLabel}
      busy={props.isSending}
      controlsDisabled={props.isPersistingModelSelection}
      sendDisabled={false}
      placeholder="Message Sage..."
      providerGateVisible={!props.activeProviderSummary.connected}
      providerSummary={{
        label: props.activeProviderSummary.label,
        actionLabel: 'Set up in Connections',
      }}
      smallModelWarning={props.smallModelWarningVisible
        ? "You're using a small model. For best results with tools and complex tasks, we recommend switching to a larger model (7B+)."
        : null}
      preRunCostEstimate={props.preRunCostEstimate}
      onDismissSmallModelWarning={props.onDismissSmallModelWarning}
    />
  );
});
