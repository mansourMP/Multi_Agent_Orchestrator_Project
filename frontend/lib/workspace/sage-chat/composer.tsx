'use client';

import React, { memo } from 'react';
import { ChatComposer } from '@/lib/workspace/chat-composer';
import type { ChatModelOption, ChatReasoningEffort } from './types';

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
  selectedExecutionPlacement: string;
  runTargetOptions: ComposerOption[];
  autonomyMode: string;
  autonomyOptions: ComposerOption[];
  onAutonomyModeChange: (mode: string) => void;
  composerTargetLabel: string;
  effectiveSelectedModel: string;
  composerModelOptions: ComposerModelOption[];
  handleModelChange: (model: string) => void;
  reasoningEffort: ChatReasoningEffort;
  reasoningOptions: ComposerOption[];
  onReasoningEffortChange: (effort: string) => void;
  selectedModelOption: ChatModelOption;
  contextWindowLabel: string | null;
  isSending: boolean;
  isPersistingModelSelection: boolean;
  activeProviderSummary: {
    connected: boolean;
    label: string;
  };
  runtimeStatus: {
    label: string;
    tone: 'neutral' | 'warning' | 'success';
  };
  composerToolGroups: Parameters<typeof ChatComposer>[0]['toolGroups'];
  smallModelWarningVisible: boolean;
  onDismissSmallModelWarning: () => void;
  preRunCostEstimate: Parameters<typeof ChatComposer>[0]['preRunCostEstimate'];
  localCompanionConnected: boolean;
}

export const SageComposer = memo(function SageComposer(props: SageComposerProps) {
  return (
    <ChatComposer
      draft={props.draft}
      onDraftChange={props.onDraftChange}
      onSubmit={props.onSendMessage}
      onStop={props.onStopStreaming}
      onOpenIntegrations={props.onOpenIntegrations}
      runTarget={props.selectedExecutionPlacement}
      runTargetOptions={props.runTargetOptions}
      onRunTargetChange={() => {}}
      autonomyMode={props.autonomyMode}
      autonomyOptions={props.autonomyOptions}
      onAutonomyModeChange={props.onAutonomyModeChange}
      targetLabel={props.composerTargetLabel}
      model={props.effectiveSelectedModel}
      modelOptions={props.composerModelOptions}
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
        actionLabel: 'Set up in Integrations',
      }}
      runtimeStatusLabel={props.runtimeStatus.label}
      runtimeStatusTone={props.runtimeStatus.tone}
      toolGroups={props.composerToolGroups}
      smallModelWarning={props.smallModelWarningVisible
        ? "You're using a small model. For best results with tools and complex tasks, we recommend switching to a larger model (7B+)."
        : null}
      preRunCostEstimate={props.preRunCostEstimate}
      onDismissSmallModelWarning={props.onDismissSmallModelWarning}
      showAutonomySelector={props.localCompanionConnected}
      autonomyFallbackLabel="Offline"
    />
  );
});
