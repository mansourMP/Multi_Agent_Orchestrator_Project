'use client';

import Link from 'next/link';

function formatTimestamp(value: string | null): string | null {
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

export function ChatMessage({
  message,
}: {
  message: WorkstationChatMessageRecord;
  resolvingApprovalId?: string | null;
  onResolveApproval?: (approvalId: string, resolution: 'approved' | 'rejected') => void;
}) {
  const isUser = message.role === 'user';
  const text = message.content.trim();
  const timestamp = formatTimestamp(message.createdAt);
  const displayKind = typeof message.metadata.display_kind === 'string' ? message.metadata.display_kind : '';
  const actionHref = typeof message.metadata.action_href === 'string' ? message.metadata.action_href : '';
  const actionLabel = typeof message.metadata.action_label === 'string' ? message.metadata.action_label : '';

  if (displayKind === 'provider_error') {
    return (
      <article
        data-chat-role="assistant"
        className="app-chat-transcript-error"
      >
        <span>{text}</span>
        {actionHref && actionLabel ? (
          <Link href={actionHref} className="app-chat-transcript-error__link">
            {actionLabel}
          </Link>
        ) : null}
      </article>
    );
  }

  return (
    <article
      data-chat-role={isUser ? 'user' : 'assistant'}
      className="app-chat-message"
    >
      <div className="app-chat-message__content">
        {text}
      </div>
      {timestamp ? (
        <div className="app-chat-message__meta">
          <time className="app-chat-message__timestamp" dateTime={message.createdAt ?? undefined}>
            {timestamp}
          </time>
        </div>
      ) : null}
    </article>
  );
}
