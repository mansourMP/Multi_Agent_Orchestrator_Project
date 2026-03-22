'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bell, Boxes, LayoutDashboard, Puzzle, Workflow } from 'lucide-react';
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
      lastScan: lastScanValues[0] || null,
    };
  }, [skills.length, solutions, workflows.length]);

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
        subtitle="Your assistant, automations, and recent activity in one place."
        meta={
          <>
            <span>{workflows.length} automation{workflows.length === 1 ? '' : 's'}</span>
            <span>{skills.length} active skill{skills.length === 1 ? '' : 's'}</span>
            {mcpEndpoint ? <span className="orion-chip" data-status-tone="green">Connected</span> : null}
          </>
        }
      />

      <MetricStrip
        items={[
          { label: 'Automations', value: String(workflows.length) },
          { label: 'Active skills', value: String(skills.length) },
          { label: 'Solutions', value: String(solutions.length) },
          { label: 'Unresolved alerts', value: String(summary.alerts) },
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
                <div className="orion-panel-title">Recent activity</div>
                <div className="orion-panel-copy">The latest agent work completed or still in progress.</div>
              </div>
            </div>
            {recentRuns.length === 0 ? (
              <div className="orion-empty">
                <div className="orion-empty-title">No recent activity</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {recentRuns.map((run) => (
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
                <div className="orion-panel-title">Active skills</div>
                <div className="orion-panel-copy">Reusable capabilities currently enabled in this deployment.</div>
              </div>
            </div>
            {skills.length === 0 ? (
              <div className="orion-empty">
                <div className="orion-empty-title">No skills active</div>
              </div>
            ) : (
              <div className="orion-stagger-grid" style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                {skills.map((skill) => (
                  <div key={skill.id} className="orion-list-row" style={{ minHeight: 76 }}>
                    <div className="orion-list-row-main">
                      <div className="orion-list-row-title" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                        <Puzzle size={14} />
                        {skill.name}
                      </div>
                      <div className="orion-list-row-subtitle">{skill.id}</div>
                    </div>
                    <span className="orion-chip" data-status-tone="green">Active</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="orion-panel">
            <div className="orion-panel-header">
              <div>
                <div className="orion-panel-title">Solutions</div>
                <div className="orion-panel-copy">
                  Optional packaged experiences built on top of the core platform.
                </div>
              </div>
              <Link href="/solutions" className="btn-secondary">
                View solutions
              </Link>
            </div>
            {solutions.length === 0 ? (
              <div className="orion-empty">
                <div className="orion-empty-title">No solutions installed</div>
                <div className="orion-panel-copy" style={{ margin: 0 }}>
                  Start with the assistant and automations. Add packaged solutions only when they simplify a specific workflow.
                </div>
              </div>
            ) : (
              <div className="orion-stagger-grid" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                {solutions.map((solution) => (
                  <Link
                    key={solution.id}
                    href={solution.primary_route || solution.route_base || '/solutions'}
                    className="orion-panel orion-surface-lift"
                    style={{ display: 'grid', gap: 10, textDecoration: 'none', color: 'inherit' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div className="orion-panel-title" style={{ margin: 0 }}>{solution.name}</div>
                        <div className="orion-panel-copy" style={{ margin: 0 }}>{solution.description || 'Packaged workflow experience'}</div>
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
                    <div className="orion-panel-copy" style={{ margin: 0 }}>
                      Updated {formatRelativeTime(solution.status?.last_scan_at || null)}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="orion-panel">
            <div className="orion-panel-header">
              <div>
                <div className="orion-panel-title">Automations</div>
                <div className="orion-panel-copy">Systems currently available in this workspace.</div>
              </div>
            </div>
            {workflows.length === 0 ? (
              <div className="orion-empty">
                <div className="orion-empty-title">No automations yet</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {workflows.slice(0, 8).map((workflow) => (
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

          <section className="orion-panel">
            <div className="orion-panel-header">
              <div>
                <div className="orion-panel-title">Recent alerts</div>
                <div className="orion-panel-copy">Latest items that may need your attention.</div>
              </div>
            </div>
            {recentAlerts.length === 0 ? (
              <div className="orion-empty">
                <div className="orion-empty-title">All clear</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {recentAlerts.map((alert) => (
                  <div key={alert.id} className="orion-list-row">
                    <div className="orion-list-row-main">
                      <div className="orion-list-row-title">{alert.title}</div>
                      <div className="orion-list-row-subtitle">{alert.message}</div>
                    </div>
                    <span className="orion-chip" data-status-tone="red" title={alert.ts}>{formatRelativeTime(alert.ts)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
