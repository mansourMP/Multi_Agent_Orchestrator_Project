'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Building2, Camera, CheckCircle2, MessageCircle } from 'lucide-react';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { createHotelOnboardingSpace, fetchHotelOnboardingStatus, type HotelOnboardingStatus } from '@/lib/hotelVision';

const FALLBACK_TIMEZONES = ['UTC', 'Africa/Casablanca', 'Europe/Paris', 'Europe/Brussels', 'Asia/Dubai', 'Asia/Shanghai'];

function availableTimezones(): string[] {
  const supportedValuesOf = (Intl as Intl.DateTimeFormatOptions & { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  if (typeof supportedValuesOf === 'function') {
    try {
      const values = supportedValuesOf('timeZone');
      if (Array.isArray(values) && values.length > 0) return values;
    } catch {
      return FALLBACK_TIMEZONES;
    }
  }
  return FALLBACK_TIMEZONES;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read the uploaded photo.'));
    reader.readAsDataURL(file);
  });
}

export default function HotelVisionOnboardingPage() {
  const [status, setStatus] = useState<HotelOnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ spaceId: string; message: string; channelConnected: boolean } | null>(null);
  const [hotelName, setHotelName] = useState('');
  const [city, setCity] = useState('');
  const [timezone, setTimezone] = useState('');
  const [alertChannel, setAlertChannel] = useState<'telegram'>('telegram');
  const [spaceName, setSpaceName] = useState('');
  const [cameraMode, setCameraMode] = useState<'upload' | 'ip_camera'>('upload');
  const [cameraUrl, setCameraUrl] = useState('');
  const [photoName, setPhotoName] = useState('');
  const [uploadedPhotoDataUrl, setUploadedPhotoDataUrl] = useState('');
  const [peopleCount, setPeopleCount] = useState(true);
  const [afterHoursMovement, setAfterHoursMovement] = useState(true);
  const [occupancyLevel, setOccupancyLevel] = useState(true);
  const [busyThreshold, setBusyThreshold] = useState('15');
  const [quietFrom, setQuietFrom] = useState('22:00');
  const [quietTo, setQuietTo] = useState('06:00');

  useEffect(() => {
    let cancelled = false;
    void fetchHotelOnboardingStatus()
      .then((payload) => {
        if (cancelled) return;
        setStatus(payload);
        setTimezone(payload.default_timezone || 'UTC');
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load onboarding.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const timezoneOptions = useMemo(() => availableTimezones(), []);
  const connectedTelegram = status?.connected_channels?.telegram?.connected === true;
  const stepCanContinue = useMemo(() => {
    if (step === 1) return hotelName.trim().length > 1 && city.trim().length > 1 && timezone.trim().length > 0;
    if (step === 2) {
      if (!spaceName.trim()) return false;
      if (cameraMode === 'upload') return Boolean(uploadedPhotoDataUrl);
      return cameraUrl.trim().length > 0;
    }
    if (step === 3) return Number(busyThreshold) > 0 && quietFrom.trim().length > 0 && quietTo.trim().length > 0;
    return true;
  }, [busyThreshold, cameraMode, cameraUrl, city, hotelName, quietFrom, quietTo, spaceName, step, timezone, uploadedPhotoDataUrl]);

  const monitorSummary = useMemo(() => {
    const items: string[] = [];
    if (peopleCount) items.push('people count');
    if (afterHoursMovement) items.push('after-hours movement');
    if (occupancyLevel) items.push('occupancy level');
    return items.length ? items : ['people count'];
  }, [afterHoursMovement, occupancyLevel, peopleCount]);

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const created = await createHotelOnboardingSpace({
        hotel_name: hotelName.trim(),
        city: city.trim(),
        timezone: timezone.trim(),
        alert_channel: alertChannel,
        space_name: spaceName.trim(),
        camera_mode: cameraMode,
        camera_url: cameraMode === 'ip_camera' ? cameraUrl.trim() : '',
        uploaded_photo_data_url: cameraMode === 'upload' ? uploadedPhotoDataUrl : '',
        monitoring_modes: monitorSummary,
        busy_threshold: Number(busyThreshold || 15),
        quiet_hours_from: quietFrom,
        quiet_hours_to: quietTo,
        scan_cadence_minutes: 5,
      });
      setSuccess({
        spaceId: created.item.space_id,
        message: created.monitoring_message,
        channelConnected: created.channel_connected,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to start monitoring.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={<Building2 size={18} />}
        title="Hotel Vision setup"
        subtitle="Set up your first monitored space in a few minutes. No config files, no technical steps."
        meta={<span>{status?.has_spaces ? 'Add another space' : 'First property setup'}</span>}
      />

      <section className="orion-panel" style={{ display: 'grid', gap: 18, maxWidth: 920 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4].map((item) => (
            <button
              key={item}
              type="button"
              className={item === step ? 'orion-btn orion-btn-primary' : 'orion-btn orion-btn-ghost'}
              onClick={() => setStep(item)}
              style={{ minWidth: 120 }}
            >
              Step {item}
            </button>
          ))}
        </div>

        {loading ? <div className="orion-panel-copy">Loading setup…</div> : null}
        {error ? <div className="orion-panel muted">{error}</div> : null}

        {success ? (
          <div className="orion-panel" style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <CheckCircle2 size={18} color="var(--status-green)" />
              <div className="orion-panel-title">Monitoring is set up</div>
            </div>
            <div className="orion-panel-copy">{success.message}</div>
            <div className="orion-panel-copy">
              {success.channelConnected
                ? 'Telegram is connected, so alerts can be delivered as soon as scans begin.'
                : 'Connect Telegram to receive alerts once scans begin.'}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href={`/solutions/hotel-vision/spaces/${encodeURIComponent(success.spaceId)}`} className="orion-btn orion-btn-primary">
                Open space
              </Link>
              <Link href="/solutions/hotel-vision" className="orion-btn orion-btn-ghost">
                Open dashboard
              </Link>
              {!success.channelConnected ? (
                <Link href="/credentials?connector=telegram_bot&onboarding=1" className="orion-btn orion-btn-ghost">
                  Connect Telegram
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        {!loading && !success ? (
          <>
            {step === 1 ? (
              <div style={{ display: 'grid', gap: 14 }}>
                <div>
                  <div className="orion-panel-title">1. Property basics</div>
                  <div className="orion-panel-copy">Tell Empyralist where this property is and where alerts should go.</div>
                </div>
                <label className="orion-field">
                  <span className="orion-field-label">Hotel name</span>
                  <input className="input" value={hotelName} onChange={(event) => setHotelName(event.target.value)} placeholder="Atlas Boutique Hotel" />
                </label>
                <label className="orion-field">
                  <span className="orion-field-label">City</span>
                  <input className="input" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Marrakech" />
                </label>
                <label className="orion-field">
                  <span className="orion-field-label">Timezone</span>
                  <select className="input" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
                    {timezoneOptions.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <div className="orion-field">
                  <span className="orion-field-label">Notifications</span>
                  <label className="orion-list-row" style={{ alignItems: 'center', gap: 10 }}>
                    <input
                      type="radio"
                      checked={alertChannel === 'telegram'}
                      onChange={() => setAlertChannel('telegram')}
                    />
                    <MessageCircle size={16} />
                    <div style={{ display: 'grid', gap: 4 }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Telegram</span>
                      <span className="orion-panel-copy" style={{ margin: 0 }}>
                        {connectedTelegram
                          ? `Connected as ${status?.connected_channels.telegram.label || 'Telegram'}`
                          : 'Connect Telegram once and alerts will start landing there.'}
                      </span>
                    </div>
                  </label>
                  {!connectedTelegram ? (
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <Link href="/credentials?connector=telegram_bot&onboarding=1" className="orion-btn orion-btn-ghost">
                        Connect Telegram
                      </Link>
                      <span className="orion-panel-copy" style={{ margin: 0 }}>You can finish setup now and connect Telegram right after.</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div style={{ display: 'grid', gap: 14 }}>
                <div>
                  <div className="orion-panel-title">2. Add your first space</div>
                  <div className="orion-panel-copy">Start with one area like an entrance, reception, breakfast room, or pool.</div>
                </div>
                <label className="orion-field">
                  <span className="orion-field-label">Space name</span>
                  <input className="input" value={spaceName} onChange={(event) => setSpaceName(event.target.value)} placeholder="Reception" />
                </label>
                <div className="orion-field">
                  <span className="orion-field-label">Camera source</span>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <label className="orion-list-row" style={{ alignItems: 'center', gap: 10 }}>
                      <input type="radio" checked={cameraMode === 'upload'} onChange={() => setCameraMode('upload')} />
                      <Camera size={16} />
                      <div style={{ display: 'grid', gap: 4 }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Upload a photo</span>
                        <span className="orion-panel-copy" style={{ margin: 0 }}>Best for testing right now.</span>
                      </div>
                    </label>
                    <label className="orion-list-row" style={{ alignItems: 'center', gap: 10 }}>
                      <input type="radio" checked={cameraMode === 'ip_camera'} onChange={() => setCameraMode('ip_camera')} />
                      <Camera size={16} />
                      <div style={{ display: 'grid', gap: 4 }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>IP camera URL</span>
                        <span className="orion-panel-copy" style={{ margin: 0 }}>Use this for a live deployment.</span>
                      </div>
                    </label>
                  </div>
                </div>
                {cameraMode === 'upload' ? (
                  <label className="orion-field">
                    <span className="orion-field-label">Test photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        setPhotoName(file.name);
                        void fileToDataUrl(file)
                          .then((value) => {
                            setUploadedPhotoDataUrl(value);
                            setError('');
                          })
                          .catch((readError) => setError(readError instanceof Error ? readError.message : 'Failed to read the uploaded photo.'));
                      }}
                    />
                    {photoName ? <span className="orion-panel-copy" style={{ margin: 0 }}>{photoName} ready</span> : null}
                  </label>
                ) : (
                  <label className="orion-field">
                    <span className="orion-field-label">IP camera URL</span>
                    <input className="input" value={cameraUrl} onChange={(event) => setCameraUrl(event.target.value)} placeholder="rtsp://camera.local/stream" />
                  </label>
                )}
                <div className="orion-field">
                  <span className="orion-field-label">What to monitor</span>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <label className="orion-list-row" style={{ alignItems: 'center', gap: 10 }}><input type="checkbox" checked={peopleCount} onChange={(event) => setPeopleCount(event.target.checked)} />People count</label>
                    <label className="orion-list-row" style={{ alignItems: 'center', gap: 10 }}><input type="checkbox" checked={afterHoursMovement} onChange={(event) => setAfterHoursMovement(event.target.checked)} />After hours movement</label>
                    <label className="orion-list-row" style={{ alignItems: 'center', gap: 10 }}><input type="checkbox" checked={occupancyLevel} onChange={(event) => setOccupancyLevel(event.target.checked)} />Space occupancy level</label>
                  </div>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div style={{ display: 'grid', gap: 14 }}>
                <div>
                  <div className="orion-panel-title">3. Alert settings</div>
                  <div className="orion-panel-copy">Set the occupancy threshold and the quiet hours for after-hours monitoring.</div>
                </div>
                <label className="orion-field">
                  <span className="orion-field-label">Alert me when occupancy exceeds</span>
                  <input className="input" type="number" min="1" value={busyThreshold} onChange={(event) => setBusyThreshold(event.target.value)} />
                </label>
                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  <label className="orion-field">
                    <span className="orion-field-label">Quiet hours from</span>
                    <input className="input" type="time" value={quietFrom} onChange={(event) => setQuietFrom(event.target.value)} />
                  </label>
                  <label className="orion-field">
                    <span className="orion-field-label">Quiet hours to</span>
                    <input className="input" type="time" value={quietTo} onChange={(event) => setQuietTo(event.target.value)} />
                  </label>
                </div>
                <div className="orion-panel muted" style={{ display: 'grid', gap: 6 }}>
                  <div className="orion-panel-title" style={{ fontSize: 15 }}>Alert channel</div>
                  <div className="orion-panel-copy" style={{ margin: 0 }}>
                    {connectedTelegram
                      ? `Telegram is ready: ${status?.connected_channels.telegram.label || 'Telegram'}`
                      : 'No Telegram channel connected yet. You can finish setup now and connect Telegram right after.'}
                  </div>
                </div>
              </div>
            ) : null}

            {step === 4 ? (
              <div style={{ display: 'grid', gap: 14 }}>
                <div>
                  <div className="orion-panel-title">4. Confirm and activate</div>
                  <div className="orion-panel-copy">Review the setup, then start monitoring. The worker will pick this space up automatically on its next scan.</div>
                </div>
                <div className="orion-panel muted" style={{ display: 'grid', gap: 8 }}>
                  <div><strong>Property:</strong> {hotelName || '—'} · {city || '—'} · {timezone || '—'}</div>
                  <div><strong>Space:</strong> {spaceName || '—'}</div>
                  <div><strong>Camera:</strong> {cameraMode === 'upload' ? 'Uploaded photo for testing' : cameraUrl || '—'}</div>
                  <div><strong>Monitoring:</strong> {monitorSummary.join(', ')}</div>
                  <div><strong>Quiet hours:</strong> {quietFrom} to {quietTo}</div>
                  <div><strong>Threshold:</strong> {busyThreshold} people</div>
                  <div><strong>Alerts:</strong> {connectedTelegram ? 'Telegram connected' : 'Telegram not connected yet'}</div>
                </div>
                <div className="orion-panel-copy" style={{ margin: 0 }}>{status?.monitoring_message || 'Your first space will be scanned automatically.'}</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" className="orion-btn orion-btn-primary" disabled={saving} onClick={() => void submit()}>
                    {saving ? 'Starting…' : 'Start monitoring'}
                  </button>
                  {!connectedTelegram ? (
                    <Link href="/credentials?connector=telegram_bot&onboarding=1" className="orion-btn orion-btn-ghost">
                      Connect Telegram
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {step > 1 ? (
                <button type="button" className="orion-btn orion-btn-ghost" onClick={() => setStep((current) => Math.max(1, current - 1))}>
                  Back
                </button>
              ) : null}
              {step < 4 ? (
                <button type="button" className="orion-btn orion-btn-primary" disabled={!stepCanContinue} onClick={() => setStep((current) => Math.min(4, current + 1))}>
                  Continue
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
