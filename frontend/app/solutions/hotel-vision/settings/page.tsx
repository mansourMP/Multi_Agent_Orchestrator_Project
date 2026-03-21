'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Settings } from 'lucide-react';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { type HotelSpace, fetchHotelSpaces, updateHotelSpaceConfig } from '@/lib/hotelVision';

export default function HotelVisionSettingsPage() {
  const [spaces, setSpaces] = useState<HotelSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [hotelName, setHotelName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [spaceDrafts, setSpaceDrafts] = useState<Record<string, {
    camera_url: string;
    busy_threshold: string;
    business_hours: string;
    scan_cadence_minutes: string;
  }>>({});

  const loadSpaces = async () => {
    await fetchHotelSpaces()
      .then((items) => {
        setSpaces(items);
        setError('');
        const first = items[0];
        setHotelName(String(first?.hotel_name || '').trim() || 'Empyralis Demo Hotel');
        setTimezone(String(first?.timezone || '').trim() || 'Local runtime timezone');
        setSpaceDrafts(
          items.reduce<Record<string, { camera_url: string; busy_threshold: string; business_hours: string; scan_cadence_minutes: string }>>((acc, item) => {
            acc[item.space_id] = {
              camera_url: String(item.camera_url || ''),
              busy_threshold: String(item.busy_threshold ?? 15),
              business_hours: String(item.business_hours?.['mon-sun'] || '07:00-22:00'),
              scan_cadence_minutes: String(item.scan_cadence_minutes ?? 5),
            };
            return acc;
          }, {}),
        );
      })
      .catch((fetchError) => setError(fetchError instanceof Error ? fetchError.message : 'Failed to load settings.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void loadSpaces();
  }, []);

  const canSave = useMemo(() => spaces.length > 0 && !saving, [saving, spaces.length]);

  const updateDraft = (
    spaceId: string,
    field: 'camera_url' | 'busy_threshold' | 'business_hours' | 'scan_cadence_minutes',
    value: string,
  ) => {
    setSpaceDrafts((prev) => ({
      ...prev,
      [spaceId]: {
        camera_url: prev[spaceId]?.camera_url || '',
        busy_threshold: prev[spaceId]?.busy_threshold || '15',
        business_hours: prev[spaceId]?.business_hours || '07:00-22:00',
        scan_cadence_minutes: prev[spaceId]?.scan_cadence_minutes || '5',
        [field]: value,
      },
    }));
  };

  const saveSettings = async () => {
    if (!spaces.length) return;
    setSaving(true);
    setSaveMessage('');
    setError('');
    try {
      await Promise.all(
        spaces.map((space) => {
          const draft = spaceDrafts[space.space_id] || {
            camera_url: String(space.camera_url || ''),
            busy_threshold: String(space.busy_threshold ?? 15),
            business_hours: String(space.business_hours?.['mon-sun'] || '07:00-22:00'),
            scan_cadence_minutes: String(space.scan_cadence_minutes ?? 5),
          };
          return updateHotelSpaceConfig(space.space_id, {
            space_name: space.space_name,
            hotel_name: hotelName,
            timezone,
            camera_url: draft.camera_url.trim(),
            busy_threshold: Number(draft.busy_threshold || 15),
            business_hours: { 'mon-sun': draft.business_hours.trim() || '07:00-22:00' },
            scan_cadence_minutes: Number(draft.scan_cadence_minutes || 5),
            telegram_recipients: space.telegram_recipients || [],
          });
        }),
      );
      await loadSpaces();
      setSaveMessage('Settings saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={<Settings size={18} />}
        title="Hotel Vision settings"
        subtitle="Solution-level defaults and monitored space configuration."
        meta={<span>{spaces.length} spaces</span>}
      />

      {error ? <section className="orion-panel muted">{error}</section> : null}
      {saveMessage ? <section className="orion-panel muted">{saveMessage}</section> : null}

      <section className="orion-panel">
        <div className="orion-panel-header">
          <div>
            <div className="orion-panel-title">Property</div>
            <div className="orion-panel-copy">Editable hotel defaults stored with the monitored space configuration.</div>
          </div>
        </div>
        <div className="orion-field">
          <label className="orion-field-label" htmlFor="hotel-name">Hotel name</label>
          <input
            id="hotel-name"
            className="input"
            value={hotelName}
            onChange={(event) => setHotelName(event.target.value)}
            placeholder="Hotel name"
            style={{ height: 40, borderRadius: 10 }}
          />
        </div>
        <div className="orion-field">
          <label className="orion-field-label" htmlFor="hotel-timezone">Timezone</label>
          <input
            id="hotel-timezone"
            className="input"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            placeholder="Timezone"
            style={{ height: 40, borderRadius: 10 }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="orion-btn orion-btn-primary" onClick={() => void saveSettings()} disabled={!canSave}>
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </section>

      <section className="orion-panel">
        <div className="orion-panel-header">
          <div>
            <div className="orion-panel-title">Spaces</div>
            <div className="orion-panel-copy">Update camera and scan settings for each monitored space.</div>
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
              <div key={space.space_id} className="orion-panel" style={{ display: 'grid', gap: 12 }}>
                <div className="orion-panel-title">{space.space_name}</div>
                <div className="orion-field">
                  <label className="orion-field-label" htmlFor={`camera-${space.space_id}`}>Camera URL</label>
                  <input
                    id={`camera-${space.space_id}`}
                    className="input"
                    value={spaceDrafts[space.space_id]?.camera_url || ''}
                    onChange={(event) => updateDraft(space.space_id, 'camera_url', event.target.value)}
                    placeholder="file://tmp/test.jpg"
                    style={{ height: 40, borderRadius: 10 }}
                  />
                </div>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  <div className="orion-field">
                    <label className="orion-field-label" htmlFor={`busy-${space.space_id}`}>Busy threshold</label>
                    <input
                      id={`busy-${space.space_id}`}
                      className="input"
                      value={spaceDrafts[space.space_id]?.busy_threshold || ''}
                      onChange={(event) => updateDraft(space.space_id, 'busy_threshold', event.target.value)}
                      style={{ height: 40, borderRadius: 10 }}
                    />
                  </div>
                  <div className="orion-field">
                    <label className="orion-field-label" htmlFor={`cadence-${space.space_id}`}>Scan cadence (minutes)</label>
                    <input
                      id={`cadence-${space.space_id}`}
                      className="input"
                      value={spaceDrafts[space.space_id]?.scan_cadence_minutes || ''}
                      onChange={(event) => updateDraft(space.space_id, 'scan_cadence_minutes', event.target.value)}
                      style={{ height: 40, borderRadius: 10 }}
                    />
                  </div>
                </div>
                <div className="orion-field">
                  <label className="orion-field-label" htmlFor={`hours-${space.space_id}`}>Business hours</label>
                  <input
                    id={`hours-${space.space_id}`}
                    className="input"
                    value={spaceDrafts[space.space_id]?.business_hours || ''}
                    onChange={(event) => updateDraft(space.space_id, 'business_hours', event.target.value)}
                    placeholder="07:00-22:00"
                    style={{ height: 40, borderRadius: 10 }}
                  />
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
          <Link href="/settings" className="orion-btn orion-btn-ghost">Settings</Link>
          <Link href="/integrations" className="orion-btn orion-btn-ghost">Open connections</Link>
        </div>
      </section>
    </div>
  );
}
