'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell } from 'lucide-react';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { alertSeverityTone, type HotelAlert, fetchHotelAlerts, formatRelativeTime, resolveHotelAlert } from '@/lib/solutions';

export default function HotelVisionAlertsPage() {
  const [alerts, setAlerts] = useState<HotelAlert[]>([]);
  const [days, setDays] = useState(7);
  const [unresolvedOnly, setUnresolvedOnly] = useState(true);
  const [spaceId, setSpaceId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchHotelAlerts({ unresolvedOnly, days, spaceId: spaceId || undefined });
      setAlerts(items);
      setError('');
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load alerts.');
    } finally {
      setLoading(false);
    }
  }, [days, spaceId, unresolvedOnly]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [load]);

  const spaces = useMemo(() => Array.from(new Set(alerts.map((item) => item.space_id))).sort(), [alerts]);

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={<Bell size={18} />}
        title="Alerts"
        subtitle="Unresolved and recent issues across all monitored spaces."
        meta={<span>{alerts.length} alerts</span>}
      />

      <section className="orion-panel" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select value={String(days)} onChange={(event) => setDays(Number(event.target.value))} className="orion-input" style={{ width: 'auto' }}>
            <option value={1}>Today</option>
            <option value={7}>7 days</option>
          </select>
          <select value={spaceId} onChange={(event) => setSpaceId(event.target.value)} className="orion-input" style={{ width: 'auto' }}>
            <option value="">All spaces</option>
            {spaces.map((space) => <option key={space} value={space}>{space}</option>)}
          </select>
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={unresolvedOnly} onChange={(event) => setUnresolvedOnly(event.target.checked)} />
            Unresolved only
          </label>
          <button className="orion-btn orion-btn-ghost" onClick={() => void load()}>Refresh</button>
        </div>

        {error ? <div className="orion-panel-copy" style={{ margin: 0 }}>{error}</div> : null}

        {loading ? (
          <div className="orion-stagger-grid" style={{ display: 'grid', gap: 10 }}>
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="orion-list-row">
                <div className="orion-list-row-main">
                  <SkeletonBlock className="orion-skeleton-line medium" />
                  <SkeletonBlock className="orion-skeleton-line" />
                </div>
                <div style={{ display: 'grid', gap: 8, justifyItems: 'end', minWidth: 100 }}>
                  <SkeletonBlock className="orion-skeleton-line short" />
                  <SkeletonBlock className="orion-skeleton-line medium" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {alerts.map((alert) => (
              <div key={alert.id} className="orion-list-row">
                <div className="orion-list-row-main">
                  <div className="orion-list-row-title">{alert.space_name || alert.space_id}</div>
                  <div className="orion-list-row-subtitle" title={alert.ts}>{alert.message}</div>
                </div>
                <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
                  <span className="orion-chip" data-status-tone={alertSeverityTone(alert.severity)}>{alert.severity}</span>
                  <span className="orion-panel-copy" style={{ margin: 0 }} title={alert.ts}>{formatRelativeTime(alert.ts)}</span>
                  {!alert.resolved ? (
                    <button className="orion-btn orion-btn-ghost" onClick={() => void resolveHotelAlert(alert.id).then(load)}>
                      Resolve
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {alerts.length === 0 ? <div className="orion-empty"><div className="orion-empty-title">No alerts found</div></div> : null}
          </div>
        )}
      </section>
    </div>
  );
}
