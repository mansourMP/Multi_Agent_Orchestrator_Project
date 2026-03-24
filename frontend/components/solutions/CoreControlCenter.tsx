'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bell, Boxes, LayoutDashboard, Workflow } from 'lucide-react';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import {
  type AutomationRecord,
  type InstalledSolution,
  type RecentRunItem,
  fetchAutomations,
  fetchRecentRuns,
  fetchSkillsState,
  fetchSolutionsState,
  formatRelativeTime,
} from '@/lib/solutions';

type SkillCard = {
  id: string;
  name: string;
  enabled: boolean;
};

export function CoreControlCenter() {
  const [solutions, setSolutions] = useState<InstalledSolution[]>([]);
  const [skills, setSkills] = useState<SkillCard[]>([]);
  const [workflows, setWorkflows] = useState<AutomationRecord[]>([]);
  const [recentRuns, setRecentRuns] = useState<RecentRunItem[]>([]);
  const [mcpEndpoint, setMcpEndpoint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const humanizeAgentName = (value: string | null | undefined): string => {
    const token = String(value || '').trim().toLowerCase();
    if (!token || token === 'orchestrator') return 'Assistant';
    return token
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const summarizeRun = (run: RecentRunItem): string => {
    const summary = String(run.result_summary || '').trim();
    if (summary) return summary;
    const goal = String(run.user_goal || '').trim();
    if (goal) return goal;
    return 'No summary available yet.';
  };

  const statusTone = (status: string | null | undefined): 'green' | 'yellow' | 'red' | 'grey' => {
    const token = String(status || '').trim().toLowerCase();
    if (token === 'completed' || token === 'success') return 'green';
    if (token === 'running' || token === 'queued' || token === 'claimed' || token === 'waiting_for_input') return 'yellow';
    if (token === 'failed' || token === 'error' || token === 'cancelled' || token === 'aborted') return 'red';
    return 'grey';
  };

  const statusLabel = (status: string | null | undefined): string => {
    const token = String(status || '').trim().toLowerCase();
    if (!token) return 'Unknown';
    return token
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const workflowTone = (status: string | null | undefined): 'green' | 'yellow' | 'red' | 'grey' => {
    const token = String(status || '').trim().toLowerCase();
    if (token === 'published' || token === 'active') return 'green';
    if (token === 'paused' || token === 'draft') return 'yellow';
    if (token === 'error' || token === 'failed') return 'red';
    return 'grey';
  };

  const workflowLabel = (status: string | null | undefined): string => {
    const token = String(status || '').trim().toLowerCase();
    if (token === 'published') return 'Active';
    if (token === 'draft') return 'Ready';
    if (token === 'paused') return 'Paused';
    if (token === 'error') return 'Error';
    return statusLabel(status);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [solutionsState, skillsState, automationItems, runItems] = await Promise.all([
          fetchSolutionsState(),
          fetchSkillsState(),
          fetchAutomations(),
          fetchRecentRuns(5),
        ]);
        if (cancelled) return;
        setSolutions(Array.isArray(solutionsState.active) ? solutionsState.active : []);
        setMcpEndpoint(typeof solutionsState.mcp_endpoint === 'string' && solutionsState.mcp_endpoint.trim() ? solutionsState.mcp_endpoint.trim() : null);
        setSkills(Array.isArray(skillsState.installed) ? skillsState.installed.filter((item) => item.enabled) : []);
        setWorkflows(Array.isArray(automationItems) ? automationItems : []);
        setRecentRuns(Array.isArray(runItems) ? runItems.slice(0, 5) : []);
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load control center.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    const spaceCount = solutions.reduce((count, item) => count + Number(item.status?.spaces_monitored || 0), 0);
    const alertCount = solutions.reduce((count, item) => count + Number(item.status?.unresolved_alerts || 0), 0);
    const lastScanValues = solutions
      .map((item) => String(item.status?.last_scan_at || '').trim())
      .filter(Boolean)
      .sort()
      .reverse();
    return {
      spaces: spaceCount,
      alerts: alertCount,
      skills: skills.length,
      workflows: workflows.length,
      activeWorkflows: workflows.filter((item) => String(item.status || '').trim().toLowerCase() === 'published').length,
      recentRuns: recentRuns.length,
      lastScan: lastScanValues[0] || null,
    };
  }, [recentRuns.length, skills.length, solutions, workflows]);

  const recentAlerts = useMemo(() => {
    return solutions
      .flatMap((solution) => {
        const items = Array.isArray(solution.status?.recent_alerts) ? solution.status?.recent_alerts : [];
        return items.map((alert) => ({
          ...alert,
          title: String(alert.title || '').trim() || solution.name,
          solutionName: solution.name,
        }));
      })
      .sort((left, right) => Date.parse(String(right.ts || '')) - Date.parse(String(left.ts || '')))
      .slice(0, 6);
  }, [solutions]);

  return (
    <div className="orion-page-shell narrow orion-animate-in">
      <OsPageHeader
        icon={<LayoutDashboard size={18} />}
        title="Dashboard"
        subtitle="See what is active, what changed, and where to continue."
        meta={
          <>
            <span>{workflows.length} workflow{workflows.length === 1 ? '' : 's'}</span>
            <span>{summary.activeWorkflows} active</span>
            {mcpEndpoint ? <span className="orion-chip" data-status-tone="green">Connected</span> : null}
          </>
        }
        actions={
          <>
            <Link href="/workflows" className="btn-secondary">
              Workflows
            </Link>
            <Link href="/workspace" className="btn-primary">
              Open Assistant
            </Link>
          </>
        }
      />

      <MetricStrip
        items={[
          { label: 'Workflows', value: String(workflows.length) },
          { label: 'Active', value: String(summary.activeWorkflows) },
          { label: 'Recent runs', value: String(summary.recentRuns) },
          { label: 'Needs attention', value: String(summary.alerts) },
        ]}
      />

      {loading ? (
        <section className="orion-panel muted">
          <div className="orion-stagger-grid" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="orion-panel orion-skeleton-card">
                <SkeletonBlock className="orion-skeleton-image" />
                <SkeletonBlock className="orion-skeleton-line medium" />
                <SkeletonBlock className="orion-skeleton-line" />
                <SkeletonBlock className="orion-skeleton-line short" />
              </div>
            ))}
          </div>
        </section>
      ) : error ? (
        <section className="orion-panel muted" style={{ minHeight: 220, display: 'grid', gap: 8, placeItems: 'center' }}>
          <div className="orion-panel-title">Dashboard is unavailable</div>
          <div className="orion-panel-copy">{error}</div>
        </section>
      ) : (
        <>
          <section className="orion-panel">
            <div className="orion-panel-header">
              <div>
                <div className="orion-panel-title">Recent runs</div>
                <div className="orion-panel-copy">Latest runs and outcomes. Use Runs for the full history.</div>
              </div>
              <Link href="/executions" className="btn-secondary">
                Open Runs
              </Link>
            </div>
            {recentRuns.length === 0 ? (
              <div className="orion-empty">
                <div className="orion-empty-title">No recent runs</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {recentRuns.slice(0, 3).map((run) => (
                  <div key={run.run_id} className="orion-list-row">
                    <div className="orion-list-row-main">
                      <div className="orion-list-row-title">{humanizeAgentName(run.agent_role)}</div>
                      <div className="orion-list-row-subtitle">{summarizeRun(run)}</div>
                    </div>
                    <div style={{ display: 'grid', justifyItems: 'end', gap: 6 }}>
                      <span className="orion-chip" data-status-tone={statusTone(run.status)}>
                        {statusLabel(run.status)}
                      </span>
                      <span className="orion-panel-copy" style={{ margin: 0 }}>
                        {formatRelativeTime(run.updated_at || run.created_at || null)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="orion-panel">
            <div className="orion-panel-header">
              <div>
                <div className="orion-panel-title">Workflows</div>
                <div className="orion-panel-copy">
                  Systems currently available in this workspace.
                </div>
              </div>
              <Link href="/workflows" className="btn-secondary">
                Open Workflows
              </Link>
            </div>
            {workflows.length === 0 ? (
              <div className="orion-empty">
                <div className="orion-empty-title">No workflows yet</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {workflows.slice(0, 4).map((workflow) => (
                  <Link
                    key={workflow.id}
                    href={`/workflows/${encodeURIComponent(workflow.id)}`}
                    className="orion-list-row"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div className="orion-list-row-main">
                      <div className="orion-list-row-title" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                        <Workflow size={14} />
                        {String(workflow.name || workflow.id || 'Automation')}
                      </div>
                      <div className="orion-list-row-subtitle">
                        {String(workflow.description || 'Open to view details.')}
                      </div>
                    </div>
                    <div style={{ display: 'grid', justifyItems: 'end', gap: 6 }}>
                      <span className="orion-chip" data-status-tone={workflowTone(workflow.status)}>
                        {workflowLabel(workflow.status)}
                      </span>
                      <span className="orion-panel-copy" style={{ margin: 0 }}>
                        {formatRelativeTime(workflow.updatedAt || workflow.lastRun || null)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {solutions.length > 0 ? (
            <section className="orion-panel">
              <div className="orion-panel-header">
                <div>
                  <div className="orion-panel-title">Packages</div>
                  <div className="orion-panel-copy">
                    Optional packaged capability layers built on top of the core platform.
                  </div>
                </div>
                <Link href="/solutions" className="btn-secondary">
                  View Packages
                </Link>
              </div>
              <div className="orion-stagger-grid" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                {solutions.slice(0, 2).map((solution) => (
                  <Link
                    key={solution.id}
                    href={solution.primary_route || solution.route_base || '/solutions'}
                    className="orion-panel orion-surface-lift"
                    style={{ display: 'grid', gap: 10, textDecoration: 'none', color: 'inherit' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div className="orion-panel-title" style={{ margin: 0 }}>{solution.name}</div>
                        <div className="orion-panel-copy" style={{ margin: 0 }}>{solution.description || 'Optional packaged capability layer'}</div>
                      </div>
                      <span className="orion-chip" data-status-tone={solution.enabled ? 'green' : 'grey'}>
                        {solution.enabled ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <span className="orion-chip"><Boxes size={12} /> {solution.status?.spaces_monitored || 0} monitors</span>
                      <span className="orion-chip" data-status-tone={Number(solution.status?.unresolved_alerts || 0) > 0 ? 'red' : 'grey'}>
                        <Bell size={12} /> {solution.status?.unresolved_alerts || 0} alerts
                      </span>
                    </div>
                    <div className="orion-panel-copy" style={{ margin: 0 }}>
                      {solution.status?.summary || 'No live summary available.'}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {recentAlerts.length > 0 ? (
            <section className="orion-panel">
              <div className="orion-panel-header">
                <div>
                  <div className="orion-panel-title">Needs attention</div>
                  <div className="orion-panel-copy">Items that may need a quick decision.</div>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {recentAlerts.slice(0, 3).map((alert) => (
                  <div key={alert.id} className="orion-list-row">
                    <div className="orion-list-row-main">
                      <div className="orion-list-row-title">{alert.title}</div>
                      <div className="orion-list-row-subtitle">{alert.message}</div>
                    </div>
                    <span className="orion-chip" data-status-tone="red" title={alert.ts}>{formatRelativeTime(alert.ts)}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
