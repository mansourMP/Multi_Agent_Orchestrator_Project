'use client';

import { AppButton } from '@/lib/ui/primitives';
import { ChatInlineStateCard } from '@/lib/workspace/chat-inline-state-card';

export type WorkstationChatArtifactReference = {
  id: string;
  label: string;
  kind?: string | null;
  mediaType?: string | null;
};

export type WorkstationChatMessageRecord = {
  id: string;
  role: string;
  content: string;
  status: string | null;
  createdAt: string | null;
  runId: string | null;
  approvals: Record<string, unknown>[];
  interventions: Record<string, unknown>[];
  artifacts: WorkstationChatArtifactReference[];
  metadata: Record<string, unknown>;
};

const SUPERVISOR_UNREACHABLE_MESSAGE =
  'Supervisor not running. Start empyralis-supervisor before using computer control.';
const SUPERVISOR_INTERRUPTED_MESSAGE = 'execution interrupted by operator';

function readExecutionTarget(item: Record<string, unknown>): string {
  const direct = item.execution_target_selected ?? item.execution_target;
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim().toLowerCase();
  }

  const metadata = item.metadata;
  if (metadata && typeof metadata === 'object') {
    return readExecutionTarget(metadata as Record<string, unknown>);
  }

  return '';
}

function readRuntimeTargetLabel(item: Record<string, unknown>): string {
  const target = readExecutionTarget(item);
  if (target === 'local_companion') {
    return 'Local companion';
  }
  if (target === 'cloud') {
    return 'Cloud runtime';
  }
  if (target === 'self_host_runtime') {
    return 'Self-host runtime';
  }
  return 'Execution attached';
}

function readRuntimeSelectionReason(item: Record<string, unknown>): string {
  const reason = item.selection_reason;
  return typeof reason === 'string' ? reason.trim() : '';
}

function readApprovalLabel(item: Record<string, unknown>, fallback: string): string {
  return String(item.prompt ?? item.title ?? item.id ?? item.approval_id ?? fallback);
}

function readApprovalStatus(item: Record<string, unknown>): string {
  return String(item.status ?? 'pending');
}

function readInterventionLabel(item: Record<string, unknown>, fallback: string): string {
  return String(item.title ?? item.kind ?? item.code ?? item.id ?? fallback);
}

function readInterventionMessage(item: Record<string, unknown>): string {
  const message = String(item.message ?? item.detail ?? item.reason ?? 'Operator action is required.');
  if (message === SUPERVISOR_UNREACHABLE_MESSAGE) {
    return 'Local companion is unavailable. Sage cannot start device work until empyralis-supervisor is running again.';
  }
  if (message === SUPERVISOR_INTERRUPTED_MESSAGE) {
    return 'Local companion execution was interrupted by the operator before Sage could finish the step.';
  }
  return message;
}

function formatMessageTime(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ChatMessage({
  message,
  resolvingApprovalId,
  onResolveApproval,
}: {
  message: WorkstationChatMessageRecord;
  resolvingApprovalId?: string | null;
  onResolveApproval?: (approvalId: string, resolution: 'approved' | 'rejected') => void;
}) {
  const isUser = message.role === 'user';
  const timeLabel = formatMessageTime(message.createdAt);
  const messageExecutionTarget = readExecutionTarget(message.metadata);
  const messageSelectionReason = readRuntimeSelectionReason(message.metadata);

  return (
    <article
      data-chat-role={message.role}
      className="app-chat-message"
    >
      <div className="app-chat-message__bubble">
        <div className="app-chat-message__meta">
          <div className="app-chat-message__meta-left">
            <span className="app-chat-message__actor">{isUser ? 'You' : 'Sage'}</span>
            {message.status ? (
              <span className="app-chat-message__status">{message.status}</span>
            ) : null}
          </div>
          {timeLabel ? (
            <span className="app-chat-message__time">{timeLabel}</span>
          ) : null}
        </div>

        <div className="app-chat-message__content">
          {message.content || (isUser ? ' ' : 'No textual response.')}
        </div>

        <div className="app-chat-message__attachments">
          {message.runId ? (
            <ChatInlineStateCard
              tone="accent"
              eyebrow="Run"
              title={message.runId}
              meta={
                messageExecutionTarget === 'local_companion'
                  ? 'Local companion · approval-gated device work'
                  : messageExecutionTarget === 'cloud'
                    ? 'Cloud runtime'
                    : readRuntimeTargetLabel(message.metadata)
              }
            >
              {messageExecutionTarget === 'local_companion'
                ? (messageSelectionReason || 'Sage routed this run to the paired local companion. Sensitive device actions remain explicitly approval-gated.')
                : messageExecutionTarget === 'cloud'
                  ? (messageSelectionReason || 'Sage kept this run in the hosted runtime. The result stays attached to the thread for follow-up turns.')
                  : 'Sage started execution from this message. The run stays attached to the conversation and can be reviewed in the run timeline if needed.'}
            </ChatInlineStateCard>
          ) : null}

          {message.approvals.map((item, index) => {
            const approvalId = String(item.approval_id ?? item.id ?? '').trim();
            const isResolving = Boolean(approvalId) && resolvingApprovalId === approvalId;
            const approvalExecutionTarget = readExecutionTarget(item) || messageExecutionTarget;
            const approvalBody = approvalExecutionTarget === 'local_companion'
              ? 'Sage is paused before using the local companion. This approval explicitly gates device access for this step.'
              : 'Sage is paused on this step and is waiting for an explicit operator decision before continuing the thread.';
            return (
              <ChatInlineStateCard
                key={approvalId || `${message.id}:approval:${index}`}
                tone="warning"
                eyebrow="Approval"
                title={readApprovalLabel(item, `Approval ${index + 1}`)}
                meta={[
                  readApprovalStatus(item),
                  approvalExecutionTarget ? readRuntimeTargetLabel({ execution_target_selected: approvalExecutionTarget }) : null,
                ].filter(Boolean).join(' · ')}
                actions={
                  onResolveApproval && approvalId ? (
                    <div className="app-inline-actions app-inline-actions--tight">
                      <AppButton
                        type="button"
                        tone="secondary"
                        disabled={isResolving}
                        onClick={() => onResolveApproval(approvalId, 'approved')}
                      >
                        Approve
                      </AppButton>
                      <AppButton
                        type="button"
                        tone="danger"
                        disabled={isResolving}
                        onClick={() => onResolveApproval(approvalId, 'rejected')}
                      >
                        Reject
                      </AppButton>
                    </div>
                  ) : null
                }
            >
              {approvalBody}
            </ChatInlineStateCard>
          );
        })}

          {message.interventions.map((item, index) => (
            <ChatInlineStateCard
              key={String(item.id ?? item.code ?? `${message.id}:intervention:${index}`)}
              tone="danger"
              eyebrow="Intervention"
              title={readInterventionLabel(item, `Intervention ${index + 1}`)}
            >
              {readInterventionMessage(item)}
            </ChatInlineStateCard>
          ))}

          {message.artifacts.map((artifact) => (
            <ChatInlineStateCard
              key={artifact.id}
              tone="neutral"
              eyebrow="Artifact"
              title={artifact.label}
              meta={[
                artifact.kind || null,
                artifact.mediaType || null,
              ].filter(Boolean).join(' · ')}
            >
              Sage attached generated output to this turn. It remains part of the conversation state for future turns.
            </ChatInlineStateCard>
          ))}
        </div>
      </div>
    </article>
  );
}
