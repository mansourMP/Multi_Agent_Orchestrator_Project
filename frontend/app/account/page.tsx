'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Settings, UserRound } from 'lucide-react';
import { OsPageHeader } from '@/components/ui/OsPageHeader';

const STORAGE_KEY = 'empyralis_account_profile_v1';

type AccountProfile = {
  displayName: string;
  email?: string;
  photoUrl?: string;
};

const DEFAULT_PROFILE: AccountProfile = {
  displayName: 'Account owner',
  email: '',
  photoUrl: '',
};

function loadStoredProfile(): AccountProfile {
  if (typeof window === 'undefined') return DEFAULT_PROFILE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const saved = JSON.parse(raw) as Partial<AccountProfile>;
    return {
      displayName: typeof saved.displayName === 'string' && saved.displayName.trim()
        ? saved.displayName.trim()
        : DEFAULT_PROFILE.displayName,
      email: typeof saved.email === 'string' ? saved.email.trim() : '',
      photoUrl: typeof saved.photoUrl === 'string' ? saved.photoUrl.trim() : '',
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

function initialsForName(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return 'A';
  return parts.map((item) => item.slice(0, 1).toUpperCase()).join('');
}

export default function AccountPage() {
  const [draft, setDraft] = useState<AccountProfile>(() => loadStoredProfile());
  const [authEmail, setAuthEmail] = useState('');
  const [saveNotice, setSaveNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadIdentity() {
      try {
        const response = await fetch('/api/control-plane/auth/me', { cache: 'no-store' });
        const payload = (await response.json().catch(() => null)) as { user?: { email?: string | null } | null } | null;
        if (cancelled) return;
        const email = String(payload?.user?.email || '').trim();
        if (!email) return;
        setAuthEmail(email);
        setDraft((current) => {
          if (current.email === email) return current;
          return { ...current, email };
        });
        if (typeof window !== 'undefined') {
          const current = loadStoredProfile();
          window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              ...current,
              email,
            }),
          );
        }
      } catch {
        // Ignore identity lookup failures on local-only sessions.
      }
    }
    void loadIdentity();
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveEmail = authEmail || draft.email || '';
  const avatarLabel = useMemo(() => initialsForName(draft.displayName), [draft.displayName]);

  const persist = useCallback(() => {
    const next = {
      displayName: draft.displayName.trim() || DEFAULT_PROFILE.displayName,
      email: effectiveEmail,
      photoUrl: draft.photoUrl?.trim() || '',
    };
    setDraft(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
    setSaveNotice('Saved');
    window.setTimeout(() => setSaveNotice(''), 1600);
  }, [draft, effectiveEmail]);

  return (
    <div className="orion-page-shell narrow orion-animate-in">
      <OsPageHeader
        icon={<UserRound size={18} />}
        title="Profile"
        subtitle="Manage your account details."
        actions={
          <Link href="/settings" className="orion-btn orion-btn-ghost" style={{ minHeight: 34, paddingInline: 12 }}>
            <Settings size={13} />
            Settings
          </Link>
        }
      />

      <section className="orion-panel">
        <div className="orion-panel-header" style={{ marginBottom: 18 }}>
          <div>
            <div className="orion-panel-title">Your profile</div>
            <div className="orion-panel-copy">Keep your account details current without the extra admin clutter.</div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gap: 24,
            alignItems: 'start',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}
        >
          <div
            className="orion-panel muted"
            style={{
              display: 'grid',
              gap: 14,
              padding: 18,
              borderRadius: 18,
              margin: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {draft.photoUrl ? (
                <img
                  src={draft.photoUrl}
                  alt={draft.displayName}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '999px',
                    objectFit: 'cover',
                    border: '1px solid var(--border-subtle)',
                  }}
                />
              ) : (
                <div
                  className="orion-item-avatar is-accent"
                  style={{
                    width: 72,
                    height: 72,
                    fontSize: 22,
                    borderRadius: '999px',
                  }}
                >
                  {avatarLabel}
                </div>
              )}
              <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {draft.displayName || DEFAULT_PROFILE.displayName}
                </div>
                <div
                  className="orion-panel-copy"
                  style={{
                    margin: 0,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {effectiveEmail || 'No signed-in email available'}
                </div>
              </div>
            </div>
            <div className="orion-panel-copy" style={{ margin: 0 }}>
              This is what people see for your account identity inside the app.
            </div>
          </div>

          <div style={{ display: 'grid', gap: 16, width: '100%' }}>
            <div className="orion-field">
              <label className="orion-field-label" htmlFor="account-display-name">
                Display name
              </label>
              <input
                id="account-display-name"
                className="input"
                value={draft.displayName}
                onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
                placeholder="Account owner"
                style={{ height: 42, borderRadius: 12 }}
              />
            </div>

            <div className="orion-field">
              <label className="orion-field-label" htmlFor="account-email">
                Email
              </label>
              <input
                id="account-email"
                className="input"
                value={effectiveEmail}
                readOnly
                placeholder="No signed-in email available"
                style={{ height: 42, borderRadius: 12, opacity: 0.85 }}
              />
            </div>

            <div className="orion-field">
              <label className="orion-field-label" htmlFor="account-photo-url">
                Profile picture
              </label>
              <input
                id="account-photo-url"
                className="input"
                value={draft.photoUrl || ''}
                onChange={(event) => setDraft((current) => ({ ...current, photoUrl: event.target.value }))}
                placeholder="Optional image URL"
                style={{ height: 42, borderRadius: 12 }}
              />
              <div className="orion-panel-copy" style={{ margin: '6px 0 0' }}>
                Add an image URL if you want a custom avatar.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, paddingTop: 4 }}>
              {saveNotice ? <span className="orion-panel-copy">{saveNotice}</span> : null}
              <button className="orion-btn orion-btn-primary" onClick={persist}>
                Save
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
