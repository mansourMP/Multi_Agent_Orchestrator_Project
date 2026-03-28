import Link from 'next/link';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import AiAccountsPanel from '@/components/orion/connections/AiAccountsPanel';

const WORKSPACE_ID = 'default';

type ConnectAiPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ConnectAiPage({ searchParams }: ConnectAiPageProps) {
  const params = await searchParams;
  const returnToValue = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const returnTo = String(returnToValue || '/');

  return (
    <div className="orion-page-shell narrow orion-animate-in">
      <OsPageHeader
        icon={<KeyRound size={18} />}
        title="Connect AI account"
        subtitle="Connect one direct provider for chat, agents, and workflows."
        meta={
          <>
            <span>Direct providers only</span>
            <span>separate from app sign-in</span>
          </>
        }
        actions={
          <Link href={returnTo} className="orion-btn orion-btn-ghost" style={{ minHeight: 34, paddingInline: 12 }}>
            <ArrowLeft size={13} />
            Back to chat
          </Link>
        }
      />

      <section className="orion-panel">
        <div className="orion-panel-header">
          <div>
            <div className="orion-panel-title">Provider connection</div>
            <div className="orion-panel-copy">
              Connect OpenAI, Anthropic, Gemini, or Vertex directly. You can also reuse the OpenAI / Codex session already signed into this Mac.
            </div>
          </div>
        </div>
        <AiAccountsPanel workspaceId={WORKSPACE_ID} mode="connect" returnTo={returnTo} />
      </section>
    </div>
  );
}
