'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/Skeleton';
import { ChannelHeader } from '@/components/orion/agents/ChannelHeader';
import { CustomerModeSimulator } from '@/components/orion/agents/CustomerModeSimulator';
import { OwnerPanel } from '@/components/orion/agents/OwnerPanel';
import { MobileThreadHeader } from '@/components/orion/agents/MobileThreadHeader';
import { useAgentsWorkspace } from '@/components/orion/agents/AgentsWorkspaceContext';
import { fetchAgentInstall, type WorkspaceAgentInstallRecord } from '@/lib/api';
import { usePlatformShell } from '@/components/orion/PlatformShellContext';
import type { AgentMode } from '@/components/orion/agents/AgentModeToggle';
import { useIsMobile } from '@/hooks/use-mobile';

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-36 rounded-[32px] bg-white/8" />
      <Skeleton className="h-[640px] rounded-[32px] bg-white/8" />
    </div>
  );
}

export function AgentDetailView({ installId }: { installId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const modeQuery = String(searchParams.get('mode') || '').trim().toLowerCase();
  const { channels, loading, draftAgents } = useAgentsWorkspace();
  const { activeWorkspaceId, workspaceLoading } = usePlatformShell();
  const [mode, setMode] = useState<AgentMode>(modeQuery === 'owner' ? 'owner' : 'customer');
  const [resolvedInstall, setResolvedInstall] = useState<WorkspaceAgentInstallRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const installedMatch = useMemo(
    () => channels.find((channel) => channel.id === installId)?.install || null,
    [channels, installId],
  );
  const previewMatch = useMemo(
    () => draftAgents.find((install) => install.id === installId) || null,
    [draftAgents, installId],
  );

  useEffect(() => {
    if (modeQuery === 'owner' || modeQuery === 'customer') {
      setMode(modeQuery);
    }
  }, [modeQuery]);

  useEffect(() => {
    let alive = true;

    if (previewMatch) {
      setResolvedInstall(previewMatch);
      return () => {
        alive = false;
      };
    }

    if (installedMatch) {
      setResolvedInstall(installedMatch);
      return () => {
        alive = false;
      };
    }

    if (workspaceLoading || !activeWorkspaceId || !installId) {
      return () => {
        alive = false;
      };
    }

    setDetailLoading(true);
    void fetchAgentInstall(installId, activeWorkspaceId)
      .then((install) => {
        if (!alive) return;
        setResolvedInstall(install);
      })
      .catch(() => {
        if (!alive) return;
        setResolvedInstall(null);
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [activeWorkspaceId, installId, installedMatch, previewMatch, workspaceLoading]);

  useEffect(() => {
    let alive = true;
    if (mode !== 'customer' || !activeWorkspaceId || !installId) {
      return () => {
        alive = false;
      };
    }
    void fetchAgentInstall(installId, activeWorkspaceId)
      .then((install) => {
        if (alive) setResolvedInstall(install);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [activeWorkspaceId, installId, mode]);

  if (loading || detailLoading) {
    return <DetailSkeleton />;
  }

  if (!resolvedInstall) {
    return (
      <div className="rounded-[32px] border border-white/8 bg-zinc-950/95 px-8 py-10 text-zinc-50 shadow-[0_32px_84px_rgba(0,0,0,0.42)]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
          Agent Channel
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Channel unavailable</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          This agent channel is not installed in the active workspace. The rail remains stable, but the detail view cannot resolve the requested specialist yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isMobile ? (
        <MobileThreadHeader
          install={resolvedInstall}
          mode={mode}
          onModeChange={setMode}
          onUpload={() => {
            if (mode !== 'owner') {
              setMode('owner');
              router.replace(`/agents/${encodeURIComponent(installId)}?mode=owner`);
            }
          }}
        />
      ) : (
        <ChannelHeader install={resolvedInstall} mode={mode} onModeChange={setMode} />
      )}
      {mode === 'customer'
        ? <CustomerModeSimulator install={resolvedInstall} onRequestOwnerMode={() => setMode('owner')} isMobile={isMobile} />
        : <OwnerPanel install={resolvedInstall} isMobile={isMobile} />}
    </div>
  );
}
