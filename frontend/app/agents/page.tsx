'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Play, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PageHero } from '@/components/orion/page/PageHero';
import { PageHeroCard } from '@/components/orion/page/PageHeroCard';
import { PageSection } from '@/components/orion/page/PageSection';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';
import { usePlatformShell } from '@/components/orion/PlatformShellContext';
import { InstalledAgentCard } from '@/components/orion/agents/InstalledAgentCard';
import { Button } from '@/components/ui/button';
import { fetchAgents, runInstalledAgent, type WorkspaceAgentInstallRecord } from '@/lib/api';

export default function AgentsPage() {
  const router = useRouter();
  const { activeWorkspaceId, workspaceLoading } = usePlatformShell();
  const [items, setItems] = useState<WorkspaceAgentInstallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [runningId, setRunningId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (workspaceLoading) return () => {
      alive = false;
    };
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const nextItems = await fetchAgents(activeWorkspaceId);
        if (!alive) return;
        setItems(nextItems);
      } catch (nextError) {
        if (!alive) return;
        setItems([]);
        setError(nextError instanceof Error ? nextError.message : 'Failed to load installed agents.');
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [activeWorkspaceId, workspaceLoading]);

  const stats = useMemo(() => {
    const enabled = items.filter((item) => item.enabled).length;
    const local = items.filter((item) => item.runtime_profile?.runtime_class === 'desktop_companion').length;
    return { total: items.length, enabled, local };
  }, [items]);

  const runInstall = async (install: WorkspaceAgentInstallRecord) => {
    try {
      setRunningId(install.id);
      const payload = await runInstalledAgent(install.id, {
        message: `Run ${install.label || install.agent_definition?.name || 'installed agent'}`,
      });
      const runId = String((payload as { run_id?: unknown })?.run_id || '').trim();
      if (runId) {
        router.push(`/runs/${encodeURIComponent(runId)}/inspect`);
        return;
      }
      router.push('/');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to start agent run.');
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="orion-page-shell orion-animate-in">
      <PageHero
        kicker="Installed Agents"
        title="Installed agents"
        copy="Specialists that are already configured in this workspace and ready to run."
        actions={
          <Link href="/store" style={{ textDecoration: 'none' }}>
            <Button variant="secondary">
              <Sparkles size={14} />
              Open store
            </Button>
          </Link>
        }
        aside={
          <>
            <PageHeroCard label="Installed">
              <div className="orion-home-side-value">{stats.total}</div>
              <div className="orion-home-side-note">Specialists configured in this workspace</div>
            </PageHeroCard>
            <PageHeroCard label="Placements">
              <div className="orion-home-side-value">{stats.local}</div>
              <div className="orion-home-side-note">Pinned to local companion placement</div>
            </PageHeroCard>
          </>
        }
      />

      <PageSection
        title="Active installs"
        description="Run an installed specialist or adjust its configuration."
      >
        {loading || workspaceLoading ? (
          <PageStatePanel variant="loading" title="Loading installed agents" copy="Reading workspace installs and current placements." />
        ) : error ? (
          <PageStatePanel variant="error" title="Installed agents are unavailable" copy={error} />
        ) : items.length === 0 ? (
          <PageStatePanel
            variant="empty"
            title="No installed agents yet"
            copy="Open the store, install a specialist, and configure where it should run."
            actions={
              <Link href="/store" style={{ textDecoration: 'none' }}>
                <Button>
                  <Play size={14} />
                  Open store
                </Button>
              </Link>
            }
          />
        ) : (
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            {items.map((install) => (
              <InstalledAgentCard
                key={install.id}
                install={install}
                configureHref={`/agents/${encodeURIComponent(String(install.agent_definition_id || ''))}/configure?install=${encodeURIComponent(install.id)}`}
                onRun={() => void runInstall(install)}
                running={runningId === install.id}
              />
            ))}
          </div>
        )}
      </PageSection>
    </div>
  );
}
