'use client';

import Link from 'next/link';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import AiAccountsPanel from '@/components/orion/connections/AiAccountsPanel';

const WORKSPACE_ID = 'default';

export default function ConnectAiPage() {
  return (
    <div className="orion-page-shell narrow orion-animate-in">
      <OsPageHeader
        icon={<KeyRound size={18} />}
        title="Connect AI account"
        subtitle="Add a direct provider account for chat, agents, and workflows."
        meta={
          <>
            <span>Direct providers only</span>
            <span>default workspace</span>
          </>
        }
        actions={
          <Link href="/" className="orion-btn orion-btn-ghost" style={{ minHeight: 34, paddingInline: 12 }}>
            <ArrowLeft size={13} />
            Back to chat
          </Link>
        }
      />

      <section className="orion-panel">
        <div className="orion-panel-header">
          <div>
            <div className="orion-panel-title">AI account</div>
            <div className="orion-panel-copy">
              Connect OpenAI, Anthropic, Gemini, or Vertex directly. This is separate from signing in to Empyralis.
            </div>
          </div>
        </div>
        <AiAccountsPanel workspaceId={WORKSPACE_ID} />
      </section>
    </div>
  );
}
