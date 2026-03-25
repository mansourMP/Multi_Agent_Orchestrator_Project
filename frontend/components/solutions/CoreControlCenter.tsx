'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bell, Boxes, LayoutDashboard, RefreshCw, Workflow } from 'lucide-react';
import { PageHero } from '@/components/orion/page/PageHero';
import { PageHeroCard } from '@/components/orion/page/PageHeroCard';
import { PageSection } from '@/components/orion/page/PageSection';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';
import { MetricStrip } from '@/components/ui/MetricStrip';
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
    <div className="orion-page-shell orion-animate-in">
      <PageHero
        kicker="Dashboard"
        title="See what is active, what changed, and where to continue."
        copy="Start from recent runs, jump back into a workflow, or open the assistant when you need to move work forward."
        actions={
          <div className="orion-page-actions">
            <Link href="/workflows" className="btn-secondary">
              Workflows
            </Link>
            <Link href="/workspace" className="btn-primary">
              Open Assistant
            </Link>
          </div>
        }
        aside={
          <>
            <PageHeroCard label="Workspace status">
              <div className="orion-home-side-stats">
                <div>
                  <div className="orion-home-side-value">{workflows.length}</div>
                  <div className="orion-home-side-note">Workflows</div>
                </div>
                <div>
                  <div className="orion-home-side-value">{summary.activeWorkflows}</div>
                  <div className="orion-home-side-note">Active</div>
                </div>
              </div>
              <div className="orion-runs-overview-side-note">
                {mcpEndpoint ? 'Connected to the local control plane.' : 'Control plane connection is still settling.'}
              </div>
            </PageHeroCard>
            <PageHeroCard label="Assistant access">
              <div className="orion-home-side-stats">
                <div>
                  <div className="orion-home-side-value">{summary.recentRuns}</div>
                  <div className="orion-home-side-note">Recent runs</div>
                </div>
                <div>
                  <div className="orion-home-side-value">{summary.alerts}</div>
                  <div className="orion-home-side-note">Needs attention</div>
                </div>
              </div>
            </PageHeroCard>
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
        <PageSection muted>
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
        </PageSection>
      ) : error ? (
        <PageStatePanel
          variant="error"
          icon={<AlertCircle size={18} />}
          title="Dashboard is unavailable"
          copy={
            <>
              <span>The workspace summary could not be loaded right now. You can retry, or continue in the assistant while the runtime settles.</span>
              <span className="orion-page-state-detail">{error}</span>
            </>
          }
          actions={
            <>
              <button type="button" className="btn-secondary" onClick={() => window.location.reload()}>
                <RefreshCw size={14} />
                Retry
              </button>
              <Link href="/workspace" className="btn-primary">
                Open Assistant
              </Link>
            </>
          }
        />
      ) : (
        <>
          <PageSection
            title="Recent runs"
            description="Latest runs and outcomes. Use Runs for the full history."
            actions={
              <Link href="/executions" className="btn-secondary">
                Open Runs
              </Link>
            }
          >
            {recentRuns.length === 0 ? (
              <div className="orion-empty">
                <div className="orion-empty-title">No recent runs</div>
                <div className="orion-empty-copy">Runs will appear here once an assistant or workflow has completed work in this workspace.</div>
              </div>
            ) : (
              <div className="orion-dashboard-list">
                {recentRuns.slice(0, 3).map((run) => (
                  <div key={run.run_id} className="orion-list-row">
                    <div className="orion-list-row-main">
                      <div className="orion-list-row-title">{humanizeAgentName(run.agent_role)}</div>
                      <div className="orion-list-row-subtitle">{summarizeRun(run)}</div>
                    </div>
                    <div className="orion-dashboard-row-meta">
                      <span className="orion-chip" data-status-tone={statusTone(run.status)}>
                        {statusLabel(run.status)}
                      </span>
                      <span className="orion-panel-copy orion-dashboard-row-time">
                        {formatRelativeTime(run.updated_at || run.created_at || null)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PageSection>

          <PageSection
            title="Workflows"
            description="Systems currently available in this workspace."
            actions={
              <Link href="/workflows" className="btn-secondary">
                Open Workflows
              </Link>
            }
          >
            {workflows.length === 0 ? (
              <div className="orion-empty">
                <div className="orion-empty-title">No workflows yet</div>
                <div className="orion-empty-copy">Start with the assistant if you want help outlining a flow, then save the result here for reuse.</div>
                <div className="orion-state-actions">
                  <Link href="/workspace" className="btn-primary">
                    Open Assistant
                  </Link>
                  <Link href="/workflows" className="btn-secondary">
                    Browse Workflows
                  </Link>
                </div>
              </div>
            ) : (
              <div className="orion-dashboard-list">
                {workflows.slice(0, 4).map((workflow) => (
                  <Link
                    key={workflow.id}
                    href={`/workflows/${encodeURIComponent(workflow.id)}`}
                    className="orion-list-row"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div className="orion-list-row-main">
                      <div className="orion-list-row-title orion-dashboard-inline-title">
                        <Workflow size={14} />
                        {String(workflow.name || workflow.id || 'Automation')}
                      </div>
                      <div className="orion-list-row-subtitle">
                        {String(workflow.description || 'Open to view details.')}
                      </div>
                    </div>
                    <div className="orion-dashboard-row-meta">
                      <span className="orion-chip" data-status-tone={workflowTone(workflow.status)}>
                        {workflowLabel(workflow.status)}
                      </span>
                      <span className="orion-panel-copy orion-dashboard-row-time">
                        {formatRelativeTime(workflow.updatedAt || workflow.lastRun || null)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </PageSection>

          {solutions.length > 0 ? (
            <PageSection
              title="Packages"
              description="Optional packaged capability layers built on top of the core platform."
              actions={
                <Link href="/solutions" className="btn-secondary">
                  View Packages
                </Link>
              }
            >
              <div className="orion-stagger-grid orion-dashboard-card-grid">
                {solutions.slice(0, 2).map((solution) => (
                  <Link
                    key={solution.id}
                    href={solution.primary_route || solution.route_base || '/solutions'}
                    className="orion-panel orion-surface-lift orion-dashboard-package-card"
                  >
                    <div className="orion-dashboard-package-head">
                      <div className="orion-dashboard-package-copy">
                        <div className="orion-panel-title orion-dashboard-zero-margin">{solution.name}</div>
                        <div className="orion-panel-copy orion-dashboard-zero-margin">{solution.description || 'Optional packaged capability layer'}</div>
                      </div>
                      <span className="orion-chip" data-status-tone={solution.enabled ? 'green' : 'grey'}>
                        {solution.enabled ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="orion-dashboard-package-chips">
                      <span className="orion-chip"><Boxes size={12} /> {solution.status?.spaces_monitored || 0} monitors</span>
                      <span className="orion-chip" data-status-tone={Number(solution.status?.unresolved_alerts || 0) > 0 ? 'red' : 'grey'}>
                        <Bell size={12} /> {solution.status?.unresolved_alerts || 0} alerts
                      </span>
                    </div>
                    <div className="orion-panel-copy orion-dashboard-zero-margin">
                      {solution.status?.summary || 'No live summary available.'}
                    </div>
                  </Link>
                ))}
              </div>
            </PageSection>
          ) : null}

          {recentAlerts.length > 0 ? (
            <PageSection
              title="Needs attention"
              description="Items that may need a quick decision."
            >
              <div className="orion-dashboard-list">
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
            </PageSection>
          ) : null}
        </>
      )}
    </div>
  );
}
