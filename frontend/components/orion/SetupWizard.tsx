// UNMOUNTED - not wired to any route, do not delete without checking
'use client';

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import {
  UI,
  DEFAULT_CONNECTOR_OPTIONS,
  getProviderAuthModes,
  isProviderId,
  type ConnectionMode,
  type ProviderId,
  type ProviderOption,
  type ConnectorCredentialItem,
  type ConnectorId,
  type SetupSession,
  type VaultCredentialItem,
} from '../../app/page.catalog';
import { BRAND } from '@/lib/brand';

type SetupStatusState = {
  runtimeReady: boolean;
  accountConnected: boolean;
  connectionTested: boolean;
};

type NextSetupStep = {
  label: string;
  action: (() => Promise<void>) | null;
  blocked: boolean;
} | null;

type SetupSessionAction =
  | 'select_provider'
  | 'submit_credential'
  | 'verify'
  | 'complete'
  | 'cancel'
  | 'resume'
  | 'risk_ack'
  | 'provider_auth_choice'
  | 'credential_handling'
  | 'channel_choice';

interface SetupWizardProps {
  showSetupWizard: boolean;
  setShowSetupWizard: (v: boolean) => void;
  setupReady: boolean;
  setupSteps: { label: string; done: boolean }[];
  setupSession: SetupSession | null;
  setupSessionBusy: boolean;
  resumeSetupSession: () => Promise<void>;
  cancelSetupSession: () => Promise<void>;
  nextSetupStep: NextSetupStep;
  setupBusy: string | null;
  isChecking: boolean;
  runRuntimeCheck: () => Promise<void>;
  runtimeApiKey: string;
  setRuntimeApiKey: (v: string) => void;
  connectionMode: ConnectionMode;
  setConnectionMode: (v: ConnectionMode) => void;
  setSetupStatus: (v: SetupStatusState | ((prev: SetupStatusState) => SetupStatusState)) => void;
  provider: ProviderId;
  setProvider: (v: ProviderId) => void;
  providerAuthMode: string;
  setProviderAuthMode: (v: string) => void;
  setupAction: (action: SetupSessionAction, payload?: Record<string, unknown>) => Promise<void>;
  providerOptions: ProviderOption[];
  model: string;
  setModel: (v: string) => void;
  modelsLoading: boolean;
  modelOptions: string[];
  selectedProviderOption: ProviderOption;
  credentialId: string;
  setCredentialId: (v: string) => void;
  providerCredentialOptions: VaultCredentialItem[];
  credentialLabel: string;
  setCredentialLabel: (v: string) => void;
  openaiKeyInput: string;
  setOpenaiKeyInput: (v: string) => void;
  saveByokCredential: () => Promise<void>;
  refreshCredentials: () => Promise<void>;
  isCredentialsLoading: boolean;
  connectorCredentialId: string;
  setConnectorCredentialId: (v: string) => void;
  connectorCredentials: ConnectorCredentialItem[];
  setConnectorType: (v: ConnectorId) => void;
  connectorType: ConnectorId;
  connectorLabel: string;
  setConnectorLabel: (v: string) => void;
  googleUseLocalAuth: boolean;
  setGoogleUseLocalAuth: (v: boolean) => void;
  googleConnectorToken: string;
  setGoogleConnectorToken: (v: string) => void;
  googleCalendarId: string;
  setGoogleCalendarId: (v: string) => void;
  googleTimezone: string;
  setGoogleTimezone: (v: string) => void;
  microsoftAccessToken: string;
  setMicrosoftAccessToken: (v: string) => void;
  telegramBotToken: string;
  setTelegramBotToken: (v: string) => void;
  telegramChatId: string;
  setTelegramChatId: (v: string) => void;
  discordBotToken: string;
  setDiscordBotToken: (v: string) => void;
  discordChannelId: string;
  setDiscordChannelId: (v: string) => void;
  discordGuildId: string;
  setDiscordGuildId: (v: string) => void;
  instagramAccessToken: string;
  setInstagramAccessToken: (v: string) => void;
  instagramAccountId: string;
  setInstagramAccountId: (v: string) => void;
  instagramPageId: string;
  setInstagramPageId: (v: string) => void;
  twilioAccountSid: string;
  setTwilioAccountSid: (v: string) => void;
  twilioAuthToken: string;
  setTwilioAuthToken: (v: string) => void;
  twilioFromNumber: string;
  setTwilioFromNumber: (v: string) => void;
  twilioToNumber: string;
  setTwilioToNumber: (v: string) => void;
  saveConnector: () => Promise<void>;
  refreshConnectors: () => Promise<void>;
  isConnectorsLoading: boolean;
  testConnector: () => Promise<void>;
  testConnection: () => Promise<void>;
  setupStatusObj: { accountConnected: boolean };
  isMobile: boolean;
}

export const SetupWizard: React.FC<SetupWizardProps> = ({
  showSetupWizard,
  setShowSetupWizard,
  setupReady,
  setupSteps,
  setupSession,
  setupSessionBusy,
  resumeSetupSession,
  cancelSetupSession,
  nextSetupStep,
  setupBusy,
  isChecking,
  runRuntimeCheck,
  runtimeApiKey,
  setRuntimeApiKey,
  connectionMode,
  setConnectionMode,
  setSetupStatus,
  provider,
  setProvider,
  providerAuthMode,
  setProviderAuthMode,
  setupAction,
  providerOptions,
  model,
  setModel,
  modelsLoading,
  modelOptions,
  selectedProviderOption,
  credentialId,
  setCredentialId,
  providerCredentialOptions,
  credentialLabel,
  setCredentialLabel,
  openaiKeyInput,
  setOpenaiKeyInput,
  saveByokCredential,
  refreshCredentials,
  isCredentialsLoading,
  connectorCredentialId,
  setConnectorCredentialId,
  connectorCredentials,
  setConnectorType,
  connectorType,
  connectorLabel,
  setConnectorLabel,
  googleUseLocalAuth,
  setGoogleUseLocalAuth,
  googleConnectorToken,
  setGoogleConnectorToken,
  googleCalendarId,
  setGoogleCalendarId,
  googleTimezone,
  setGoogleTimezone,
  microsoftAccessToken,
  setMicrosoftAccessToken,
  telegramBotToken,
  setTelegramBotToken,
  telegramChatId,
  setTelegramChatId,
  discordBotToken,
  setDiscordBotToken,
  discordChannelId,
  setDiscordChannelId,
  discordGuildId,
  setDiscordGuildId,
  instagramAccessToken,
  setInstagramAccessToken,
  instagramAccountId,
  setInstagramAccountId,
  instagramPageId,
  setInstagramPageId,
  twilioAccountSid,
  setTwilioAccountSid,
  twilioAuthToken,
  setTwilioAuthToken,
  twilioFromNumber,
  setTwilioFromNumber,
  twilioToNumber,
  setTwilioToNumber,
  saveConnector,
  refreshConnectors,
  isConnectorsLoading,
  testConnector,
  testConnection,
  setupStatusObj,
  isMobile,
}) => {
  const allowedActions = Array.isArray(setupSession?.allowed_actions)
    ? new Set(setupSession.allowed_actions.map((item) => String(item)))
    : null;
  const canSetupAction = (action: string) => !allowedActions || allowedActions.has(action);
  const providerAuthModes = getProviderAuthModes(selectedProviderOption);
  const selectedProviderAuthMode =
    providerAuthMode || selectedProviderOption.defaultAuthMode || providerAuthModes[0]?.id || 'api_key';
  const selectedProviderAuthConfig = providerAuthModes.find((item) => item.id === selectedProviderAuthMode);
  const providerAuthNeedsSecret = selectedProviderAuthConfig?.secretRequired !== false;
  const filteredProviderCredentialOptions = providerCredentialOptions.filter((item) => item.provider === provider);
  const providerLabel = selectedProviderOption.label || provider;
  const connectionModeGuidance =
    connectionMode === 'byok'
      ? 'Recommended. Save a direct provider account in Empyralis and reuse it in chat, runs, and workflows.'
      : connectionMode === 'local_companion'
        ? 'Run on this machine with local-first tooling and guarded permissions.'
        : setupStatusObj.accountConnected
          ? `Use the workspace ${providerLabel} runtime account already configured for this environment.`
          : `No ${providerLabel} runtime account is ready yet. Connect a direct ${providerLabel} account or switch to Saved AI account.`;
  const providerSetupGuidance = (() => {
    if (provider === 'openai') {
      if (selectedProviderAuthMode === 'oauth_token') {
        return 'Paste a saved OpenAI or Codex token you already control. Empyralis does not open a ChatGPT or Codex login flow for you.';
      }
      if (selectedProviderAuthMode === 'access_token') {
        return 'Paste a direct OpenAI access token. Use this only if your organization issues access tokens instead of API keys.';
      }
      return selectedProviderOption.note || 'Use a direct OpenAI API key. Empyralis does not route requests through model proxy services.';
    }
    if (provider === 'anthropic' && selectedProviderAuthMode === 'local_cli') {
      return selectedProviderOption.note || 'Use the Claude subscription already signed into the local Claude CLI on this machine.';
    }
    return selectedProviderOption.note || 'Use direct provider credentials only.';
  })();
  const providerSecretPlaceholder =
    provider === 'openai'
      ? selectedProviderAuthMode === 'oauth_token'
        ? 'Saved OpenAI or Codex token'
        : selectedProviderAuthMode === 'access_token'
          ? 'OpenAI access token'
          : 'OpenAI API key'
      : provider === 'anthropic' && selectedProviderAuthMode === 'api_key'
        ? 'Anthropic API key'
        : provider === 'vertex'
          ? 'Vertex access token'
          : `${selectedProviderOption.label} API key`;

  return (
    <div style={{ marginBottom: 14, borderRadius: 12, border: `1px solid ${UI.border}`, background: UI.surfaceAlt, padding: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'flex-start' : 'center',
          gap: 10,
          marginBottom: showSetupWizard ? 10 : 0,
          flexDirection: isMobile ? 'column' : 'row',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, color: UI.textSoft }}>Onboarding Progress</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {setupSteps.map((step) => (
            <span
              key={step.label}
              style={{
                borderRadius: 8,
                border: `1px solid ${step.done ? UI.successBorder : UI.border}`,
                color: step.done ? UI.successFg : UI.textMuted,
                background: step.done ? UI.successBg : 'transparent',
                padding: '3px 8px',
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {step.label}
            </span>
          ))}
          {setupReady && showSetupWizard && (
            <button
              onClick={() => setShowSetupWizard(false)}
              className="orion-btn orion-btn-ghost"
              style={{ minHeight: 28, fontSize: 10, padding: '0 8px' }}
            >
              Collapse
            </button>
          )}
          {!showSetupWizard && (
            <button
              onClick={() => setShowSetupWizard(true)}
              className="orion-btn orion-btn-ghost"
              style={{ minHeight: 28, fontSize: 10, padding: '0 8px' }}
            >
              Edit onboarding
            </button>
          )}
        </div>
      </div>

      {setupSession && (
        <div
          style={{
            marginTop: 8,
            borderRadius: 8,
            border: `1px solid ${UI.borderSoft}`,
            background: UI.surfaceAlt,
            padding: '7px 9px',
            display: 'flex',
            alignItems: isMobile ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexDirection: isMobile ? 'column' : 'row',
          }}
        >
          <div style={{ fontSize: 11, color: UI.textMuted }}>
            Guided session: <strong style={{ color: UI.textSoft }}>{setupSession.state}</strong>
            {' · '}
            {setupSession.id.slice(0, 8)}...
            {setupSession.next_step ? (
              <>
                {' · '}
                Next: <strong style={{ color: UI.textSoft }}>{setupSession.next_step}</strong>
              </>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={resumeSetupSession}
              disabled={setupSessionBusy || !canSetupAction('resume')}
              style={{
                borderRadius: 8,
                border: `1px solid ${UI.border}`,
                background: 'transparent',
                color: UI.textMuted,
                padding: '4px 8px',
                fontSize: 11,
                fontWeight: 700,
                cursor: setupSessionBusy || !canSetupAction('resume') ? 'not-allowed' : 'pointer',
              }}
            >
              Resume
            </button>
            <button
              onClick={cancelSetupSession}
              disabled={setupSessionBusy || !canSetupAction('cancel')}
              style={{
                borderRadius: 8,
                border: `1px solid ${UI.border}`,
                background: 'transparent',
                color: UI.textMuted,
                padding: '4px 8px',
                fontSize: 11,
                fontWeight: 700,
                cursor: setupSessionBusy || !canSetupAction('cancel') ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showSetupWizard && nextSetupStep && (
        <div
          style={{
            marginBottom: 10,
            marginTop: 8,
            borderRadius: 10,
            border: `1px solid ${UI.borderSoft}`,
            background: UI.surfaceAlt,
            padding: '8px 10px',
            display: 'flex',
            alignItems: isMobile ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexDirection: isMobile ? 'column' : 'row',
          }}
        >
          <div style={{ fontSize: 12, color: UI.textSoft }}>
            Next move: {nextSetupStep.label}
          </div>
          {nextSetupStep.action && (
            <button
              onClick={nextSetupStep.action}
              disabled={setupBusy !== null || isChecking}
              style={{
                borderRadius: 8,
                border: `1px solid ${UI.border}`,
                background: UI.accentSoft,
                color: UI.textSoft,
                padding: '5px 10px',
                fontSize: 11,
                fontWeight: 700,
                cursor: setupBusy !== null || isChecking ? 'not-allowed' : 'pointer',
                width: isMobile ? '100%' : 'auto',
              }}
            >
              Run now
            </button>
          )}
          {!nextSetupStep.action && (
            <span style={{ fontSize: 11, color: UI.textMuted }}>
              {nextSetupStep.blocked ? 'Blocked by session policy' : 'Manual step'}
            </span>
          )}
        </div>
      )}

      {!showSetupWizard && (
        <div style={{ fontSize: 12, color: UI.textSoft, display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <CheckCircle2 size={14} color={UI.successFg} />
          {`Onboarding completed. ${BRAND.assistant} is ready.`}
        </div>
      )}

      {showSetupWizard && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
            <span style={{ fontSize: 12, color: UI.textSoft }}>
              {'1. Check platform access'}
              {' '}
              {setupSteps[0].done ? '✓' : ''}
            </span>
            <button
              onClick={runRuntimeCheck}
              disabled={setupBusy !== null || isChecking}
              style={{
                borderRadius: 8,
                border: `1px solid ${UI.border}`,
                background: 'transparent',
                color: UI.text,
                padding: '5px 10px',
                fontSize: 11,
                fontWeight: 700,
                cursor: setupBusy !== null || isChecking ? 'not-allowed' : 'pointer',
              }}
            >
              {setupBusy === 'runtime' ? 'Checking...' : 'Check access'}
            </button>
          </div>

          <div style={{ display: 'grid', gap: 6, borderTop: `1px dashed ${UI.borderSoft}`, paddingTop: 8 }}>
            <span style={{ fontSize: 12, color: UI.textSoft }}>Platform access key (only if required)</span>
            <input
              type="password"
              value={runtimeApiKey}
              onChange={(e) => setRuntimeApiKey(e.target.value)}
              placeholder="Needed only if the runtime is protected with an access key"
              style={{
                borderRadius: 8,
                border: `1px solid ${UI.border}`,
                background: 'var(--bg-element)',
                color: UI.text,
                padding: '6px 8px',
                fontSize: 12,
              }}
            />
          </div>

          <div style={{ display: 'grid', gap: 8, borderTop: `1px dashed ${UI.borderSoft}`, paddingTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
              <span style={{ fontSize: 12, color: UI.textSoft }}>
                2. Choose execution and account source
                {' '}
                {setupSteps[1].done ? '✓' : ''}
              </span>
              <select
                value={connectionMode}
                onChange={(e) => {
                  const value = e.target.value as ConnectionMode;
                  setConnectionMode(value);
                  setSetupStatus((prev) => ({
                    ...prev,
                    accountConnected: value === 'local_companion',
                    connectionTested: false,
                  }));
                }}
                style={{
                  borderRadius: 8,
                  border: `1px solid ${UI.border}`,
                  background: 'var(--bg-element)',
                  color: UI.text,
                  padding: '5px 8px',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                <option value="managed">Runtime account</option>
                <option value="byok">Saved AI account</option>
                <option value="local_companion">Local machine</option>
              </select>
            </div>
            <div style={{ fontSize: 11.5, color: UI.textMuted, lineHeight: 1.55 }}>
              {connectionModeGuidance}
            </div>

            <div style={{ display: 'grid', gap: 8, borderTop: `1px dashed ${UI.borderSoft}`, paddingTop: 8 }}>
              <span style={{ fontSize: 12, color: UI.textSoft }}>Provider and model</span>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : providerAuthModes.length > 1 ? '1fr 1fr 1fr' : '1fr 1fr', gap: 8 }}>
                <select
                  value={provider}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (isProviderId(next)) {
                      setProvider(next);
                      void setupAction('select_provider', { provider: next });
                    }
                  }}
                  disabled={connectionMode === 'local_companion' || !canSetupAction('select_provider')}
                  style={{
                    borderRadius: 8,
                    border: `1px solid ${UI.border}`,
                    background: 'var(--bg-element)',
                    color: UI.text,
                    padding: '6px 8px',
                    fontSize: 12,
                    cursor: connectionMode === 'local_companion' || !canSetupAction('select_provider') ? 'not-allowed' : 'pointer',
                    opacity: connectionMode === 'local_companion' || !canSetupAction('select_provider') ? 0.7 : 1,
                  }}
                >
                  {providerOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
                {providerAuthModes.length > 1 && (
                  <select
                    value={selectedProviderAuthMode}
                    onChange={(e) => {
                      setProviderAuthMode(e.target.value);
                      void setupAction('provider_auth_choice', { provider, auth_mode: e.target.value });
                    }}
                    disabled={connectionMode !== 'byok'}
                    style={{
                      borderRadius: 8,
                      border: `1px solid ${UI.border}`,
                      background: 'var(--bg-element)',
                      color: UI.text,
                      padding: '6px 8px',
                      fontSize: 12,
                      cursor: connectionMode !== 'byok' ? 'not-allowed' : 'pointer',
                      opacity: connectionMode !== 'byok' ? 0.7 : 1,
                    }}
                  >
                    {providerAuthModes.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                )}
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={modelsLoading}
                  style={{
                    borderRadius: 8,
                    border: `1px solid ${UI.border}`,
                    background: 'var(--bg-element)',
                    color: UI.text,
                    padding: '6px 8px',
                    fontSize: 12,
                    cursor: modelsLoading ? 'not-allowed' : 'pointer',
                    opacity: modelsLoading ? 0.7 : 1,
                  }}
                >
                  {modelOptions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
            </div>

            {connectionMode === 'byok' && (
              <div style={{ display: 'grid', gap: 8 }}>
                <select
                  value={credentialId}
                  onChange={(e) => setCredentialId(e.target.value)}
                  style={{
                    borderRadius: 8,
                    border: `1px solid ${UI.border}`,
                    background: 'var(--bg-element)',
                    color: UI.text,
                    padding: '6px 8px',
                    fontSize: 12,
                  }}
                >
                  <option value="">
                    {filteredProviderCredentialOptions.length > 0
                      ? `Select saved ${selectedProviderOption.label} account`
                      : `No saved ${selectedProviderOption.label} account yet`}
                  </option>
                  {filteredProviderCredentialOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                      {provider === 'anthropic' && item.authMode === 'local_cli' ? ' (Claude subscription)' : ''}
                    </option>
                  ))}
                </select>

                <input
                  value={credentialLabel}
                  onChange={(e) => setCredentialLabel(e.target.value)}
                  placeholder={provider === 'anthropic' && selectedProviderAuthMode === 'local_cli' ? 'Claude subscription label' : `${selectedProviderOption.label} account label`}
                  style={{
                    borderRadius: 8,
                    border: `1px solid ${UI.border}`,
                    background: 'var(--bg-element)',
                    color: UI.text,
                    padding: '6px 8px',
                    fontSize: 12,
                  }}
                />
                {!providerAuthNeedsSecret ? (
                  <div
                    style={{
                      borderRadius: 8,
                      border: `1px solid ${UI.border}`,
                      background: 'var(--bg-element)',
                      color: UI.textSoft,
                      padding: '8px 10px',
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    No API key is needed. Save this account to use the Claude subscription already signed into the local `claude` CLI.
                  </div>
                ) : (
                  <>
                    <input
                      type="password"
                      value={openaiKeyInput}
                      onChange={(e) => setOpenaiKeyInput(e.target.value)}
                      placeholder={providerSecretPlaceholder}
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${UI.border}`,
                        background: 'var(--bg-element)',
                        color: UI.text,
                        padding: '6px 8px',
                        fontSize: 12,
                      }}
                    />
                    <div
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${UI.borderSoft}`,
                        background: 'var(--bg-element)',
                        color: UI.textSoft,
                        padding: '8px 10px',
                        fontSize: 11.5,
                        lineHeight: 1.5,
                      }}
                    >
                      {providerSetupGuidance}
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={saveByokCredential}
                  disabled={setupBusy !== null || !canSetupAction('submit_credential')}
                  className="orion-btn orion-btn-primary"
                  style={{ minHeight: 32, fontSize: 11 }}
                >
                    {setupBusy === 'save' ? 'Saving...' : 'Save account'}
                  </button>
                  <button
                    onClick={refreshCredentials}
                    disabled={setupBusy !== null || isCredentialsLoading}
                    className="orion-btn orion-btn-ghost"
                    style={{ minHeight: 32, fontSize: 11, background: 'var(--bg-element)' }}
                  >
                    {isCredentialsLoading ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gap: 8, borderTop: `1px dashed ${UI.borderSoft}`, paddingTop: 8 }}>
              <span style={{ fontSize: 12, color: UI.textSoft }}>
                Optional: connect platform tools and channels
              </span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a
                  href="https://t.me/BotFather"
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 11, color: UI.accent, textDecoration: 'none' }}
                >
                  Telegram BotFather
                </a>
                <a
                  href="https://console.twilio.com/"
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 11, color: UI.accent, textDecoration: 'none' }}
                >
                  Twilio Console
                </a>
                <a
                  href="https://developers.google.com/oauthplayground/"
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 11, color: UI.accent, textDecoration: 'none' }}
                >
                  Google OAuth Playground
                </a>
                <a
                  href="https://discord.com/developers/applications"
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 11, color: UI.accent, textDecoration: 'none' }}
                >
                  Discord Developer Portal
                </a>
                <a
                  href="https://developers.facebook.com/apps/"
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 11, color: UI.accent, textDecoration: 'none' }}
                >
                  Meta App Dashboard
                </a>
              </div>
              <select
                value={connectorCredentialId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setConnectorCredentialId(nextId);
                  const selected = connectorCredentials.find((item) => item.id === nextId);
                  if (selected) {
                    setConnectorType(selected.connector);
                  }
                }}
                style={{
                  borderRadius: 8,
                  border: `1px solid ${UI.border}`,
                  background: 'var(--bg-element)',
                  color: UI.text,
                  padding: '6px 8px',
                  fontSize: 12,
                }}
              >
                <option value="">No saved connection</option>
                {connectorCredentials.map((item) => {
                  const typeLabel = DEFAULT_CONNECTOR_OPTIONS.find((option) => option.id === item.connector)?.label || item.connector;
                  return (
                    <option key={item.id} value={item.id}>
                      {item.label} ({typeLabel})
                    </option>
                  );
                })}
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                <select
                  value={connectorType}
                  onChange={(e) => setConnectorType(e.target.value as ConnectorId)}
                  style={{
                    borderRadius: 8,
                    border: `1px solid ${UI.border}`,
                    background: 'var(--bg-element)',
                    color: UI.text,
                    padding: '6px 8px',
                    fontSize: 12,
                  }}
                >
                  {DEFAULT_CONNECTOR_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  value={connectorLabel}
                  onChange={(e) => setConnectorLabel(e.target.value)}
                  placeholder="Connection label"
                  style={{
                    borderRadius: 8,
                    border: `1px solid ${UI.border}`,
                    background: 'var(--bg-element)',
                    color: UI.text,
                    padding: '6px 8px',
                    fontSize: 12,
                  }}
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {connectorType === 'google_workspace' && (
                  <>
                    <div style={{ fontSize: 11, color: UI.textMuted }}>
                      Use local Google Workspace CLI auth from this machine by default. Switch to pasted token mode only if you need a temporary fallback.
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="orion-btn orion-btn-ghost"
                        onClick={() => setGoogleUseLocalAuth(true)}
                        style={{
                          minHeight: 32,
                          padding: '0 10px',
                          borderColor: googleUseLocalAuth ? UI.accentBorder : UI.border,
                          color: googleUseLocalAuth ? UI.accent : UI.textMuted,
                          background: googleUseLocalAuth ? 'var(--primary-soft)' : 'transparent',
                        }}
                      >
                        Local gws auth
                      </button>
                      <button
                        type="button"
                        className="orion-btn orion-btn-ghost"
                        onClick={() => setGoogleUseLocalAuth(false)}
                        style={{
                          minHeight: 32,
                          padding: '0 10px',
                          borderColor: !googleUseLocalAuth ? UI.accentBorder : UI.border,
                          color: !googleUseLocalAuth ? UI.accent : UI.textMuted,
                          background: !googleUseLocalAuth ? 'var(--primary-soft)' : 'transparent',
                        }}
                      >
                        Pasted token
                      </button>
                    </div>
                    {googleUseLocalAuth ? (
                      <div
                        style={{
                          fontSize: 11,
                          color: UI.textMuted,
                          borderRadius: 8,
                          border: `1px solid ${UI.border}`,
                          background: 'var(--bg-element)',
                          padding: '8px 10px',
                        }}
                      >
                        This will use the authenticated Google Workspace CLI config in <code>.gws-config</code> on this computer.
                      </div>
                    ) : (
                    <input
                      type="password"
                      value={googleConnectorToken}
                      onChange={(e) => setGoogleConnectorToken(e.target.value)}
                      placeholder="Google OAuth access token"
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${UI.border}`,
                        background: 'var(--bg-element)',
                        color: UI.text,
                        padding: '6px 8px',
                        fontSize: 12,
                      }}
                    />
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                      <input
                        value={googleCalendarId}
                        onChange={(e) => setGoogleCalendarId(e.target.value)}
                        placeholder="Calendar ID"
                        style={{
                          borderRadius: 8,
                          border: `1px solid ${UI.border}`,
                          background: 'var(--bg-element)',
                          color: UI.text,
                          padding: '6px 8px',
                          fontSize: 12,
                        }}
                      />
                      <input
                        value={googleTimezone}
                        onChange={(e) => setGoogleTimezone(e.target.value)}
                        placeholder="Timezone (example: Asia/Colombo)"
                        style={{
                          borderRadius: 8,
                          border: `1px solid ${UI.border}`,
                          background: 'var(--bg-element)',
                          color: UI.text,
                          padding: '6px 8px',
                          fontSize: 12,
                        }}
                      />
                    </div>
                  </>
                )}
                {connectorType === 'microsoft_365' && (
                  <>
                    <div style={{ fontSize: 11, color: UI.textMuted }}>
                      Use a Microsoft Graph access token with Outlook, calendar, and OneDrive scopes. This is the practical bridge before deeper Word, Excel, and PowerPoint flows land natively.
                    </div>
                    <textarea
                      value={microsoftAccessToken}
                      onChange={(e) => setMicrosoftAccessToken(e.target.value)}
                      placeholder="Microsoft Graph access token"
                      rows={3}
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${UI.border}`,
                        background: 'var(--bg-element)',
                        color: UI.text,
                        padding: '6px 8px',
                        fontSize: 12,
                        resize: 'vertical',
                      }}
                    />
                  </>
                )}
                {connectorType === 'telegram_bot' && (
                  <>
                    <div style={{ fontSize: 11, color: UI.textMuted }}>
                      Use numeric chat id (example: 1932934047), not the bot token.
                    </div>
                    <input
                      type="password"
                      value={telegramBotToken}
                      onChange={(e) => setTelegramBotToken(e.target.value)}
                      placeholder="Telegram bot token"
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${UI.border}`,
                        background: 'var(--bg-element)',
                        color: UI.text,
                        padding: '6px 8px',
                        fontSize: 12,
                      }}
                    />
                    <input
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                      placeholder="Telegram chat ID"
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${UI.border}`,
                        background: 'var(--bg-element)',
                        color: UI.text,
                        padding: '6px 8px',
                        fontSize: 12,
                      }}
                    />
                  </>
                )}
                {connectorType === 'discord_bot' && (
                  <>
                    <div style={{ fontSize: 11, color: UI.textMuted }}>
                      Paste your bot token and the target channel ID. Guild ID is optional but recommended for audit clarity.
                    </div>
                    <input
                      type="password"
                      value={discordBotToken}
                      onChange={(e) => setDiscordBotToken(e.target.value)}
                      placeholder="Discord bot token"
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${UI.border}`,
                        background: 'var(--bg-element)',
                        color: UI.text,
                        padding: '6px 8px',
                        fontSize: 12,
                      }}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                      <input
                        value={discordChannelId}
                        onChange={(e) => setDiscordChannelId(e.target.value)}
                        placeholder="Discord channel ID"
                        style={{
                          borderRadius: 8,
                          border: `1px solid ${UI.border}`,
                          background: 'var(--bg-element)',
                          color: UI.text,
                          padding: '6px 8px',
                          fontSize: 12,
                        }}
                      />
                      <input
                        value={discordGuildId}
                        onChange={(e) => setDiscordGuildId(e.target.value)}
                        placeholder="Discord guild ID (optional)"
                        style={{
                          borderRadius: 8,
                          border: `1px solid ${UI.border}`,
                          background: 'var(--bg-element)',
                          color: UI.text,
                          padding: '6px 8px',
                          fontSize: 12,
                        }}
                      />
                    </div>
                  </>
                )}
                {connectorType === 'whatsapp_twilio' && (
                  <>
                    <div style={{ fontSize: 11, color: UI.textMuted }}>
                      For sandbox, keep format like: whatsapp:+14155238886
                    </div>
                    <input
                      value={twilioAccountSid}
                      onChange={(e) => setTwilioAccountSid(e.target.value)}
                      placeholder="Twilio account SID"
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${UI.border}`,
                        background: 'var(--bg-element)',
                        color: UI.text,
                        padding: '6px 8px',
                        fontSize: 12,
                      }}
                    />
                    <input
                      type="password"
                      value={twilioAuthToken}
                      onChange={(e) => setTwilioAuthToken(e.target.value)}
                      placeholder="Twilio auth token"
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${UI.border}`,
                        background: 'var(--bg-element)',
                        color: UI.text,
                        padding: '6px 8px',
                        fontSize: 12,
                      }}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                      <input
                        value={twilioFromNumber}
                        onChange={(e) => setTwilioFromNumber(e.target.value)}
                        placeholder="From number"
                        style={{
                          borderRadius: 8,
                          border: `1px solid ${UI.border}`,
                          background: 'var(--bg-element)',
                          color: UI.text,
                          padding: '6px 8px',
                          fontSize: 12,
                        }}
                      />
                      <input
                        value={twilioToNumber}
                        onChange={(e) => setTwilioToNumber(e.target.value)}
                        placeholder="To number"
                        style={{
                          borderRadius: 8,
                          border: `1px solid ${UI.border}`,
                          background: 'var(--bg-element)',
                          color: UI.text,
                          padding: '6px 8px',
                          fontSize: 12,
                        }}
                      />
                    </div>
                  </>
                )}
                {connectorType === 'instagram_business' && (
                  <>
                    <div style={{ fontSize: 11, color: UI.textMuted }}>
                      Use a Meta Graph access token plus the Instagram Business account ID. Page ID is optional, but useful for shared ownership.
                    </div>
                    <textarea
                      value={instagramAccessToken}
                      onChange={(e) => setInstagramAccessToken(e.target.value)}
                      placeholder="Instagram Business access token"
                      rows={3}
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${UI.border}`,
                        background: 'var(--bg-element)',
                        color: UI.text,
                        padding: '6px 8px',
                        fontSize: 12,
                        resize: 'vertical',
                      }}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                      <input
                        value={instagramAccountId}
                        onChange={(e) => setInstagramAccountId(e.target.value)}
                        placeholder="Instagram Business account ID"
                        style={{
                          borderRadius: 8,
                          border: `1px solid ${UI.border}`,
                          background: 'var(--bg-element)',
                          color: UI.text,
                          padding: '6px 8px',
                          fontSize: 12,
                        }}
                      />
                      <input
                        value={instagramPageId}
                        onChange={(e) => setInstagramPageId(e.target.value)}
                        placeholder="Facebook page ID (optional)"
                        style={{
                          borderRadius: 8,
                          border: `1px solid ${UI.border}`,
                          background: 'var(--bg-element)',
                          color: UI.text,
                          padding: '6px 8px',
                          fontSize: 12,
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={saveConnector}
                  disabled={setupBusy !== null}
                  className="orion-btn orion-btn-primary"
                  style={{ minHeight: 32, fontSize: 11 }}
                >
                  {setupBusy === 'save' ? 'Saving...' : 'Save connection'}
                </button>
                <button
                  onClick={refreshConnectors}
                  disabled={setupBusy !== null || isConnectorsLoading}
                  className="orion-btn orion-btn-ghost"
                  style={{ minHeight: 32, fontSize: 11, background: 'var(--bg-element)' }}
                >
                  {isConnectorsLoading ? 'Refreshing...' : 'Refresh'}
                </button>
                <button
                  onClick={testConnector}
                  disabled={setupBusy !== null || !connectorCredentialId}
                  className="orion-btn orion-btn-ghost"
                  style={{ minHeight: 32, fontSize: 11, background: 'var(--bg-element)' }}
                >
                  {setupBusy === 'test' ? 'Testing...' : 'Test connection'}
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 10, borderTop: `1px dashed ${UI.borderSoft}`, paddingTop: 8, flexDirection: isMobile ? 'column' : 'row' }}>
            <span style={{ fontSize: 12, color: UI.textSoft }}>
              3. Confirm everything works
              {' '}
              {setupSteps[2].done ? '✓' : ''}
            </span>
            <button
              onClick={testConnection}
              disabled={setupBusy !== null || !setupStatusObj.accountConnected || !canSetupAction('verify')}
              style={{
                borderRadius: 8,
                border: `1px solid ${UI.border}`,
                background: 'var(--bg-element)',
                color: UI.text,
                padding: '5px 10px',
                fontSize: 11,
                fontWeight: 700,
                cursor: setupBusy !== null || !setupStatusObj.accountConnected || !canSetupAction('verify') ? 'not-allowed' : 'pointer',
              }}
            >
              {setupBusy === 'test' ? 'Testing...' : 'Run final check'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
