'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bell, Boxes, LayoutDashboard } from 'lucide-react';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { PACKAGED_SOLUTIONS_ENABLED } from '@/lib/appFlags';
import { type InstalledSolution, fetchSolutionsState, formatRelativeTime } from '@/lib/solutions';

export default function SolutionsPage() {
  const [solutions, setSolutions] = useState<InstalledSolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const state = await fetchSolutionsState();
        if (cancelled) return;
        setSolutions(Array.isArray(state.active) ? state.active : []);
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load solutions.');
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

  const totalAlerts = solutions.reduce((count, item) => count + Number(item.status?.unresolved_alerts || 0), 0);
  const totalSpaces = solutions.reduce((count, item) => count + Number(item.status?.spaces_monitored || 0), 0);

  return (
    <div className="orion-page-shell narrow orion-animate-in">
      <OsPageHeader
        icon={<LayoutDashboard size={18} />}
        title="Packages"
        subtitle="Optional packaged capability layers built on top of workflows, skills, and connectors."
        meta={
          <>
            <span>{solutions.length} installed</span>
            <span>{totalAlerts} unresolved alerts</span>
          </>
        }
      />

      <MetricStrip
        items={[
          { label: 'Installed', value: String(solutions.length) },
          { label: 'Live monitors', value: String(totalSpaces) },
          { label: 'Unresolved alerts', value: String(totalAlerts) },
        ]}
      />

      {!PACKAGED_SOLUTIONS_ENABLED ? (
        <section className="orion-panel muted" style={{ minHeight: 220, display: 'grid', gap: 10, placeItems: 'center' }}>
          <div className="orion-panel-title">Packages are disabled</div>
          <div className="orion-panel-copy">This workspace is running the general platform surface. Packaged vertical experiences are opt-in.</div>
        </section>
      ) : loading ? (
        <section className="orion-panel muted">
          <div className="orion-stagger-grid" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="orion-panel orion-skeleton-card">
                <SkeletonBlock className="orion-skeleton-image" />
                <SkeletonBlock className="orion-skeleton-line medium" />
                <SkeletonBlock className="orion-skeleton-line" />
              </div>
            ))}
          </div>
        </section>
      ) : error ? (
        <section className="orion-panel muted" style={{ minHeight: 220, display: 'grid', gap: 8, placeItems: 'center' }}>
          <div className="orion-panel-title">Packages are unavailable</div>
          <div className="orion-panel-copy">{error}</div>
        </section>
      ) : solutions.length === 0 ? (
        <section className="orion-panel muted" style={{ minHeight: 220, display: 'grid', gap: 10, placeItems: 'center' }}>
          <div className="orion-panel-title">No packages enabled</div>
          <div className="orion-panel-copy">Use core workflows, skills, and connectors first. Turn on packaged capability layers only when you need a specific operating model.</div>
        </section>
      ) : (
        <section className="orion-panel">
          <div className="orion-stagger-grid" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
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
                    <div className="orion-panel-copy" style={{ margin: 0 }}>
                      {solution.description || 'Packaged workflow experience'}
                    </div>
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
                  {solution.status?.summary || 'No live summary available yet.'}
                </div>
                <div className="orion-panel-copy" style={{ margin: 0 }}>
                  Updated {formatRelativeTime(solution.status?.last_scan_at || null)}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
