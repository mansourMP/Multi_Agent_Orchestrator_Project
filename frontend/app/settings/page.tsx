'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Cpu, KeyRound, LogOut, UserRound } from 'lucide-react';
import AccountAccessPanel from '@/components/orion/auth/AccountAccessPanel';
import { PageHero } from '@/components/orion/page/PageHero';
import { PageHeroCard } from '@/components/orion/page/PageHeroCard';
import { PageSection } from '@/components/orion/page/PageSection';
import { PageStatePanel } from '@/components/orion/page/PageStatePanel';
import { displayNameFromEmail } from '@/lib/accountProfile';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';
import { RUNTIME_KEY_STORAGE_CANDIDATES } from '@/lib/runtimeKey';

type ConnectorRow = {
  id: string;
  label: string;
  connector: string;
  metadata: Record<string, unknown>;
};

type AuthProviders = {
  email: { enabled: boolean };
  google: { enabled: boolean };
  apple: { enabled: boolean };
};

type AccountAccess = {
  account_owner: string;
  email: string | null;
  sign_in_methods: Array<{
    id: string;
    method: string;
    provider: string;
    kind: 'password' | 'oauth' | 'sso';
    label: string;
    status: 'active' | 'disconnected';
    is_primary: boolean;
    can_disconnect: boolean;
    disconnect_reason: string | null;
  }>;
  summary: {
    active_sign_in_method_count: number;
    has_password: boolean;
    has_backup_sign_in_method: boolean;
  };
  recovery: {
    state: 'protected' | 'action_required';
    warnings: string[];
    recommended_actions: string[];
  };
  messaging: {
    account_owner: string;
    provider_boundary: string;
    unlink_safety: string;
  };
};

type ProviderProfileConnection = {
  id: string;
  provider: string;
  label: string;
  health: string;
  enabled: boolean;
  model?: string | null;
};

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
  const [profileEmail, setProfileEmail] = useState('');
  const [accountAccess, setAccountAccess] = useState<AccountAccess | null>(null);
  const [authProviders, setAuthProviders] = useState<AuthProviders>({
    email: { enabled: true },
    google: { enabled: false },
    apple: { enabled: false },
  });
  const [providerConnections, setProviderConnections] = useState<ProviderProfileConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [accessNotice, setAccessNotice] = useState('');
  const [accessBusyMethod, setAccessBusyMethod] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const profileName = useMemo(() => displayNameFromEmail(profileEmail), [profileEmail]);

  const loadConnectors = useCallback(async () => {
    setLoading(true);
    setError('');
    setAccessError('');
    try {
      await ensureControlPlaneSession();
      const [connectorsRes, authRes, accessRes, authProvidersRes, providerProfilesRes] = await Promise.all([
        fetch('/api/control-plane/connectors?workspace_id=default', { cache: 'no-store' }),
        fetch('/api/control-plane/auth/me', { cache: 'no-store' }),
        fetch('/api/control-plane/auth/access', { cache: 'no-store' }),
        fetch('/api/control-plane/auth/providers', { cache: 'no-store' }),
        fetch('/api/control-plane/providers/profiles/health?workspace_id=default', { cache: 'no-store' }),
      ]);
      const connectorsBody = await connectorsRes.json().catch(() => ({}));
      const authBody = await authRes.json().catch(() => ({}));
      const accessBody = await accessRes.json().catch(() => ({}));
      const authProvidersBody = await authProvidersRes.json().catch(() => ({}));
      const providerProfilesBody = await providerProfilesRes.json().catch(() => ({}));
      if (!connectorsRes.ok) {
        throw new Error(String(connectorsBody?.detail || connectorsBody?.message || 'Failed to load connectors.'));
      }
      if (!authRes.ok) {
        throw new Error(String(authBody?.detail || authBody?.message || 'Failed to load account profile.'));
      }
      if (!accessRes.ok) {
        throw new Error(String(accessBody?.detail || accessBody?.message || 'Failed to load account access.'));
      }
      const items: unknown[] = Array.isArray(connectorsBody?.items) ? connectorsBody.items : [];
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
      setProfileEmail(String(authBody?.user?.email || '').trim());
      setAccountAccess(accessBody as AccountAccess);
      setAuthProviders({
        email: { enabled: Boolean(authProvidersBody?.email?.enabled ?? true) },
        google: { enabled: Boolean(authProvidersBody?.google?.enabled) },
        apple: { enabled: Boolean(authProvidersBody?.apple?.enabled) },
      });
      const providerItems: unknown[] = Array.isArray(providerProfilesBody?.items) ? providerProfilesBody.items : [];
      setProviderConnections(
        providerItems
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
          .map((item) => ({
            id: String(item.id || ''),
            provider: String(item.provider || '').trim().toLowerCase(),
            label: String(item.label || '').trim() || 'Connected provider',
            health: String(item.health || 'disabled').trim().toLowerCase() || 'disabled',
            enabled: Boolean(item.enabled),
            model: String(item.model || '').trim() || null,
          }))
          .filter((item) => item.id && item.provider),
      );
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : 'Failed to load connectors.';
      setError(message);
      setAccessError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnectors();
  }, [loadConnectors]);

  const connectedCount = connectors.filter((item) => item.metadata.paused !== true).length;
  const activeSignInCount = accountAccess?.summary.active_sign_in_method_count || 0;
  const connectedProviderCount = providerConnections.filter((item) => item.enabled).length;

  const handleDisconnectMethod = useCallback(async (method: string) => {
    setAccessBusyMethod(method);
    setAccessError('');
    setAccessNotice('');
    try {
      const response = await fetch(`/api/control-plane/auth/access/methods/${encodeURIComponent(method)}/disconnect`, {
        method: 'POST',
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(body?.detail || body?.message || 'Failed to disconnect sign-in method.'));
      }
      setAccountAccess(body as AccountAccess);
      setAccessNotice('Sign-in method updated.');
    } catch (actionError) {
      setAccessError(actionError instanceof Error ? actionError.message : 'Failed to disconnect sign-in method.');
    } finally {
      setAccessBusyMethod(null);
    }
  }, []);

  const handleAddPassword = useCallback(async (password: string) => {
    setPasswordBusy(true);
    setAccessError('');
    setAccessNotice('');
    try {
      const response = await fetch('/api/control-plane/auth/access/password', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(body?.detail || body?.message || 'Failed to add password backup.'));
      }
      setAccountAccess(body as AccountAccess);
      setAccessNotice('Password backup saved.');
    } catch (actionError) {
      setAccessError(actionError instanceof Error ? actionError.message : 'Failed to add password backup.');
    } finally {
      setPasswordBusy(false);
    }
  }, []);

  const handleSignOut = useCallback(() => {
    setSigningOut(true);
    try {
      for (const key of RUNTIME_KEY_STORAGE_CANDIDATES) {
        window.sessionStorage.removeItem(key);
        window.localStorage.removeItem(key);
      }
      router.replace('/setup');
    } finally {
      setSigningOut(false);
    }
  }, [router]);

  return (
    <div className="orion-page-shell orion-animate-in">
      <PageHero
        kicker="Settings"
        title="Manage your workspace, account, and connected tool access."
        copy="Use this page for device-level account details and a quick view of the shared tools available to your agents."
      />

      <section style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
        <PageHeroCard label="Workspace account">
          <div className="orion-home-side-stats">
            <div>
              <div className="orion-home-side-value">{connectedCount}</div>
              <div className="orion-home-side-note">Connected tools</div>
            </div>
            <div>
              <div className="orion-home-side-value">{profileName}</div>
              <div className="orion-home-side-note">Profile</div>
            </div>
            <div>
              <div className="orion-home-side-value">{activeSignInCount}</div>
              <div className="orion-home-side-note">Sign-in methods</div>
            </div>
            <div>
              <div className="orion-home-side-value">{connectedProviderCount}</div>
              <div className="orion-home-side-note">AI providers</div>
            </div>
          </div>
        </PageHeroCard>
      </section>

      <PageSection title="Profile" description="Open profile details and account preferences.">
        <div className="orion-list-row">
          <div className="orion-list-row-main">
            <div className="orion-list-row-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <UserRound size={14} />
              {profileName}
            </div>
            <div className="orion-list-row-subtitle">
              {profileEmail || 'No signed-in email available'}
            </div>
          </div>
          <Link href="/account" className="orion-btn orion-btn-secondary" style={{ minHeight: 44, paddingInline: 14 }}>
            Open profile
          </Link>
        </div>
      </PageSection>

      <PageSection title="Machines" description="Open local machine status and runtime controls.">
        <div className="orion-list-row">
          <div className="orion-list-row-main">
            <div className="orion-list-row-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Cpu size={14} />
              Local machine and runtime
            </div>
            <div className="orion-list-row-subtitle">
              Inspect availability, queue pressure, and runtime capability state.
            </div>
          </div>
          <Link href="/machines" className="orion-btn orion-btn-secondary" style={{ minHeight: 44, paddingInline: 14 }}>
            Open machines
          </Link>
        </div>
      </PageSection>

      <PageSection
        title="Account access"
        description="Manage Empyralis sign-in methods here, then connect OpenAI or other AI providers separately."
      >
        {accessNotice ? <div className="orion-panel-copy" style={{ marginBottom: 10 }}>{accessNotice}</div> : null}
        <div className="orion-panel-copy" style={{ marginBottom: 10 }}>
          OpenAI remains a linked provider capability, not the owner of this Empyralis account.{' '}
          <Link href="/credentials">Connect or manage providers</Link>.
        </div>
        <AccountAccessPanel
          access={accountAccess}
          authProviders={authProviders}
          providerConnections={providerConnections}
          loading={loading}
          error={accessError}
          actionBusy={accessBusyMethod}
          passwordBusy={passwordBusy}
          onDisconnectMethod={handleDisconnectMethod}
          onAddPassword={handleAddPassword}
        />
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
