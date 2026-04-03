'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import { DEFAULT_CONNECTOR_LABELS, type ConnectorId } from '@/app/page.catalog';
import { ConnectorLogoMark } from '@/components/orion/connections/ConnectionMarks';
import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';

type ConnectorSetupDialogProps = {
  open: boolean;
  connector: ConnectorId | null;
  displayLabel?: string;
  workspaceId: string;
  onboardingMode?: boolean;
  returnTo?: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

type ConnectModalState = {
  label: string;
  accessToken: string;
  calendarId: string;
  timezone: string;
  googleUseLocalAuth: boolean;
  githubAuthMode: 'pat' | 'app';
  githubPersonalAccessToken: string;
  githubAppId: string;
  githubInstallationId: string;
  githubPrivateKeyPem: string;
  githubWebhookSecret: string;
  dropboxAccessToken: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3Region: string;
  notionAuthMode: 'integration_token' | 'oauth';
  notionToken: string;
  linearAuthMode: 'api_key' | 'oauth';
  linearApiKey: string;
  smtpHost: string;
  smtpPort: string;
  smtpUsername: string;
  smtpPassword: string;
  smtpUseTls: boolean;
  botToken: string;
  chatId: string;
  webhookUrl: string;
  discordBotToken: string;
  discordChannelId: string;
  discordGuildId: string;
  accountSid: string;
  authToken: string;
  fromNumber: string;
  toNumber: string;
  instagramAccountId: string;
  instagramPageId: string;
};

const EMPTY_FORM: ConnectModalState = {
  label: '',
  accessToken: '',
  calendarId: 'primary',
  timezone: 'UTC',
  googleUseLocalAuth: true,
  githubAuthMode: 'pat',
  githubPersonalAccessToken: '',
  githubAppId: '',
  githubInstallationId: '',
  githubPrivateKeyPem: '',
  githubWebhookSecret: '',
  dropboxAccessToken: '',
  s3AccessKeyId: '',
  s3SecretAccessKey: '',
  s3Region: 'us-east-1',
  notionAuthMode: 'integration_token',
  notionToken: '',
  linearAuthMode: 'api_key',
  linearApiKey: '',
  smtpHost: '',
  smtpPort: '587',
  smtpUsername: '',
  smtpPassword: '',
  smtpUseTls: true,
  botToken: '',
  chatId: '',
  webhookUrl: '',
  discordBotToken: '',
  discordChannelId: '',
  discordGuildId: '',
  accountSid: '',
  authToken: '',
  fromNumber: 'whatsapp:',
  toNumber: 'whatsapp:',
  instagramAccountId: '',
  instagramPageId: '',
};

function connectorLabel(value: ConnectorId): string {
  return DEFAULT_CONNECTOR_LABELS[value] || value;
}

function buildCredentialsPayload(connector: ConnectorId, state: ConnectModalState): Record<string, unknown> {
  if (connector === 'microsoft_365') {
    return { access_token: state.accessToken.trim() };
  }
  if (connector === 'github') {
    if (state.githubAuthMode === 'app') {
      return {
        auth_mode: 'app',
        app_id: state.githubAppId.trim(),
        installation_id: state.githubInstallationId.trim(),
        private_key_pem: state.githubPrivateKeyPem,
        webhook_secret: state.githubWebhookSecret.trim() || undefined,
      };
    }
    return {
      auth_mode: 'pat',
      personal_access_token: state.githubPersonalAccessToken.trim(),
      webhook_secret: state.githubWebhookSecret.trim() || undefined,
    };
  }
  if (connector === 'dropbox') {
    return {
      auth_mode: 'oauth',
      access_token: state.dropboxAccessToken.trim(),
    };
  }
  if (connector === 's3') {
    return {
      auth_mode: 'access_key',
      aws_access_key_id: state.s3AccessKeyId.trim(),
      aws_secret_access_key: state.s3SecretAccessKey,
      region: state.s3Region.trim() || 'us-east-1',
    };
  }
  if (connector === 'notion') {
    if (state.notionAuthMode === 'oauth') {
      return {
        auth_mode: 'oauth',
        access_token: state.notionToken.trim(),
      };
    }
    return {
      auth_mode: 'integration_token',
      integration_token: state.notionToken.trim(),
    };
  }
  if (connector === 'linear') {
    if (state.linearAuthMode === 'oauth') {
      return {
        auth_mode: 'oauth',
        access_token: state.linearApiKey.trim(),
      };
    }
    return {
      auth_mode: 'api_key',
      api_key: state.linearApiKey.trim(),
    };
  }
  if (connector === 'smtp') {
    return {
      host: state.smtpHost.trim(),
      port: state.smtpPort.trim() || '587',
      username: state.smtpUsername.trim(),
      password: state.smtpPassword,
      use_tls: state.smtpUseTls,
    };
  }
  if (connector === 'telegram_bot') {
    return {
      bot_token: state.botToken.trim(),
      chat_id: state.chatId.trim(),
    };
  }
  if (connector === 'wechat_work') {
    return {
      webhook_url: state.webhookUrl.trim(),
    };
  }
  if (connector === 'discord_bot') {
    return {
      bot_token: state.discordBotToken.trim(),
      channel_id: state.discordChannelId.trim(),
      guild_id: state.discordGuildId.trim(),
    };
  }
  if (connector === 'whatsapp_twilio') {
    return {
      account_sid: state.accountSid.trim(),
      auth_token: state.authToken.trim(),
      from_number: state.fromNumber.trim(),
      to_number: state.toNumber.trim(),
    };
  }
  if (connector === 'instagram_business') {
    return {
      access_token: state.accessToken.trim(),
      instagram_account_id: state.instagramAccountId.trim(),
      page_id: state.instagramPageId.trim(),
    };
  }
  if (state.googleUseLocalAuth) {
    return {
      auth_mode: 'gws_local',
      gws_config_dir: '.gws-config',
      calendar_id: state.calendarId.trim() || 'primary',
      timezone: state.timezone.trim() || 'UTC',
    };
  }
  return {
    access_token: state.accessToken.trim(),
    calendar_id: state.calendarId.trim() || 'primary',
    timezone: state.timezone.trim() || 'UTC',
  };
}

function validateConnectorForm(connector: ConnectorId, state: ConnectModalState): string {
  if (connector === 'microsoft_365' && !state.accessToken.trim()) {
    return 'Enter a Microsoft Graph access token.';
  }
  if (connector === 'github' && state.githubAuthMode === 'pat' && !state.githubPersonalAccessToken.trim()) {
    return 'Enter a GitHub personal access token.';
  }
  if (
    connector === 'github'
    && state.githubAuthMode === 'app'
    && (!state.githubAppId.trim() || !state.githubInstallationId.trim() || !state.githubPrivateKeyPem.trim())
  ) {
    return 'Enter the GitHub App ID, installation ID, and private key PEM.';
  }
  if (connector === 'dropbox' && !state.dropboxAccessToken.trim()) {
    return 'Enter a Dropbox access token.';
  }
  if (connector === 's3' && (!state.s3AccessKeyId.trim() || !state.s3SecretAccessKey.trim() || !state.s3Region.trim())) {
    return 'Enter the AWS access key ID, secret, and region.';
  }
  if (connector === 'notion' && !state.notionToken.trim()) {
    return 'Enter a Notion token.';
  }
  if (connector === 'linear' && !state.linearApiKey.trim()) {
    return 'Enter a Linear credential.';
  }
  if (connector === 'smtp' && (!state.smtpHost.trim() || !state.smtpUsername.trim() || !state.smtpPassword)) {
    return 'Enter the SMTP host, username, and password.';
  }
  if (connector === 'google_workspace' && !state.googleUseLocalAuth && !state.accessToken.trim()) {
    return 'Enter a Google Workspace access token or use local auth.';
  }
  if (connector === 'wechat_work' && !state.webhookUrl.trim()) {
    return 'Enter the WeChat Work webhook URL.';
  }
  if (connector === 'telegram_bot' && !state.botToken.trim()) {
    return 'Paste the Telegram bot token first.';
  }
  if (connector === 'discord_bot' && !state.discordBotToken.trim()) {
    return 'Enter the Discord bot token.';
  }
  if (connector === 'whatsapp_twilio' && (!state.accountSid.trim() || !state.authToken.trim())) {
    return 'Enter the Twilio Account SID and auth token.';
  }
  if (connector === 'instagram_business' && !state.accessToken.trim()) {
    return 'Enter the Instagram Business access token.';
  }
  return '';
}

export default function ConnectorSetupDialog({
  open,
  connector,
  displayLabel,
  workspaceId,
  onboardingMode = false,
  returnTo = '/setup',
  onClose,
  onSaved,
}: ConnectorSetupDialogProps) {
  const [form, setForm] = useState<ConnectModalState>(EMPTY_FORM);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    if (!open || !connector) return;
    setForm({
      ...EMPTY_FORM,
      label: connectorLabel(connector),
    });
    setCreateError('');
  }, [connector, open]);

  const controlPlaneFetch = useCallback(async (input: string, init?: RequestInit) => {
    await ensureControlPlaneSession();
    const headers = new Headers(init?.headers || {});
    if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return fetch(input, {
      ...init,
      headers,
      cache: 'no-store',
    });
  }, []);

  const updateField = useCallback(<K extends keyof ConnectModalState>(field: K, value: ConnectModalState[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const handleCreateConnector = useCallback(async () => {
    if (!connector) return;
    if (connector === 'slack') {
      const slackReturnTo = onboardingMode ? returnTo : '/connectors?connector=slack';
      window.location.assign(`/api/control-plane/connectors/slack/start?returnTo=${encodeURIComponent(slackReturnTo)}`);
      return;
    }

    const validationError = validateConnectorForm(connector, form);
    if (validationError) {
      setCreateError(validationError);
      return;
    }

    setCreateBusy(true);
    setCreateError('');
    try {
      const res = await controlPlaneFetch('/api/control-plane/connectors', {
        method: 'POST',
        body: JSON.stringify({
          label: form.label.trim() || connectorLabel(connector),
          connector,
          workspace_id: workspaceId,
          credentials: buildCredentialsPayload(connector, form),
          metadata: {},
        }),
      });
      const raw = await res.text().catch(() => '');
      const body = raw ? JSON.parse(raw) : {};
      if (!res.ok) {
        throw new Error(String(body?.detail || body?.message || 'Failed to create connector.'));
      }
      onClose();
      await onSaved();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create connector.');
    } finally {
      setCreateBusy(false);
    }
  }, [connector, controlPlaneFetch, form, onClose, onSaved, onboardingMode, returnTo, workspaceId]);

  if (!open || !connector) return null;

  const title = displayLabel ? `Connect ${displayLabel}` : `Connect ${connectorLabel(connector)}`;

  return (
    <div className="orion-modal-overlay is-centered" onClick={onClose}>
      <div className="orion-modal orion-credentials-modal" onClick={(event) => event.stopPropagation()}>
        <div className="orion-panel-header orion-modal-header orion-credentials-modal-header">
          <div className="orion-credentials-modal-title-group">
            <ConnectorLogoMark id={connector} size={44} />
            <div>
              <h2 className="orion-modal-title">{title}</h2>
              <p className="orion-modal-copy">Create a connection for this tool. Only the fields required for this connector are shown.</p>
            </div>
          </div>
          <button type="button" className="orion-icon-btn orion-credentials-modal-close" onClick={onClose} aria-label="Close connector dialog">
            <X size={16} />
          </button>
        </div>

        <div className="orion-credentials-modal-body">
          <label className="orion-credentials-modal-field">
            <span className="orion-credentials-modal-label">Label</span>
            <input className="input" value={form.label} onChange={(event) => updateField('label', event.target.value)} placeholder={connectorLabel(connector)} />
          </label>

          {connector === 'google_workspace' ? (
            <>
              <div className="orion-credentials-modal-card is-google-mode">
                <div className="orion-credentials-modal-eyebrow">Authentication mode</div>
                <div className="orion-credentials-modal-toggle-row">
                  <button
                    type="button"
                    className={`orion-credentials-modal-toggle-btn${form.googleUseLocalAuth ? ' is-active' : ''}`}
                    onClick={() => updateField('googleUseLocalAuth', true)}
                  >
                    Local auth
                  </button>
                  <button
                    type="button"
                    className={`orion-credentials-modal-toggle-btn${!form.googleUseLocalAuth ? ' is-active' : ''}`}
                    onClick={() => updateField('googleUseLocalAuth', false)}
                  >
                    Pasted token
                  </button>
                </div>
                <div className="orion-credentials-modal-note">
                  {form.googleUseLocalAuth
                    ? 'Use the authenticated Google Workspace CLI session stored on this machine.'
                    : 'Use a raw Google access token when local auth is unavailable.'}
                </div>
              </div>
              {!form.googleUseLocalAuth ? (
                <label className="orion-credentials-modal-field">
                  <span className="orion-credentials-modal-label">Access token</span>
                  <textarea className="input" rows={4} value={form.accessToken} onChange={(event) => updateField('accessToken', event.target.value)} placeholder="ya29.a0..." />
                </label>
              ) : null}
              <div className="orion-credentials-modal-form-grid">
                <label className="orion-credentials-modal-field">
                  <span className="orion-credentials-modal-label">Calendar ID</span>
                  <input className="input" value={form.calendarId} onChange={(event) => updateField('calendarId', event.target.value)} placeholder="primary" />
                </label>
                <label className="orion-credentials-modal-field">
                  <span className="orion-credentials-modal-label">Timezone</span>
                  <input className="input" value={form.timezone} onChange={(event) => updateField('timezone', event.target.value)} placeholder="UTC" />
                </label>
              </div>
            </>
          ) : null}

          {connector === 'microsoft_365' ? (
            <label className="orion-credentials-modal-field">
              <span className="orion-credentials-modal-label">Graph access token</span>
              <textarea className="input" rows={4} value={form.accessToken} onChange={(event) => updateField('accessToken', event.target.value)} placeholder="Microsoft Graph access token" />
            </label>
          ) : null}

          {connector === 'smtp' ? (
            <>
              <div className="orion-credentials-modal-form-grid">
                <label className="orion-credentials-modal-field">
                  <span className="orion-credentials-modal-label">SMTP host</span>
                  <input className="input" value={form.smtpHost} onChange={(event) => updateField('smtpHost', event.target.value)} placeholder="smtp.mailserver.com" />
                </label>
                <label className="orion-credentials-modal-field">
                  <span className="orion-credentials-modal-label">Port</span>
                  <input className="input" value={form.smtpPort} onChange={(event) => updateField('smtpPort', event.target.value)} placeholder="587" />
                </label>
              </div>
              <label className="orion-credentials-modal-field">
                <span className="orion-credentials-modal-label">Username</span>
                <input className="input" value={form.smtpUsername} onChange={(event) => updateField('smtpUsername', event.target.value)} placeholder="you@example.com" />
              </label>
              <label className="orion-credentials-modal-field">
                <span className="orion-credentials-modal-label">Password</span>
                <input type="password" className="input" value={form.smtpPassword} onChange={(event) => updateField('smtpPassword', event.target.value)} placeholder="App password or SMTP password" />
              </label>
              <label className="orion-credentials-modal-inline-toggle">
                <input type="checkbox" checked={form.smtpUseTls} onChange={(event) => updateField('smtpUseTls', event.target.checked)} />
                Use STARTTLS before login
              </label>
            </>
          ) : null}

          {connector === 'telegram_bot' ? (
            <>
              <label className="orion-credentials-modal-field">
                <span className="orion-credentials-modal-label">Bot token</span>
                <input className="input" value={form.botToken} onChange={(event) => updateField('botToken', event.target.value)} placeholder="123456:ABC..." />
              </label>
              <label className="orion-credentials-modal-field">
                <span className="orion-credentials-modal-label">Chat ID (optional)</span>
                <input className="input" value={form.chatId} onChange={(event) => updateField('chatId', event.target.value)} placeholder="1932934047" />
              </label>
            </>
          ) : null}

          {connector === 'wechat_work' ? (
            <label className="orion-credentials-modal-field">
              <span className="orion-credentials-modal-label">Webhook URL</span>
              <input className="input" value={form.webhookUrl} onChange={(event) => updateField('webhookUrl', event.target.value)} placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..." />
            </label>
          ) : null}

          {connector === 'discord_bot' ? (
            <>
              <label className="orion-credentials-modal-field">
                <span className="orion-credentials-modal-label">Bot token</span>
                <input className="input" value={form.discordBotToken} onChange={(event) => updateField('discordBotToken', event.target.value)} placeholder="Discord bot token" />
              </label>
              <div className="orion-credentials-modal-form-grid">
                <label className="orion-credentials-modal-field">
                  <span className="orion-credentials-modal-label">Channel ID</span>
                  <input className="input" value={form.discordChannelId} onChange={(event) => updateField('discordChannelId', event.target.value)} placeholder="123456789012345678" />
                </label>
                <label className="orion-credentials-modal-field">
                  <span className="orion-credentials-modal-label">Guild ID</span>
                  <input className="input" value={form.discordGuildId} onChange={(event) => updateField('discordGuildId', event.target.value)} placeholder="Optional guild ID" />
                </label>
              </div>
            </>
          ) : null}

          {connector === 'slack' ? (
            <div className="orion-credentials-modal-card">
              <div className="orion-credentials-modal-service-title">Slack OAuth</div>
              <div className="orion-credentials-modal-service-copy">
                Continue to the Slack install flow. The workspace bot token is saved after OAuth completes.
              </div>
            </div>
          ) : null}

          {connector === 'github' ? (
            <>
              <div className="orion-credentials-modal-card">
                <div className="orion-credentials-modal-eyebrow">Authentication mode</div>
                <div className="orion-credentials-modal-toggle-row">
                  <button
                    type="button"
                    className={`orion-credentials-modal-toggle-btn${form.githubAuthMode === 'pat' ? ' is-active' : ''}`}
                    onClick={() => updateField('githubAuthMode', 'pat')}
                  >
                    Personal access token
                  </button>
                  <button
                    type="button"
                    className={`orion-credentials-modal-toggle-btn${form.githubAuthMode === 'app' ? ' is-active' : ''}`}
                    onClick={() => updateField('githubAuthMode', 'app')}
                  >
                    GitHub App
                  </button>
                </div>
              </div>
              {form.githubAuthMode === 'pat' ? (
                <label className="orion-credentials-modal-field">
                  <span className="orion-credentials-modal-label">Personal access token</span>
                  <textarea className="input" rows={4} value={form.githubPersonalAccessToken} onChange={(event) => updateField('githubPersonalAccessToken', event.target.value)} placeholder="ghp_..." />
                </label>
              ) : (
                <>
                  <a className="orion-btn orion-btn-ghost" href="/api/control-plane/connectors/github/start" target="_blank" rel="noreferrer">
                    <ArrowUpRight size={14} />
                    Open GitHub App install
                  </a>
                  <div className="orion-credentials-modal-form-grid">
                    <label className="orion-credentials-modal-field">
                      <span className="orion-credentials-modal-label">App ID</span>
                      <input className="input" value={form.githubAppId} onChange={(event) => updateField('githubAppId', event.target.value)} placeholder="123456" />
                    </label>
                    <label className="orion-credentials-modal-field">
                      <span className="orion-credentials-modal-label">Installation ID</span>
                      <input className="input" value={form.githubInstallationId} onChange={(event) => updateField('githubInstallationId', event.target.value)} placeholder="78901234" />
                    </label>
                  </div>
                  <label className="orion-credentials-modal-field">
                    <span className="orion-credentials-modal-label">Private key PEM</span>
                    <textarea className="input" rows={7} value={form.githubPrivateKeyPem} onChange={(event) => updateField('githubPrivateKeyPem', event.target.value)} placeholder="-----BEGIN RSA PRIVATE KEY-----" />
                  </label>
                </>
              )}
              <label className="orion-credentials-modal-field">
                <span className="orion-credentials-modal-label">Webhook secret (optional)</span>
                <input className="input" value={form.githubWebhookSecret} onChange={(event) => updateField('githubWebhookSecret', event.target.value)} placeholder="Optional webhook secret" />
              </label>
            </>
          ) : null}

          {connector === 'dropbox' ? (
            <label className="orion-credentials-modal-field">
              <span className="orion-credentials-modal-label">Access token</span>
              <textarea className="input" rows={4} value={form.dropboxAccessToken} onChange={(event) => updateField('dropboxAccessToken', event.target.value)} placeholder="Dropbox OAuth token" />
            </label>
          ) : null}

          {connector === 's3' ? (
            <>
              <div className="orion-credentials-modal-form-grid">
                <label className="orion-credentials-modal-field">
                  <span className="orion-credentials-modal-label">Access key ID</span>
                  <input className="input" value={form.s3AccessKeyId} onChange={(event) => updateField('s3AccessKeyId', event.target.value)} placeholder="AKIA..." />
                </label>
                <label className="orion-credentials-modal-field">
                  <span className="orion-credentials-modal-label">Region</span>
                  <input className="input" value={form.s3Region} onChange={(event) => updateField('s3Region', event.target.value)} placeholder="us-east-1" />
                </label>
              </div>
              <label className="orion-credentials-modal-field">
                <span className="orion-credentials-modal-label">Secret access key</span>
                <input type="password" className="input" value={form.s3SecretAccessKey} onChange={(event) => updateField('s3SecretAccessKey', event.target.value)} placeholder="AWS secret access key" />
              </label>
            </>
          ) : null}

          {connector === 'notion' ? (
            <>
              <div className="orion-credentials-modal-card">
                <div className="orion-credentials-modal-eyebrow">Authentication mode</div>
                <div className="orion-credentials-modal-toggle-row">
                  <button
                    type="button"
                    className={`orion-credentials-modal-toggle-btn${form.notionAuthMode === 'integration_token' ? ' is-active' : ''}`}
                    onClick={() => updateField('notionAuthMode', 'integration_token')}
                  >
                    Integration token
                  </button>
                  <button
                    type="button"
                    className={`orion-credentials-modal-toggle-btn${form.notionAuthMode === 'oauth' ? ' is-active' : ''}`}
                    onClick={() => updateField('notionAuthMode', 'oauth')}
                  >
                    OAuth token
                  </button>
                </div>
              </div>
              <label className="orion-credentials-modal-field">
                <span className="orion-credentials-modal-label">{form.notionAuthMode === 'oauth' ? 'OAuth access token' : 'Integration token'}</span>
                <textarea className="input" rows={4} value={form.notionToken} onChange={(event) => updateField('notionToken', event.target.value)} placeholder="secret_..." />
              </label>
            </>
          ) : null}

          {connector === 'linear' ? (
            <>
              <div className="orion-credentials-modal-card">
                <div className="orion-credentials-modal-eyebrow">Authentication mode</div>
                <div className="orion-credentials-modal-toggle-row">
                  <button
                    type="button"
                    className={`orion-credentials-modal-toggle-btn${form.linearAuthMode === 'api_key' ? ' is-active' : ''}`}
                    onClick={() => updateField('linearAuthMode', 'api_key')}
                  >
                    Personal API key
                  </button>
                  <button
                    type="button"
                    className={`orion-credentials-modal-toggle-btn${form.linearAuthMode === 'oauth' ? ' is-active' : ''}`}
                    onClick={() => updateField('linearAuthMode', 'oauth')}
                  >
                    OAuth token
                  </button>
                </div>
              </div>
              <label className="orion-credentials-modal-field">
                <span className="orion-credentials-modal-label">{form.linearAuthMode === 'oauth' ? 'OAuth access token' : 'Personal API key'}</span>
                <textarea className="input" rows={4} value={form.linearApiKey} onChange={(event) => updateField('linearApiKey', event.target.value)} placeholder="Linear credential" />
              </label>
            </>
          ) : null}

          {connector === 'whatsapp_twilio' ? (
            <>
              <div className="orion-credentials-modal-form-grid">
                <label className="orion-credentials-modal-field">
                  <span className="orion-credentials-modal-label">Account SID</span>
                  <input className="input" value={form.accountSid} onChange={(event) => updateField('accountSid', event.target.value)} placeholder="AC..." />
                </label>
                <label className="orion-credentials-modal-field">
                  <span className="orion-credentials-modal-label">Auth token</span>
                  <input className="input" value={form.authToken} onChange={(event) => updateField('authToken', event.target.value)} placeholder="Twilio auth token" />
                </label>
              </div>
              <div className="orion-credentials-modal-form-grid">
                <label className="orion-credentials-modal-field">
                  <span className="orion-credentials-modal-label">From number</span>
                  <input className="input" value={form.fromNumber} onChange={(event) => updateField('fromNumber', event.target.value)} placeholder="whatsapp:+14155238886" />
                </label>
                <label className="orion-credentials-modal-field">
                  <span className="orion-credentials-modal-label">Allowed sender / To number</span>
                  <input className="input" value={form.toNumber} onChange={(event) => updateField('toNumber', event.target.value)} placeholder="whatsapp:+15551234567" />
                </label>
              </div>
            </>
          ) : null}

          {connector === 'instagram_business' ? (
            <>
              <label className="orion-credentials-modal-field">
                <span className="orion-credentials-modal-label">Access token</span>
                <textarea className="input" rows={4} value={form.accessToken} onChange={(event) => updateField('accessToken', event.target.value)} placeholder="Instagram Business / Meta Graph access token" />
              </label>
              <div className="orion-credentials-modal-form-grid">
                <label className="orion-credentials-modal-field">
                  <span className="orion-credentials-modal-label">Instagram account ID</span>
                  <input className="input" value={form.instagramAccountId} onChange={(event) => updateField('instagramAccountId', event.target.value)} placeholder="1784..." />
                </label>
                <label className="orion-credentials-modal-field">
                  <span className="orion-credentials-modal-label">Page ID</span>
                  <input className="input" value={form.instagramPageId} onChange={(event) => updateField('instagramPageId', event.target.value)} placeholder="Optional page ID" />
                </label>
              </div>
            </>
          ) : null}

          {createError ? <div className="orion-integrations-feedback is-error">{createError}</div> : null}
        </div>

        <div className="orion-modal-footer orion-credentials-modal-footer">
          <button type="button" className="orion-btn orion-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="orion-btn orion-btn-primary" onClick={() => void handleCreateConnector()} disabled={createBusy}>
            {createBusy ? 'Connecting…' : connector === 'slack' ? 'Continue to Slack' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}
