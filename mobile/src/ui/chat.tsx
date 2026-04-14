import React from 'react';

import { View } from 'react-native';

import {
  AppBadge,
  AppButton,
  AppCaption,
  AppCard,
  AppInput,
  AppText,
  AppTitle,
} from './primitives';

function toneForStatus(status: string | null | undefined) {
  if (!status) {
    return 'default';
  }
  if (status === 'approved' || status === 'completed') {
    return 'success';
  }
  if (status === 'pending' || status === 'queued' || status === 'running') {
    return 'accent';
  }
  return 'warning';
}

function approvalTitle(approval: Record<string, unknown>) {
  return String(
    approval.title
    ?? approval.summary
    ?? approval.action
    ?? approval.kind
    ?? approval.id
    ?? 'Approval',
  );
}

function approvalStatus(approval: Record<string, unknown>, overrides: Record<string, string>) {
  const id = typeof approval.id === 'string' ? approval.id : null;
  return id && overrides[id]
    ? overrides[id]
    : String(approval.status ?? approval.decision ?? 'pending');
}

export function MobileChatComposer({
  value,
  onChangeText,
  onSubmit,
  disabled = false,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  return (
    <AppCard>
      <AppTitle>Compose</AppTitle>
      <AppInput
        value={value}
        onChangeText={onChangeText}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
        placeholder="Ask the workspace to continue, review, or produce the next output."
        style={{
          minHeight: 120,
        }}
      />
      <AppButton
        label={disabled ? 'Submitting…' : 'Send'}
        disabled={disabled || value.trim().length === 0}
        onPress={onSubmit}
      />
    </AppCard>
  );
}

export function MobileChatThread({
  messages,
  approvalDecisions = {},
  onApprovalDecision,
}: {
  messages: Array<Record<string, unknown>>;
  approvalDecisions?: Record<string, string>;
  onApprovalDecision?: (approvalId: string, decision: 'approved' | 'rejected') => void;
}) {
  return (
    <View style={{ gap: 12 }}>
      {messages.map((message) => {
        const role = String(message.role ?? 'assistant');
        const isUser = role === 'user';
        const approvals = Array.isArray(message.approvals) ? message.approvals : [];
        const status = typeof message.status === 'string' ? message.status : null;
        const runId = typeof message.runId === 'string' ? message.runId : null;
        const createdAt = typeof message.createdAt === 'string' ? message.createdAt : null;

        return (
          <AppCard key={String(message.id ?? `${role}:${message.content ?? ''}`)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <AppBadge tone={isUser ? 'accent' : toneForStatus(status)}>
                {isUser ? 'You' : 'Assistant'}
              </AppBadge>
              {status ? <AppCaption>{status}</AppCaption> : null}
            </View>
            <AppText>{String(message.content ?? '')}</AppText>
            {createdAt ? <AppCaption>{new Date(createdAt).toLocaleTimeString()}</AppCaption> : null}
            {runId ? (
              <AppCard>
                <AppBadge tone={toneForStatus(status)}>Run</AppBadge>
                <AppTitle>{runId}</AppTitle>
                <AppText muted>
                  {status === 'completed'
                    ? 'The run completed in this thread.'
                    : 'Execution is still moving through the workspace pipeline.'}
                </AppText>
              </AppCard>
            ) : null}
            {approvals.map((approval) => {
              if (!approval || typeof approval !== 'object') {
                return null;
              }

              const approvalId = typeof approval.id === 'string' ? approval.id : approvalTitle(approval);
              const statusLabel = approvalStatus(approval, approvalDecisions);
              const resolved = statusLabel === 'approved' || statusLabel === 'rejected';

              return (
                <AppCard key={approvalId}>
                  <AppBadge tone={toneForStatus(statusLabel)}>{statusLabel}</AppBadge>
                  <AppTitle>{approvalTitle(approval)}</AppTitle>
                  <AppText muted>
                    {String(approval.reason ?? approval.request ?? approval.scope ?? 'This run is blocked on a human decision.')}
                  </AppText>
                  {!resolved && onApprovalDecision ? (
                    <View style={{ gap: 10 }}>
                      <AppButton
                        label="Approve"
                        onPress={() => onApprovalDecision(approvalId, 'approved')}
                      />
                      <AppButton
                        label="Reject"
                        tone="secondary"
                        onPress={() => onApprovalDecision(approvalId, 'rejected')}
                      />
                    </View>
                  ) : null}
                </AppCard>
              );
            })}
          </AppCard>
        );
      })}
    </View>
  );
}
