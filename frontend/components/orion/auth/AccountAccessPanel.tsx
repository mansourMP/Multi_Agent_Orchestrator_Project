'use client';

import { FormEvent, useMemo, useState } from 'react';
import { AlertTriangle, KeyRound, Link2, ShieldCheck, Unplug } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DESIGN_TOKENS,
  bodyTextStyle,
  eyebrowStyle,
  mergeStyles,
  panelStyle,
  sectionTitleStyle,
} from '@/design-constraints';

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

const sectionStyle = mergeStyles(panelStyle({ muted: true, padding: DESIGN_TOKENS.space[5] }), {
  display: 'grid',
  gap: DESIGN_TOKENS.space[4],
  margin: 0,
});

const rowStyle = mergeStyles(panelStyle({ padding: DESIGN_TOKENS.space[4] }), {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: DESIGN_TOKENS.space[4],
});

const labelStyle = mergeStyles(eyebrowStyle(), {
  marginBottom: DESIGN_TOKENS.space[1],
});

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

function badgeVariantForStatus(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'healthy' || status === 'active') return 'default';
  if (status === 'disconnected' || status === 'error') return 'destructive';
  return 'secondary';
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
    return <div style={bodyTextStyle()}>Loading account access…</div>;
  }

  if (error) {
    return <div style={mergeStyles(bodyTextStyle(), { color: DESIGN_TOKENS.color.danger })}>{error}</div>;
  }

  if (!access) {
    return <div style={bodyTextStyle()}>No account access data is available.</div>;
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
    <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[4] }}>
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: DESIGN_TOKENS.space[2] }}>
          <ShieldCheck size={15} />
          <div style={mergeStyles(sectionTitleStyle(), { fontSize: DESIGN_TOKENS.type.size.bodyLg })}>
            Empyralis account ownership
          </div>
        </div>
        <div style={bodyTextStyle()}>{access.messaging.account_owner}</div>
        <div style={bodyTextStyle()}>{access.messaging.provider_boundary}</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: DESIGN_TOKENS.space[2], flexWrap: 'wrap' }}>
          <Badge variant="secondary">
            {access.summary.active_sign_in_method_count} active sign-in method{access.summary.active_sign_in_method_count === 1 ? '' : 's'}
          </Badge>
          <Badge variant={access.summary.has_backup_sign_in_method ? 'default' : 'secondary'}>
            {access.summary.has_backup_sign_in_method ? 'Recovery protected' : 'Recovery needs attention'}
          </Badge>
          {access.summary.has_password ? <Badge variant="secondary">Password backup active</Badge> : null}
        </div>
      </div>

      {access.recovery.warnings.length > 0 ? (
        <div
          style={mergeStyles(sectionStyle, {
            borderColor: DESIGN_TOKENS.color.warningSoft,
            background: DESIGN_TOKENS.color.warningSoft,
          })}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: DESIGN_TOKENS.space[2], color: DESIGN_TOKENS.color.warning }}>
            <AlertTriangle size={15} />
            <div style={mergeStyles(sectionTitleStyle(), { fontSize: DESIGN_TOKENS.type.size.bodyLg })}>Recovery guidance</div>
          </div>
          <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
            {access.recovery.warnings.map((warning) => (
              <div key={warning} style={mergeStyles(bodyTextStyle(), { color: DESIGN_TOKENS.color.warning })}>
                {warning}
              </div>
            ))}
          </div>
          {access.recovery.recommended_actions.length > 0 ? (
            <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[2] }}>
              {access.recovery.recommended_actions.map((action) => (
                <div key={action} style={bodyTextStyle()}>
                  {action}
                </div>
              ))}
            </div>
          ) : null}
          {openAiConnected ? (
            <div style={mergeStyles(bodyTextStyle(), { color: DESIGN_TOKENS.color.warning })}>
              OpenAI is connected here for capability, but it should not be the only way back into this account.
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3] }}>
        {access.sign_in_methods.map((method) => (
          <div key={method.id} style={rowStyle}>
            <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[1], minWidth: 0 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: DESIGN_TOKENS.space[2],
                  color: DESIGN_TOKENS.color.textPrimary,
                  fontSize: DESIGN_TOKENS.type.size.body,
                  fontWeight: DESIGN_TOKENS.type.weight.semibold,
                }}
              >
                <KeyRound size={14} />
                {method.label}
              </div>
              <div style={bodyTextStyle()}>
                {method.status === 'active'
                  ? method.is_primary
                    ? 'Primary sign-in method'
                    : 'Available as an additional sign-in method'
                  : 'Disconnected from account sign-in'}
              </div>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: DESIGN_TOKENS.space[2], flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Badge variant="secondary">{method.kind}</Badge>
              <Badge variant={badgeVariantForStatus(method.status)}>{method.status}</Badge>
              {method.status === 'active' ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!method.can_disconnect || actionBusy === method.method}
                  onClick={() => void onDisconnectMethod(method.method)}
                  title={method.disconnect_reason || 'Disconnect this sign-in method'}
                >
                  <Unplug size={14} />
                  {actionBusy === method.method ? 'Updating…' : 'Disconnect'}
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {!access.summary.has_password ? (
        <form onSubmit={handleSubmit} style={sectionStyle}>
          <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[1] }}>
            <div style={mergeStyles(sectionTitleStyle(), { fontSize: DESIGN_TOKENS.type.size.bodyLg })}>Add email + password backup</div>
            <div style={bodyTextStyle()}>
              Add a recovery-safe sign-in method that stays with your Empyralis account even if a provider session changes.
            </div>
          </div>
          <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[1] }}>
            <label style={labelStyle} htmlFor="account-backup-password">New password</label>
            <Input
              id="account-backup-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              aria-invalid={Boolean(formError)}
              style={{ minHeight: DESIGN_TOKENS.control.heightLg }}
            />
          </div>
          <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[1] }}>
            <label style={labelStyle} htmlFor="account-backup-password-confirm">Confirm password</label>
            <Input
              id="account-backup-password-confirm"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat the password"
              aria-invalid={Boolean(formError)}
              style={{ minHeight: DESIGN_TOKENS.control.heightLg }}
            />
          </div>
          {formError ? <div style={mergeStyles(bodyTextStyle(), { color: DESIGN_TOKENS.color.danger })}>{formError}</div> : null}
          <div style={{ display: 'flex', alignItems: 'center', gap: DESIGN_TOKENS.space[3], flexWrap: 'wrap' }}>
            <Button type="submit" disabled={passwordBusy}>
              {passwordBusy ? 'Saving backup…' : 'Add password backup'}
            </Button>
            <div style={bodyTextStyle()}>
              {authProviders.google.enabled || authProviders.apple.enabled
                ? 'Google and Apple can stay available as additional sign-in methods, but the password backup gives you a provider-independent recovery path.'
                : 'A password backup gives you a provider-independent recovery path.'}
            </div>
          </div>
        </form>
      ) : null}

      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: DESIGN_TOKENS.space[2] }}>
          <Link2 size={15} />
          <div style={mergeStyles(sectionTitleStyle(), { fontSize: DESIGN_TOKENS.type.size.bodyLg })}>Connected AI providers</div>
        </div>
        <div style={bodyTextStyle()}>
          Provider connections add model capability only. Disconnecting a provider should never be confused with deleting your Empyralis account.
        </div>
        {providerConnections.length === 0 ? (
          <div style={bodyTextStyle()}>No AI providers are connected yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[3] }}>
            {providerConnections.map((provider) => (
              <div key={provider.id} style={rowStyle}>
                <div style={{ display: 'grid', gap: DESIGN_TOKENS.space[1], minWidth: 0 }}>
                  <div
                    style={{
                      color: DESIGN_TOKENS.color.textPrimary,
                      fontSize: DESIGN_TOKENS.type.size.body,
                      fontWeight: DESIGN_TOKENS.type.weight.semibold,
                    }}
                  >
                    {provider.label || providerLabel(provider.provider)}
                  </div>
                  <div style={bodyTextStyle()}>
                    {provider.model ? `${providerLabel(provider.provider)} · ${provider.model}` : providerLabel(provider.provider)}
                  </div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: DESIGN_TOKENS.space[2], flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Badge variant="secondary">{providerLabel(provider.provider)}</Badge>
                  <Badge variant={badgeVariantForStatus(provider.health)}>{provider.health.replace(/_/g, ' ')}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
