'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Grid2X2 } from 'lucide-react';
import { AuthenticatedImage } from '@/components/solutions/AuthenticatedImage';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { formatRelativeTime } from '@/lib/solutions';
import { type HotelSpace, fetchHotelSpaces, statusTone } from '@/lib/hotelVision';

export default function HotelVisionSpacesPage() {
  const [spaces, setSpaces] = useState<HotelSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetchHotelSpaces().then((items) => {
      setSpaces(items);
      setError('');
    }).catch((fetchError) => {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load spaces.');
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={<Grid2X2 size={18} />}
        title="Spaces"
        subtitle="All monitored areas available in this hotel solution."
        meta={<span>{spaces.length} spaces</span>}
      />

      {loading ? (
        <section className="orion-panel muted">
          <div className="orion-stagger-grid" style={{ display: 'grid', gap: 10 }}>
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="orion-list-row">
                <SkeletonBlock style={{ width: 80, height: 56 }} />
                <div className="orion-list-row-main">
                  <SkeletonBlock className="orion-skeleton-line medium" />
                  <SkeletonBlock className="orion-skeleton-line" />
                </div>
                <div style={{ display: 'grid', gap: 6, justifyItems: 'end', minWidth: 120 }}>
                  <SkeletonBlock className="orion-skeleton-line short" />
                  <SkeletonBlock className="orion-skeleton-line medium" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : error ? (
        <section className="orion-panel muted">{error}</section>
      ) : (
        <section className="orion-panel">
          <div style={{ display: 'grid', gap: 10 }}>
            {spaces.map((space) => (
              <Link key={space.space_id} href={`/solutions/hotel-vision/spaces/${encodeURIComponent(space.space_id)}`} className="orion-list-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                <AuthenticatedImage
                  src={String(space.snapshot_url || '')}
                  alt={`${space.space_name} thumbnail`}
                  style={{ width: 80, height: 56, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--border-default)' }}
                />
                <div className="orion-list-row-main">
                  <div className="orion-list-row-title">{space.space_name}</div>
                  <div className="orion-list-row-subtitle">{space.summary_line || 'No summary available.'}</div>
                </div>
                <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                  <span className="orion-chip" data-status-tone={statusTone(space.status)}>{space.status.replace(/_/g, ' ')}</span>
                  <span className="orion-panel-copy" style={{ margin: 0 }}>{space.occupancy_count} people · {formatRelativeTime(space.updated_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
