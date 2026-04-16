'use client';

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

  return (
    <article
      data-chat-role={isUser ? 'user' : 'assistant'}
      className="app-chat-message"
    >
      <div className="app-chat-message__content">
        {text || (isUser ? '' : 'No response.')}
      </div>
    </article>
  );
}
