'use client';

import { FormEvent, useMemo, useState } from 'react';
import { AlertTriangle, KeyRound, Link2, ShieldCheck, Unplug } from 'lucide-react';

type AuthProviders = {
  email: { enabled: boolean };
  google: { enabled: boolean };
  apple: { enabled: boolean };
};

type SignInMethod = {
  id: string;
  method: string;
  provider: string;
  kind: 'password' | 'oauth' | 'sso';
  label: string;
  status: 'active' | 'disconnected';
  is_primary: boolean;
  can_disconnect: boolean;
  disconnect_reason: string | null;
};

type AccountAccess = {
  account_owner: string;
  email: string | null;
  sign_in_methods: SignInMethod[];
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

type ProviderConnection = {
  id: string;
  provider: string;
  label: string;
  health: string;
  enabled: boolean;
  model?: string | null;
};

type AccountAccessPanelProps = {
  access: AccountAccess | null;
  authProviders: AuthProviders;
  providerConnections: ProviderConnection[];
  loading?: boolean;
  error?: string;
  actionBusy?: string | null;
  passwordBusy?: boolean;
  onDisconnectMethod: (method: string) => Promise<void>;
  onAddPassword: (password: string) => Promise<void>;
};

function providerLabel(provider: string): string {
  const normalized = String(provider || '').trim().toLowerCase();
  switch (normalized) {
    case 'openai':
      return 'OpenAI';
    case 'anthropic':
      return 'Anthropic';
    case 'gemini':
      return 'Google Gemini';
    case 'vertex':
      return 'Vertex AI';
    case 'deepseek':
      return 'DeepSeek';
    case 'qwen':
      return 'Qwen';
    case 'mistral':
      return 'Mistral';
    case 'ollama':
      return 'Ollama';
    default:
      return normalized.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase()) || 'Provider';
  }
}

export default function AccountAccessPanel({
  access,
  authProviders,
  providerConnections,
  loading = false,
  error = '',
  actionBusy = null,
  passwordBusy = false,
  onDisconnectMethod,
  onAddPassword,
}: AccountAccessPanelProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');

  const openAiConnected = useMemo(
    () => providerConnections.some((item) => String(item.provider || '').trim().toLowerCase() === 'openai'),
    [providerConnections],
  );

  if (loading) {
    return <div className="orion-panel-copy">Loading account access…</div>;
  }

  if (error) {
    return <div className="orion-panel-copy" style={{ color: 'var(--error-fg)' }}>{error}</div>;
  }

  if (!access) {
    return <div className="orion-panel-copy">No account access data is available.</div>;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    if (password.length < 8) {
      setFormError('Use at least 8 characters for the backup password.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords must match.');
      return;
    }
    await onAddPassword(password);
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="orion-panel muted" style={{ display: 'grid', gap: 10, margin: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={15} />
          <div className="orion-panel-title" style={{ fontSize: 14 }}>Empyralis account ownership</div>
        </div>
        <div className="orion-panel-copy" style={{ margin: 0 }}>
          {access.messaging.account_owner}
        </div>
        <div className="orion-panel-copy" style={{ margin: 0 }}>
          {access.messaging.provider_boundary}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="orion-chip">{access.summary.active_sign_in_method_count} active sign-in method{access.summary.active_sign_in_method_count === 1 ? '' : 's'}</span>
          <span className="orion-chip" data-status-tone={access.summary.has_backup_sign_in_method ? 'green' : 'amber'}>
            {access.summary.has_backup_sign_in_method ? 'Recovery protected' : 'Recovery needs attention'}
          </span>
          {access.summary.has_password ? <span className="orion-chip">Password backup active</span> : null}
        </div>
      </div>

      {access.recovery.warnings.length > 0 ? (
        <div
          className="orion-panel muted"
          style={{
            display: 'grid',
            gap: 10,
            margin: 0,
            borderColor: 'var(--warning-border)',
            background: 'color-mix(in srgb, var(--warning-bg) 84%, var(--bg-surface) 16%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--warning-fg)' }}>
            <AlertTriangle size={15} />
            <div className="orion-panel-title" style={{ fontSize: 14 }}>Recovery guidance</div>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {access.recovery.warnings.map((warning) => (
              <div key={warning} className="orion-panel-copy" style={{ margin: 0, color: 'var(--warning-fg)' }}>
                {warning}
              </div>
            ))}
          </div>
          {openAiConnected ? (
            <div className="orion-panel-copy" style={{ margin: 0, color: 'var(--warning-fg)' }}>
              OpenAI is connected here for capability, but it should not be the only way back into this account.
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 10 }}>
        {access.sign_in_methods.map((method) => (
          <div key={method.id} className="orion-list-row">
            <div className="orion-list-row-main">
              <div className="orion-list-row-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <KeyRound size={14} />
                {method.label}
              </div>
              <div className="orion-list-row-subtitle">
                {method.status === 'active'
                  ? method.is_primary
                    ? 'Primary sign-in method'
                    : 'Available as an additional sign-in method'
                  : 'Disconnected from account sign-in'}
              </div>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span className="orion-chip">{method.kind}</span>
              <span className="orion-chip" data-status-tone={method.status === 'active' ? 'green' : 'grey'}>
                {method.status}
              </span>
              {method.status === 'active' ? (
                <button
                  type="button"
                  className="orion-btn orion-btn-secondary"
                  disabled={!method.can_disconnect || actionBusy === method.method}
                  onClick={() => void onDisconnectMethod(method.method)}
                  title={method.disconnect_reason || 'Disconnect this sign-in method'}
                  style={{ minHeight: 40, paddingInline: 12 }}
                >
                  <Unplug size={14} />
                  {actionBusy === method.method ? 'Updating…' : 'Disconnect'}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {!access.summary.has_password ? (
        <form onSubmit={handleSubmit} className="orion-panel muted" style={{ display: 'grid', gap: 12, margin: 0 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <div className="orion-panel-title" style={{ fontSize: 14 }}>Add email + password backup</div>
            <div className="orion-panel-copy" style={{ margin: 0 }}>
              Add a recovery-safe sign-in method that stays with your Empyralis account even if a provider session changes.
            </div>
          </div>
          <div className="orion-field">
            <label className="orion-field-label" htmlFor="account-backup-password">New password</label>
            <input
              id="account-backup-password"
              type="password"
              className="input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              style={{ height: 44 }}
            />
          </div>
          <div className="orion-field">
            <label className="orion-field-label" htmlFor="account-backup-password-confirm">Confirm password</label>
            <input
              id="account-backup-password-confirm"
              type="password"
              className="input"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat the password"
              style={{ height: 44 }}
            />
          </div>
          {formError ? <div className="orion-panel-copy" style={{ margin: 0, color: 'var(--error-fg)' }}>{formError}</div> : null}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button type="submit" className="orion-btn orion-btn-primary" disabled={passwordBusy}>
              {passwordBusy ? 'Saving backup…' : 'Add password backup'}
            </button>
            <div className="orion-panel-copy" style={{ margin: 0 }}>
              {authProviders.google.enabled || authProviders.apple.enabled
                ? 'Google and Apple can stay available as additional sign-in methods, but the password backup gives you a provider-independent recovery path.'
                : 'A password backup gives you a provider-independent recovery path.'}
            </div>
          </div>
        </form>
      ) : null}

      <div className="orion-panel muted" style={{ display: 'grid', gap: 12, margin: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link2 size={15} />
          <div className="orion-panel-title" style={{ fontSize: 14 }}>Connected AI providers</div>
        </div>
        <div className="orion-panel-copy" style={{ margin: 0 }}>
          Provider connections add model capability only. Disconnecting a provider should never be confused with deleting your Empyralis account.
        </div>
        {providerConnections.length === 0 ? (
          <div className="orion-panel-copy" style={{ margin: 0 }}>
            No AI providers are connected yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {providerConnections.map((provider) => (
              <div key={provider.id} className="orion-list-row">
                <div className="orion-list-row-main">
                  <div className="orion-list-row-title">{provider.label || providerLabel(provider.provider)}</div>
                  <div className="orion-list-row-subtitle">
                    {provider.model ? `${providerLabel(provider.provider)} · ${provider.model}` : providerLabel(provider.provider)}
                  </div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span className="orion-chip">{providerLabel(provider.provider)}</span>
                  <span className="orion-chip" data-status-tone={provider.health === 'healthy' ? 'green' : provider.health === 'cooldown' ? 'amber' : 'grey'}>
                    {provider.health.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
