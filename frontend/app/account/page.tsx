'use client';

import { useState, useSyncExternalStore } from 'react';
import { FolderRoot, Settings, ShieldCheck, UserRound } from 'lucide-react';
import Link from 'next/link';
import { MetricStrip } from '@/components/ui/MetricStrip';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { API_BASE } from '@/lib/config';
import { readRuntimeApiKeyFromStorage } from '@/lib/runtimeKey';

const STORAGE_KEY = 'empyralis_account_profile_v1';

type AccountProfile = {
  displayName: string;
  roleLabel: string;
};

const DEFAULT_PROFILE: AccountProfile = {
  displayName: 'Workspace Owner',
  roleLabel: 'Local operator',
};

function loadStoredProfile(): AccountProfile {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const saved = JSON.parse(raw) as Partial<AccountProfile>;
    return {
      displayName: typeof saved.displayName === 'string' && saved.displayName.trim() ? saved.displayName.trim() : DEFAULT_PROFILE.displayName,
      roleLabel: typeof saved.roleLabel === 'string' && saved.roleLabel.trim() ? saved.roleLabel.trim() : DEFAULT_PROFILE.roleLabel,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export default function AccountPage() {
  const subscribe = () => () => {};
  const profile = useSyncExternalStore(subscribe, loadStoredProfile, () => DEFAULT_PROFILE);
  const runtimeKeyPresent = useSyncExternalStore(
    subscribe,
    () => readRuntimeApiKeyFromStorage('')?.trim().length > 0,
    () => false,
  );
  const [draft, setDraft] = useState<AccountProfile>(DEFAULT_PROFILE);
  const [draftDirty, setDraftDirty] = useState(false);
  const runtimeUrl = API_BASE;
  const effectiveDraft = draftDirty ? draft : profile;

  const persist = () => {
    const next = {
      displayName: effectiveDraft.displayName.trim() || DEFAULT_PROFILE.displayName,
      roleLabel: effectiveDraft.roleLabel.trim() || DEFAULT_PROFILE.roleLabel,
    };
    setDraft(next);
    setDraftDirty(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  };

  return (
    <div className="orion-page-shell narrow orion-animate-in">
      <OsPageHeader
        icon={<UserRound size={18} />}
        title="Account"
        subtitle="Profile and workspace identity."
        meta={
          <>
            <span>{profile.roleLabel}</span>
            <span>default workspace</span>
          </>
        }
        actions={
          <Link href="/settings" className="orion-btn orion-btn-ghost" style={{ minHeight: 34, paddingInline: 12 }}>
            <Settings size={13} />
            Settings
          </Link>
        }
      />

      <MetricStrip
        items={[
          { label: 'Profile', value: profile.displayName },
          { label: 'Workspace', value: 'default' },
          { label: 'Runtime key', value: runtimeKeyPresent ? 'Connected' : 'Missing' },
        ]}
        minWidth={180}
      />

      <section className="orion-panel">
        <div className="orion-panel-header">
          <div>
            <div className="orion-panel-title">Profile</div>
            <div className="orion-panel-copy">What the workspace should call you in this local environment.</div>
          </div>
        </div>

        <div className="orion-field">
          <label className="orion-field-label" htmlFor="account-display-name">
            Display Name
          </label>
          <input
            id="account-display-name"
            className="input"
            value={effectiveDraft.displayName}
            onChange={(event) => {
              setDraft((prev) => ({ ...(draftDirty ? prev : profile), displayName: event.target.value }));
              setDraftDirty(true);
            }}
            placeholder="Workspace Owner"
            style={{ height: 40, borderRadius: 10 }}
          />
        </div>

        <div className="orion-field">
          <label className="orion-field-label" htmlFor="account-role-label">
            Role Label
          </label>
          <input
            id="account-role-label"
            className="input"
            value={effectiveDraft.roleLabel}
            onChange={(event) => {
              setDraft((prev) => ({ ...(draftDirty ? prev : profile), roleLabel: event.target.value }));
              setDraftDirty(true);
            }}
            placeholder="Local operator"
            style={{ height: 40, borderRadius: 10 }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
          <button className="orion-btn orion-btn-primary" onClick={persist}>
            Save Profile
          </button>
        </div>
      </section>

      <section className="orion-panel">
        <div className="orion-panel-header">
          <div>
            <div className="orion-panel-title">Workspace</div>
            <div className="orion-panel-copy">Current local runtime and workspace identity for this app instance.</div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <div className="orion-list-row" style={{ paddingInline: 0, border: 'none', background: 'transparent' }}>
            <div className="orion-list-row-main">
              <div className="orion-list-row-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <FolderRoot size={14} />
                Workspace
              </div>
              <div className="orion-list-row-subtitle">default</div>
            </div>
          </div>

          <div className="orion-list-row" style={{ paddingInline: 0, border: 'none', background: 'transparent' }}>
            <div className="orion-list-row-main">
              <div className="orion-list-row-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={14} />
                Runtime endpoint
              </div>
              <div className="orion-list-row-subtitle" style={{ fontFamily: 'var(--font-mono)' }}>
                {runtimeUrl}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
