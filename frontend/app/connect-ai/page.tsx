import Link from 'next/link';
import { ArrowLeft, KeyRound } from 'lucide-react';
import AiAccountsPanel from '@/components/orion/connections/AiAccountsPanel';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { sanitizeReturnTo } from '@/lib/server/controlPlaneSession';

const WORKSPACE_ID = 'default';

type ConnectAiPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ConnectAiPage({ searchParams }: ConnectAiPageProps) {
  const params = await searchParams;
  const returnToValue = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const returnTo = sanitizeReturnTo(String(returnToValue || '/'));

  return (
    <div className="orion-page-shell narrow orion-animate-in">
      <OsPageHeader
        icon={<KeyRound size={18} />}
        title="Connect AI account"
        subtitle="Choose one provider, connect it, and return to chat. Keep app sign-in and provider access separate."
        actions={
          <Link href={returnTo} className="orion-btn orion-btn-ghost" style={{ minHeight: 34, paddingInline: 12 }}>
            <ArrowLeft size={13} />
            Back to chat
          </Link>
        }
      />

      <div style={{ width: '100%' }}>
        <AiAccountsPanel workspaceId={WORKSPACE_ID} mode="connect" returnTo={returnTo} />
      </div>
    </div>
  );
}
