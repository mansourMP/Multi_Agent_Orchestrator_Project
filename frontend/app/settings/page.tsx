'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, LogOut } from 'lucide-react';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { ORION_API_URL } from '../page.api';
import { readRuntimeApiKeyFromStorage, writeRuntimeApiKeyToStorage } from '@/lib/runtimeKey';

const ACCOUNT_STORAGE_KEY = 'empyralis_account_profile_v1';

type ConnectorRow = {
  id: string;
  label: string;
  connector: string;
  metadata: Record<string, unknown>;
};

type AccountProfile = {
  displayName: string;
  email?: string;
  roleLabel: string;
};

const DEFAULT_PROFILE: AccountProfile = {
  displayName: 'Account owner',
  roleLabel: 'Primary account',
};

function loadStoredProfile(): AccountProfile {
  if (typeof window === 'undefined') return DEFAULT_PROFILE;
  try {
    const raw = window.localStorage.getItem(ACCOUNT_STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const saved = JSON.parse(raw) as Partial<AccountProfile>;
    return {
      displayName: typeof saved.displayName === 'string' && saved.displayName.trim() ? saved.displayName.trim() : DEFAULT_PROFILE.displayName,
      email: typeof saved.email === 'string' && saved.email.trim() ? saved.email.trim() : '',
      roleLabel: typeof saved.roleLabel === 'string' && saved.roleLabel.trim() ? saved.roleLabel.trim() : DEFAULT_PROFILE.roleLabel,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

function connectorIdentity(metadata: Record<string, unknown>): string {
  return String(
    metadata.emailAddress ||
      metadata.email ||
      metadata.userPrincipalName ||
      metadata.chat_id ||
      metadata.channel_id ||
      metadata.from_number ||
      '',
  ).trim();
}

function connectorDisplayStatus(metadata: Record<string, unknown>): string {
  return metadata.paused === true ? 'Paused' : 'Connected';
}

export default function SettingsPage() {
  const router = useRouter();
  const [connectors, setConnectors] = useState<ConnectorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const runtimeKey = useMemo(() => readRuntimeApiKeyFromStorage(''), []);
  const profile = useMemo(() => loadStoredProfile(), []);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [email, setEmail] = useState(profile.email || '');
  const [saveNotice, setSaveNotice] = useState('');

  const loadConnectors = useCallback(async () => {
    if (!runtimeKey) {
      setConnectors([]);
      setLoading(false);
      setError('This app is not connected on this device yet. Open Integrations to reconnect it.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${ORION_API_URL}/connectors/vault?workspace_id=default`, {
        headers: { 'X-API-Key': runtimeKey },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(body?.detail || body?.message || 'Failed to load connectors.'));
      }
      const items: unknown[] = Array.isArray(body?.items) ? body.items : [];
      const next = items
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => ({
          id: String(item.id || ''),
          label: String(item.label || 'Untitled connector'),
          connector: String(item.connector || ''),
          metadata: item.metadata && typeof item.metadata === 'object' ? (item.metadata as Record<string, unknown>) : {},
        }))
        .filter((item) => item.id && item.connector);
      setConnectors(next);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load connectors.');
    } finally {
      setLoading(false);
    }
  }, [runtimeKey]);

  useEffect(() => {
    void loadConnectors();
  }, [loadConnectors]);

  const connectedCount = connectors.filter((item) => item.metadata.paused !== true).length;

  const handleSignOut = useCallback(() => {
    setSigningOut(true);
    try {
      writeRuntimeApiKeyToStorage('');
      window.localStorage.removeItem(ACCOUNT_STORAGE_KEY);
      router.replace('/setup');
    } finally {
      setSigningOut(false);
    }
  }, [router]);

  const handleSaveProfile = useCallback(() => {
    const nextProfile: AccountProfile = {
      displayName: displayName.trim() || DEFAULT_PROFILE.displayName,
      email: email.trim(),
      roleLabel: profile.roleLabel,
    };
    window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(nextProfile));
    setSaveNotice('Saved');
    window.setTimeout(() => setSaveNotice(''), 1600);
  }, [displayName, email, profile.roleLabel]);

  return (
    <div className="orion-page-shell orion-animate-in">
      <OsPageHeader
        icon={null}
        title="Settings"
        subtitle="Manage your workspace and account."
        meta={
          <>
            <span>{connectedCount} connected</span>
            <span>{profile.roleLabel}</span>
          </>
        }
      />

      <section className="orion-panel">
        <div className="orion-panel-header">
          <div>
            <div className="orion-panel-title">Account</div>
            <div className="orion-panel-copy">Workspace owner details stored on this device.</div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <label style={{ display: 'grid', gap: 8 }}>
            <span className="orion-panel-copy" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Name</span>
            <input className="orion-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            <span className="orion-panel-copy" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Email</span>
            <input
              className="orion-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="No email available"
            />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center' }}>
            {saveNotice ? <span className="orion-panel-copy">{saveNotice}</span> : null}
            <button type="button" className="btn-primary" onClick={handleSaveProfile}>
              Save
            </button>
          </div>
        </div>
      </section>

      <section className="orion-panel">
        <div className="orion-panel-header">
          <div>
            <div className="orion-panel-title">Connected tools</div>
            <div className="orion-panel-copy">The accounts currently available to your agents and workflows.</div>
          </div>
        </div>

        {loading ? (
          <div className="orion-empty" style={{ minHeight: 160 }}>
            <div className="orion-empty-title">Loading connected tools…</div>
          </div>
        ) : error ? (
          <div className="orion-empty" style={{ minHeight: 160, alignItems: 'center' }}>
            <div className="orion-empty-title">Couldn't load connected tools</div>
            <div className="orion-empty-copy">{error}</div>
            <button type="button" className="btn-secondary" onClick={() => void loadConnectors()}>
              Retry
            </button>
          </div>
        ) : connectors.length === 0 ? (
          <div className="orion-empty" style={{ minHeight: 160 }}>
            <div className="orion-empty-title">No connected tools yet</div>
            <div className="orion-empty-copy">Open Integrations to add Google Workspace, Telegram, or another account.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {connectors.map((connector) => {
              const status = connectorDisplayStatus(connector.metadata);
              const identity = connectorIdentity(connector.metadata);
              return (
                <div key={connector.id} className="orion-list-row">
                  <div className="orion-list-row-main">
                    <div className="orion-list-row-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <KeyRound size={14} />
                      {connector.label}
                    </div>
                    <div className="orion-list-row-subtitle">
                      {identity || 'Shared access'}
                    </div>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span className="orion-chip">{connector.connector.replace(/_/g, ' ')}</span>
                    <span className="orion-chip" data-status-tone={status === 'Connected' ? 'green' : 'grey'}>{status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="orion-panel" style={{ borderColor: 'var(--status-red)', background: 'var(--status-red-bg)' }}>
        <div className="orion-panel-header">
          <div>
            <div className="orion-panel-title">Danger zone</div>
            <div className="orion-panel-copy">Sign out from this device and clear local workspace settings.</div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <button className="btn-secondary" onClick={handleSignOut} disabled={signingOut}>
            <LogOut size={14} />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </section>
    </div>
  );
}
