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
  return String(item.message ?? item.detail ?? item.reason ?? 'Operator action is required.');
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

  return (
    <article
      data-chat-role={message.role}
      className="app-chat-message"
    >
      <div className="app-chat-message__bubble">
        <div className="app-chat-message__meta">
          <div className="app-chat-message__meta-left">
            <span className="app-chat-message__actor">{isUser ? 'You' : 'Workspace'}</span>
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
              meta="Execution is attached to this turn."
            >
              Track this run in the inspector or the runs surface for detailed state.
            </ChatInlineStateCard>
          ) : null}

          {message.approvals.map((item, index) => {
            const approvalId = String(item.approval_id ?? item.id ?? '').trim();
            const isResolving = Boolean(approvalId) && resolvingApprovalId === approvalId;
            return (
              <ChatInlineStateCard
                key={approvalId || `${message.id}:approval:${index}`}
                tone="warning"
                eyebrow="Approval"
                title={readApprovalLabel(item, `Approval ${index + 1}`)}
                meta={readApprovalStatus(item)}
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
                This run is waiting for operator input before it can continue.
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
              Generated output is attached to this turn and available in the inspector or artifacts surface.
            </ChatInlineStateCard>
          ))}
        </div>
      </div>
    </article>
  );
}
