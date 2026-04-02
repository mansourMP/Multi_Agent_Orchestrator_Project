'use client';

import type { ChatMessageRecord, ChatRunCardStatus } from '@/components/orion/chat/chatSchema';

const ACTIVE_RUN_CARD_STATUSES = new Set<ChatRunCardStatus>(['preparing', 'running']);
const TERMINAL_RUN_CARD_STATUSES = new Set<ChatRunCardStatus>(['completed', 'failed', 'needs_attention', 'waiting']);

export function resolveAssistantStreamState(message: ChatMessageRecord): {
  showLoading: boolean;
  terminal: boolean;
  activeStep: boolean;
} {
  const status = message.status || 'completed';
  const steps = Array.isArray(message.steps) ? message.steps : [];
  const activeStep = steps.some((step) => step.status === 'active');
  const runCardStatus = message.runCard?.status;
  const runCardActive = Boolean(runCardStatus && ACTIVE_RUN_CARD_STATUSES.has(runCardStatus));
  const runCardTerminal = Boolean(runCardStatus && TERMINAL_RUN_CARD_STATUSES.has(runCardStatus));
  const terminal = runCardTerminal || status === 'completed' || status === 'error' || status === 'waiting';
  const showLoading = !terminal && (status === 'sending' || status === 'running' || activeStep || runCardActive);
  return { showLoading, terminal, activeStep };
}
