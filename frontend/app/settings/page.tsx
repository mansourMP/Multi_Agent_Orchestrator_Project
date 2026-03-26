'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, LogOut } from 'lucide-react';
import { PageHero } from '@/components/orion/page/PageHero';
import { PageHeroCard } from '@/components/orion/page/PageHeroCard';
import { PageSection } from '@/components/orion/page/PageSection';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import { RUNTIME_KEY_STORAGE_CANDIDATES } from '@/lib/runtimeKey';

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
  const profile = useMemo(() => loadStoredProfile(), []);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [email, setEmail] = useState(profile.email || '');
  const [saveNotice, setSaveNotice] = useState('');

  const loadConnectors = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await ensureControlPlaneSession();
      const res = await fetch('/api/control-plane/connectors?workspace_id=default', { cache: 'no-store' });
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
  }, []);

  useEffect(() => {
    void loadConnectors();
  }, [loadConnectors]);

  const connectedCount = connectors.filter((item) => item.metadata.paused !== true).length;

  const handleSignOut = useCallback(() => {
    setSigningOut(true);
    try {
      for (const key of RUNTIME_KEY_STORAGE_CANDIDATES) {
        window.sessionStorage.removeItem(key);
        window.localStorage.removeItem(key);
      }
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
      <PageHero
        kicker="Settings"
        title="Manage your workspace, account, and connected tool access."
        copy="Use this page for device-level account details and a quick view of the shared tools available to your agents."
        aside={
          <>
            <PageHeroCard label="Workspace account">
              <div className="orion-home-side-stats">
                <div>
                  <div className="orion-home-side-value">{connectedCount}</div>
                  <div className="orion-home-side-note">Connected tools</div>
                </div>
                <div>
                  <div className="orion-home-side-value">{profile.roleLabel}</div>
                  <div className="orion-home-side-note">Account role</div>
                </div>
              </div>
            </PageHeroCard>
          </>
        }
      />

      <PageSection title="Account" description="Workspace owner details stored on this device.">
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
      </PageSection>

      <PageSection title="Connected tools" description="The accounts currently available to your agents and workflows.">

        {loading ? (
          <PageStatePanel variant="loading" title="Loading connected tools…" />
        ) : error ? (
          <PageStatePanel
            variant="error"
            title="Couldn't load connected tools"
            copy={error}
            actions={
              <button type="button" className="orion-btn" onClick={() => void loadConnectors()}>
                Retry
              </button>
            }
          />
        ) : connectors.length === 0 ? (
          <PageStatePanel
            variant="empty"
            title="No connected tools yet"
            copy="Open Integrations to add Google Workspace, Telegram, or another account."
          />
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
      </PageSection>

      <PageSection
        title="Danger zone"
        description="Sign out from this device and clear local workspace settings."
      >
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <button className="orion-btn orion-btn-danger" onClick={handleSignOut} disabled={signingOut}>
            <LogOut size={14} />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </PageSection>
    </div>
  );
}
