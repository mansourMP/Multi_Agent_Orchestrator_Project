'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Settings, UserRound } from 'lucide-react';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import {
  displayNameFromEmail,
  readAccountProfilePreferences,
  writeAccountProfilePreferences,
  type AccountProfilePreferences,
} from '@/lib/accountProfile';

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
  const [draft, setDraft] = useState<AccountProfile>(DEFAULT_PROFILE);
  const [authEmail, setAuthEmail] = useState('');
  const [saveNotice, setSaveNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadIdentity() {
      try {
        const response = await fetch('/api/control-plane/auth/me', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Profile lookup failed.');
        }
        const payload = (await response.json().catch(() => null)) as {
          user?: { email?: string | null; name?: string | null; avatar_url?: string | null } | null;
        } | null;
        if (cancelled) return;
        if (!payload?.user) {
          throw new Error('Profile lookup failed.');
        }
        const email = String(payload?.user?.email || '').trim();
        setAuthEmail(email);
        const name = String(payload?.user?.name || '').trim();
        const avatarUrl = String(payload?.user?.avatar_url || '').trim();
        setDraft({
          displayName: name || displayNameFromEmail(email, DEFAULT_PROFILE.displayName),
          email,
          photoUrl: avatarUrl,
        });
      } catch {
        if (cancelled) return;
        const stored = readAccountProfilePreferences();
        setDraft({
          displayName: stored.displayName || DEFAULT_PROFILE.displayName,
          email: '',
          photoUrl: stored.photoUrl,
        });
      }
    }
    void loadIdentity();
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveEmail = authEmail || draft.email || '';
  const effectiveDisplayName = draft.displayName.trim() || displayNameFromEmail(effectiveEmail, DEFAULT_PROFILE.displayName);
  const avatarLabel = useMemo(() => initialsForName(effectiveDisplayName), [effectiveDisplayName]);

  const persist = useCallback(async () => {
    const next: AccountProfile = {
      displayName: draft.displayName.trim() || displayNameFromEmail(effectiveEmail, DEFAULT_PROFILE.displayName),
      email: effectiveEmail,
      photoUrl: draft.photoUrl?.trim() || '',
    };
    try {
      const response = await fetch('/api/control-plane/auth/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: next.displayName,
          avatar_url: next.photoUrl || '',
        }),
      });
      if (!response.ok) {
        throw new Error('Profile update failed.');
      }
      const payload = (await response.json().catch(() => null)) as {
        user?: { email?: string | null; name?: string | null; avatar_url?: string | null } | null;
      } | null;
      const savedEmail = String(payload?.user?.email || next.email || '').trim();
      const savedName = String(payload?.user?.name || next.displayName || '').trim()
        || displayNameFromEmail(savedEmail, DEFAULT_PROFILE.displayName);
      const savedAvatarUrl = String(payload?.user?.avatar_url || next.photoUrl || '').trim();
      setAuthEmail(savedEmail);
      setDraft({
        displayName: savedName,
        email: savedEmail,
        photoUrl: savedAvatarUrl,
      });
      setSaveNotice('Saved');
    } catch {
      setDraft(next);
      writeAccountProfilePreferences({
        displayName: next.displayName,
        photoUrl: next.photoUrl || '',
      } satisfies AccountProfilePreferences);
      setSaveNotice('Saved locally');
    }
    window.setTimeout(() => setSaveNotice(''), 1600);
  }, [draft, effectiveEmail]);

  return (
    <div className="orion-page-shell narrow orion-animate-in">
      <OsPageHeader
        icon={<UserRound size={18} />}
        title="Profile"
        subtitle="Manage your account details."
        actions={
          <Link href="/settings" className="orion-btn orion-btn-ghost" style={{ minHeight: 44, paddingInline: 12 }}>
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
                  {effectiveDisplayName}
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
                style={{ height: 44, borderRadius: 12 }}
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
                style={{ height: 44, borderRadius: 12, opacity: 0.85 }}
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
                style={{ height: 44, borderRadius: 12 }}
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
