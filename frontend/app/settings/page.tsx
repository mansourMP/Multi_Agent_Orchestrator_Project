'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, LogOut, Settings, UserRound } from 'lucide-react';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { MetricStrip } from '@/components/ui/MetricStrip';
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

  const loadConnectors = useCallback(async () => {
    if (!runtimeKey) {
      setConnectors([]);
      setLoading(false);
      setError('This app is not connected on this device yet. Open Connections to reconnect it.');
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

  const accountEmail = useMemo(() => {
    for (const connector of connectors) {
      const value = connectorIdentity(connector.metadata);
      if (value.includes('@')) return value;
    }
    return 'No email available';
  }, [connectors]);

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

  return (
    <div className="orion-page-shell narrow orion-animate-in">
      <OsPageHeader
        icon={<Settings size={18} />}
        title="Settings"
        subtitle="Account details, connected tools, and sign out."
        meta={
          <>
            <span>{connectedCount} connected</span>
            <span>{profile.roleLabel}</span>
          </>
        }
        actions={
          <button className="orion-btn orion-btn-ghost" onClick={handleSignOut} disabled={signingOut}>
            <LogOut size={14} />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        }
      />

      <MetricStrip
        items={[
          { label: 'Connections', value: String(connectedCount) },
          { label: 'Account', value: profile.displayName },
          { label: 'Email', value: accountEmail },
        ]}
        minWidth={180}
      />

      <section className="orion-panel">
        <div className="orion-panel-header">
          <div>
            <div className="orion-panel-title">Connected tools</div>
            <div className="orion-panel-copy">The accounts currently available to your assistant and automations.</div>
          </div>
        </div>

        {loading ? (
          <div className="orion-empty" style={{ minHeight: 160 }}>
            <div className="orion-empty-title">Loading connectors…</div>
          </div>
        ) : error ? (
          <div className="orion-empty" style={{ minHeight: 160 }}>
            <div className="orion-empty-title">Could not load connected tools</div>
            <div className="orion-empty-copy">{error}</div>
          </div>
        ) : connectors.length === 0 ? (
          <div className="orion-empty" style={{ minHeight: 160 }}>
            <div className="orion-empty-title">No connected tools yet</div>
            <div className="orion-empty-copy">Open Connections to add Google Workspace, Telegram, or another account.</div>
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
                    <span className="orion-chip">{status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="orion-panel">
        <div className="orion-panel-header">
          <div>
            <div className="orion-panel-title">Account info</div>
            <div className="orion-panel-copy">Basic profile details stored on this device.</div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <div className="orion-list-row">
            <div className="orion-list-row-main">
              <div className="orion-list-row-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <UserRound size={14} />
                Name
              </div>
              <div className="orion-list-row-subtitle">{profile.displayName}</div>
            </div>
          </div>
          <div className="orion-list-row">
            <div className="orion-list-row-main">
              <div className="orion-list-row-title">Email</div>
              <div className="orion-list-row-subtitle">{accountEmail}</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
