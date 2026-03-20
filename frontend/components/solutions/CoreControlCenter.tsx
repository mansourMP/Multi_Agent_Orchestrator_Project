'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bell, Boxes, LayoutDashboard, Puzzle, Workflow } from 'lucide-react';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import {
  type HotelAlert,
  type InstalledSolution,
  fetchHotelAlerts,
  fetchSkillsState,
  fetchSolutionsState,
  fetchWeeklySchedules,
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
  const [workflows, setWorkflows] = useState<Array<Record<string, unknown>>>([]);
  const [alerts, setAlerts] = useState<HotelAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [solutionsState, skillsState, weeklySchedules] = await Promise.all([
          fetchSolutionsState(),
          fetchSkillsState(),
          fetchWeeklySchedules(),
        ]);
        if (cancelled) return;
        setSolutions(Array.isArray(solutionsState.active) ? solutionsState.active : []);
        setSkills(Array.isArray(skillsState.installed) ? skillsState.installed.filter((item) => item.enabled) : []);
        setWorkflows(Array.isArray(weeklySchedules) ? weeklySchedules : []);
        if (solutionsState.active.some((item) => item.id === 'hotel-vision')) {
          const hotelAlerts = await fetchHotelAlerts({ unresolvedOnly: true, days: 7 });
          if (!cancelled) setAlerts(hotelAlerts.slice(0, 6));
        } else {
          setAlerts([]);
        }
      } catch (fetchError) {
        if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : 'Failed to load control center.');
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

  return (
    <div className="orion-page-shell narrow orion-animate-in">
      <OsPageHeader
        icon={<LayoutDashboard size={18} />}
        title="Dashboard"
        subtitle="General control center for installed solutions, active skills, and running workflows."
        meta={
          <>
            <span>{solutions.length} active solution{solutions.length === 1 ? '' : 's'}</span>
            <span>{skills.length} active skill{skills.length === 1 ? '' : 's'}</span>
          </>
        }
      />

      <MetricStrip
        items={[
          { label: 'Active solutions', value: String(solutions.length) },
          { label: 'Active skills', value: String(skills.length) },
          { label: 'Running workflows', value: String(workflows.length) },
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
          <div className="orion-panel-title">Control center is unavailable</div>
          <div className="orion-panel-copy">{error}</div>
        </section>
      ) : (
        <>
          <section className="orion-panel">
            <div className="orion-panel-header">
              <div>
                <div className="orion-panel-title">Active solutions</div>
                <div className="orion-panel-copy">
                  Installed vertical packages running on top of the core platform.
                </div>
              </div>
            </div>
            {solutions.length === 0 ? (
              <div className="orion-empty">
                <div className="orion-empty-title">No active solutions</div>
                <div className="orion-empty-copy">Install a solution bundle under `/solutions` to expose an industry view.</div>
              </div>
            ) : (
              <div className="orion-stagger-grid" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                {solutions.map((solution) => (
                  <Link
                    key={solution.id}
                    href={solution.primary_route || solution.route_base || '/'}
                    className="orion-panel orion-surface-lift"
                    style={{ display: 'grid', gap: 10, textDecoration: 'none', color: 'inherit' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div className="orion-panel-title" style={{ margin: 0 }}>{solution.name}</div>
                        <div className="orion-panel-copy" style={{ margin: 0 }}>{solution.description || 'Installed solution package'}</div>
                      </div>
                      <span className="orion-chip" data-status-tone={solution.enabled ? 'green' : 'grey'}>
                        {solution.enabled ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <span className="orion-chip"><Boxes size={12} /> {solution.status?.spaces_monitored || 0} spaces</span>
                      <span className="orion-chip" data-status-tone={Number(solution.status?.unresolved_alerts || 0) > 0 ? 'red' : 'grey'}>
                        <Bell size={12} /> {solution.status?.unresolved_alerts || 0} alerts
                      </span>
                    </div>
                    <div className="orion-panel-copy" style={{ margin: 0 }}>
                      {solution.status?.summary || 'No live summary available.'}
                    </div>
                    <div className="orion-panel-copy" style={{ margin: 0 }}>
                      Last scan {formatRelativeTime(solution.status?.last_scan_at || null)}
                    </div>
                  </Link>
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
                <div className="orion-empty-title">No active skills</div>
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
                <div className="orion-panel-title">Running workflows</div>
                <div className="orion-panel-copy">Scheduled systems currently configured in the runtime.</div>
              </div>
            </div>
            {workflows.length === 0 ? (
              <div className="orion-empty">
                <div className="orion-empty-title">No scheduled workflows</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {workflows.slice(0, 8).map((workflow, index) => (
                  <div key={String(workflow.id || index)} className="orion-list-row">
                    <div className="orion-list-row-main">
                      <div className="orion-list-row-title" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                        <Workflow size={14} />
                        {String(workflow.name || workflow.id || 'Workflow')}
                      </div>
                      <div className="orion-list-row-subtitle">
                        {String(workflow.schedule_label || workflow.timezone || workflow.day || 'Scheduled')}
                      </div>
                    </div>
                    <span className="orion-chip" data-status-tone="grey">{String(workflow.status || 'Active')}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {alerts.length > 0 ? (
            <section className="orion-panel">
              <div className="orion-panel-header">
                <div>
                  <div className="orion-panel-title">Recent alerts</div>
                  <div className="orion-panel-copy">Latest unresolved solution alerts exposed to the control center.</div>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {alerts.map((alert) => (
                  <div key={alert.id} className="orion-list-row">
                    <div className="orion-list-row-main">
                      <div className="orion-list-row-title">{alert.space_name || alert.space_id}</div>
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
