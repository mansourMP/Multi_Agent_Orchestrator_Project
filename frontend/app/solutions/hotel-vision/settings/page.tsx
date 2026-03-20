'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { type HotelSpace, fetchHotelSpaces } from '@/lib/solutions';

export default function HotelVisionSettingsPage() {
  const [spaces, setSpaces] = useState<HotelSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetchHotelSpaces()
      .then((items) => {
        setSpaces(items);
        setError('');
      })
      .catch((fetchError) => setError(fetchError instanceof Error ? fetchError.message : 'Failed to load settings.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={<Settings size={18} />}
        title="Hotel Vision settings"
        subtitle="Solution-level defaults and monitored space configuration."
        meta={<span>{spaces.length} spaces</span>}
      />

      {error ? <section className="orion-panel muted">{error}</section> : null}

      <section className="orion-panel">
        <div className="orion-panel-header">
          <div>
            <div className="orion-panel-title">Property</div>
            <div className="orion-panel-copy">Demo hotel configuration using file-backed monitored spaces.</div>
          </div>
        </div>
        <div className="orion-list-row">
          <div className="orion-list-row-main">
            <div className="orion-list-row-title">Hotel name</div>
            <div className="orion-list-row-subtitle">Empyralis Demo Hotel</div>
          </div>
        </div>
        <div className="orion-list-row">
          <div className="orion-list-row-main">
            <div className="orion-list-row-title">Timezone</div>
            <div className="orion-list-row-subtitle">Local runtime timezone</div>
          </div>
        </div>
      </section>

      <section className="orion-panel">
        <div className="orion-panel-header">
          <div>
            <div className="orion-panel-title">Spaces</div>
            <div className="orion-panel-copy">Read-only view of the current solution space configuration.</div>
          </div>
        </div>
        {loading ? (
          <div className="orion-stagger-grid" style={{ display: 'grid', gap: 10 }}>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="orion-list-row">
                <div className="orion-list-row-main">
                  <SkeletonBlock className="orion-skeleton-line medium" />
                  <SkeletonBlock className="orion-skeleton-line" />
                </div>
                <div style={{ display: 'grid', gap: 6, justifyItems: 'end', minWidth: 120 }}>
                  <SkeletonBlock className="orion-skeleton-line short" />
                  <SkeletonBlock className="orion-skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {spaces.map((space) => (
              <div key={space.space_id} className="orion-list-row">
                <div className="orion-list-row-main">
                  <div className="orion-list-row-title">{space.space_name}</div>
                  <div className="orion-list-row-subtitle">{space.camera_url || 'No camera URL set'}</div>
                </div>
                <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                  <span className="orion-chip">Every {space.scan_cadence_minutes || 5} min</span>
                  <span className="orion-chip">Busy at {space.busy_threshold || 15}+</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="orion-panel">
        <div className="orion-panel-header">
          <div>
            <div className="orion-panel-title">AI providers and notifications</div>
            <div className="orion-panel-copy">Provider keys and Telegram credentials remain in core platform settings.</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/settings" className="orion-btn orion-btn-ghost">Open core settings</Link>
          <Link href="/integrations" className="orion-btn orion-btn-ghost">Open connections</Link>
        </div>
      </section>
    </div>
  );
}
