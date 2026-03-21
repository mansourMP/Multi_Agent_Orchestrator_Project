'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { MessageSquareText } from 'lucide-react';
import { AuthenticatedImage } from '@/components/solutions/AuthenticatedImage';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { formatRelativeTime } from '@/lib/solutions';
import {
  alertSeverityTone,
  askHotelSpace,
  type HotelAlert,
  type HotelHistoryItem,
  type HotelSpace,
  fetchHotelAlerts,
  fetchHotelSpace,
  fetchHotelSpaceHistory,
  statusTone,
} from '@/lib/hotelVision';

const SUGGESTED_QUESTIONS = ['Is it open?', 'How busy?', 'Any issues today?'];

export default function HotelVisionSpaceDetailPage() {
  const params = useParams<{ id: string }>();
  const spaceId = String(params?.id || '').trim();
  const [space, setSpace] = useState<HotelSpace | null>(null);
  const [history, setHistory] = useState<HotelHistoryItem[]>([]);
  const [alerts, setAlerts] = useState<HotelAlert[]>([]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    try {
      const [spacePayload, historyPayload, alertPayload] = await Promise.all([
        fetchHotelSpace(spaceId),
        fetchHotelSpaceHistory(spaceId),
        fetchHotelAlerts({ spaceId, days: 7 }),
      ]);
      setSpace(spacePayload);
      setHistory(historyPayload);
      setAlerts(alertPayload);
      setError('');
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load space.');
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxOccupancy = useMemo(() => Math.max(1, ...history.map((item) => Number(item.occupancy_count || 0))), [history]);

  const handleAsk = useCallback(async (nextQuestion?: string) => {
    const prompt = String(nextQuestion ?? question).trim();
    if (!prompt || !spaceId) return;
    setAsking(true);
    setAnswer('');
    try {
      const response = await askHotelSpace(spaceId, prompt);
      setAnswer(response);
      setQuestion(prompt);
    } catch (askError) {
      setAnswer(askError instanceof Error ? askError.message : 'Failed to answer the question.');
    } finally {
      setAsking(false);
    }
  }, [question, spaceId]);

  if (error) {
    return <div className="orion-page-shell orion-animate-in"><section className="orion-panel muted">{error}</section></div>;
  }

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={<MessageSquareText size={18} />}
        title={space?.space_name || 'Space detail'}
        subtitle={`Last updated ${formatRelativeTime(space?.updated_at)}.`}
        meta={space ? <span className="orion-chip" data-status-tone={statusTone(space.status)}>{space.status.replace(/_/g, ' ')}</span> : undefined}
      />

      {loading ? (
        <>
          <section className="orion-panel muted">
            <div className="orion-stagger-grid" style={{ display: 'grid', gap: 16 }}>
              <SkeletonBlock className="orion-skeleton-image" style={{ aspectRatio: '16 / 8' }} />
              <SkeletonBlock className="orion-skeleton-line medium" />
              <SkeletonBlock className="orion-skeleton-line" />
              <SkeletonBlock className="orion-skeleton-line short" />
            </div>
          </section>
          <section className="orion-panel muted">
            <div className="orion-stagger-grid" style={{ display: 'grid', gap: 10 }}>
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonBlock key={index} className="orion-skeleton-line" />
              ))}
            </div>
          </section>
        </>
      ) : space ? (
        <>
          <MetricStrip
            items={[
              { label: 'People now', value: String(space.occupancy_count) },
              { label: 'Status', value: space.status.replace(/_/g, ' ') },
              { label: 'Business state', value: String((space.current_state?.business_state as string) || 'unknown') },
            ]}
          />

          <section className="orion-panel" style={{ display: 'grid', gap: 16 }}>
            <AuthenticatedImage
              src={String(space.snapshot_url || '')}
              alt={`${space.space_name} snapshot`}
              style={{ width: '100%', aspectRatio: '16 / 8', objectFit: 'cover', borderRadius: 18, border: '1px solid var(--border-default)' }}
            />
            <div style={{ display: 'grid', gap: 8 }}>
              <div className="orion-panel-title">Latest summary</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {(space.summary_lines || []).map((line) => (
                  <div key={line} className="orion-panel-copy" style={{ margin: 0 }}>{line}</div>
                ))}
              </div>
            </div>
          </section>

          <section className="orion-panel">
            <div className="orion-panel-header">
              <div>
                <div className="orion-panel-title">24-hour occupancy</div>
                <div className="orion-panel-copy">Recent traffic by scan sample.</div>
              </div>
            </div>
            {history.length === 0 ? (
              <div className="orion-empty">
                <div className="orion-empty-title">No history available</div>
              </div>
            ) : (
              <div className="orion-chart-grid">
                <div className="orion-chart-bars" style={{ gridTemplateColumns: `repeat(${history.length}, minmax(0, 1fr))` }}>
                  {history.map((item) => {
                    const height = `${Math.max(14, Math.round((Number(item.occupancy_count || 0) / maxOccupancy) * 180))}px`;
                    return (
                      <div key={`${item.ts}:${item.occupancy_count}`} className="orion-chart-column">
                        <div title={item.ts} className="orion-chart-bar" style={{ height }} />
                        <span className="orion-chart-label">{new Date(item.ts).getHours()}:00</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="orion-panel">
            <div className="orion-panel-header">
              <div>
                <div className="orion-panel-title">Recent alerts</div>
                <div className="orion-panel-copy">Latest issues flagged for this space.</div>
              </div>
            </div>
            {alerts.length === 0 ? (
              <div className="orion-empty"><div className="orion-empty-title">No alerts</div></div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {alerts.slice(0, 6).map((alert) => (
                  <div key={alert.id} className="orion-list-row">
                    <div className="orion-list-row-main">
                      <div className="orion-list-row-title">{alert.message}</div>
                      <div className="orion-list-row-subtitle">{formatRelativeTime(alert.ts)}</div>
                    </div>
                    <span className="orion-chip" data-status-tone={alertSeverityTone(alert.severity)}>{alert.severity}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="orion-panel" style={{ display: 'grid', gap: 12 }}>
            <div className="orion-panel-header" style={{ marginBottom: 0 }}>
              <div>
                <div className="orion-panel-title">Ask about this space</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SUGGESTED_QUESTIONS.map((chip) => (
                <button key={chip} className="orion-chip orion-chip-action" onClick={() => void handleAsk(chip)}>{chip}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask a question about this space"
                className="orion-input"
                style={{ flex: 1, minWidth: 240 }}
              />
              <button className="orion-btn orion-btn-primary" onClick={() => void handleAsk()} disabled={asking}>
                {asking ? 'Asking…' : 'Ask'}
              </button>
            </div>
            {answer ? (
              <div className="orion-panel muted" style={{ marginTop: 4 }}>
                <div className="orion-panel-copy" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{answer}</div>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
