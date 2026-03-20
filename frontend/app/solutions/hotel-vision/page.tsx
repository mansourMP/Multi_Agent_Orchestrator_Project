'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Building2 } from 'lucide-react';
import { AuthenticatedImage } from '@/components/solutions/AuthenticatedImage';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { type HotelAlert, type HotelSpace, fetchHotelAlerts, fetchHotelSpaces, formatRelativeTime, statusTone } from '@/lib/solutions';

function formatLiveAge(value: string | null | undefined, nowMs: number): string {
  const token = String(value || '').trim();
  if (!token) return 'Updated just now';
  const parsed = Date.parse(token);
  if (!Number.isFinite(parsed)) return 'Updated just now';
  const ageSeconds = Math.max(0, Math.floor((nowMs - parsed) / 1000));
  if (ageSeconds < 60) {
    return `Updated ${ageSeconds} second${ageSeconds === 1 ? '' : 's'} ago`;
  }
  const ageMinutes = Math.floor(ageSeconds / 60);
  if (ageMinutes < 60) {
    return `Updated ${ageMinutes} min ago`;
  }
  const ageHours = Math.floor(ageMinutes / 60);
  return `Updated ${ageHours} hr ago`;
}

function freshnessState(value: string | null | undefined, nowMs: number): {
  tone: 'green' | 'yellow' | 'grey';
  label: string;
} {
  const token = String(value || '').trim();
  if (!token) return { tone: 'grey', label: 'Last seen unknown' };
  const parsed = Date.parse(token);
  if (!Number.isFinite(parsed)) return { tone: 'grey', label: 'Last seen unknown' };
  const ageSeconds = Math.max(0, Math.floor((nowMs - parsed) / 1000));
  if (ageSeconds < 120) {
    return { tone: 'green', label: 'Live' };
  }
  if (ageSeconds < 300) {
    return { tone: 'yellow', label: 'Scanning...' };
  }
  const ageMinutes = Math.max(1, Math.floor(ageSeconds / 60));
  return { tone: 'grey', label: `Last seen ${ageMinutes} min ago` };
}

function cacheBustedSnapshotUrl(src: string | null | undefined, updatedAt: string | null | undefined): string {
  const normalized = String(src || '').trim();
  if (!normalized) return '';
  const stamp = encodeURIComponent(String(updatedAt || '').trim() || String(Date.now()));
  return normalized.includes('?') ? `${normalized}&ts=${stamp}` : `${normalized}?ts=${stamp}`;
}

export default function HotelVisionDashboardPage() {
  const [spaces, setSpaces] = useState<HotelSpace[]>([]);
  const [alerts, setAlerts] = useState<HotelAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useCallback(async (showSkeleton: boolean) => {
      if (showSkeleton) setLoading(true);
      try {
        const [spaceItems, alertItems] = await Promise.all([
          fetchHotelSpaces(),
          fetchHotelAlerts({ unresolvedOnly: true, days: 7 }),
        ]);
        setSpaces(spaceItems);
        setAlerts(alertItems);
        setError('');
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load hotel dashboard.');
      } finally {
        if (showSkeleton) setLoading(false);
      }
    }, []);

  useEffect(() => {
    let cancelled = false;
    const loadWithGuard = async (showSkeleton: boolean) => {
      if (cancelled) return;
      await load(showSkeleton);
    };
    void loadWithGuard(true);
    const timer = window.setInterval(() => {
      void loadWithGuard(false);
    }, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const summary = useMemo(() => {
    const timestamps = spaces.map((item) => String(item.updated_at || '').trim()).filter(Boolean).sort().reverse();
    return {
      spaceCount: spaces.length,
      alertCount: alerts.length,
      lastScanAt: timestamps[0] || null,
    };
  }, [alerts.length, spaces]);

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={<Building2 size={18} />}
        title="Hotel Vision"
        subtitle={`${summary.spaceCount} spaces monitored · ${summary.alertCount} alerts · Scanned ${formatRelativeTime(summary.lastScanAt)}`}
        meta={
          <>
            <span>{summary.spaceCount} spaces</span>
            <span>{summary.alertCount} unresolved alerts</span>
          </>
        }
      />

      <MetricStrip
        items={[
          { label: 'Spaces monitored', value: String(summary.spaceCount) },
          { label: 'Unresolved alerts', value: String(summary.alertCount) },
          { label: 'Last scan', value: formatRelativeTime(summary.lastScanAt) },
        ]}
      />

      {loading ? (
        <section className="orion-panel muted">
          <div className="orion-stagger-grid" style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
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
        <section className="orion-panel">
          <div className="orion-panel-header">
            <div>
              <div className="orion-panel-title">Spaces</div>
              <div className="orion-panel-copy">Live operational view by monitored area.</div>
            </div>
            <Link href="/solutions/hotel-vision/alerts" className="orion-btn orion-btn-ghost">
              <Bell size={14} />
              Open alerts
            </Link>
          </div>

          <div className="orion-stagger-grid" style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {spaces.map((space) => {
              const freshness = freshnessState(space.updated_at, nowMs);
              const freshnessColor =
                freshness.tone === 'green'
                  ? 'var(--status-green)'
                  : freshness.tone === 'yellow'
                    ? 'var(--status-yellow)'
                    : 'var(--status-grey)';

              return (
                <Link
                  key={space.space_id}
                  href={`/solutions/hotel-vision/spaces/${encodeURIComponent(space.space_id)}`}
                  className="orion-panel orion-surface-lift"
                  style={{ display: 'grid', gap: 12, padding: 14, textDecoration: 'none', color: 'inherit' }}
                >
                  <AuthenticatedImage
                    src={cacheBustedSnapshotUrl(space.snapshot_url, space.updated_at)}
                    alt={`${space.space_name} snapshot`}
                    style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 14, border: '1px solid var(--border-default)' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <div className="orion-panel-title" style={{ margin: 0 }}>{space.space_name}</div>
                      <div className="orion-panel-copy" style={{ margin: 0 }}>{space.occupancy_count} people now</div>
                    </div>
                    <span className="orion-chip" data-status-tone={statusTone(space.status)}>{space.status.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="orion-panel-copy" style={{ margin: 0 }}>{space.summary_line || 'No summary available.'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', color: 'var(--text-tertiary)', fontSize: 12.5 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span
                        aria-hidden
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '999px',
                          backgroundColor: freshnessColor,
                        }}
                      />
                      {freshness.label}
                    </span>
                    <span>{space.unresolved_alert_count || 0} alerts</span>
                  </div>
                  <div className="orion-panel-copy" style={{ margin: 0 }}>
                    {formatLiveAge(space.updated_at, nowMs)}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
