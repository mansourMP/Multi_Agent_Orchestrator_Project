'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { UI, fmtTime } from '../page.catalog';
import { usePageState } from '../page.state';
import { ORION_API_URL, usePlatformApi } from '../page.api';
import { usePageActions } from '../page.actions';
import { SetupWizard } from '../../components/orion/SetupWizard';

type DaemonSnapshot = {
  running: boolean;
  url: string;
  pid: string | null;
  transport: string;
  watchdog: {
    enabled: boolean;
    healthy: boolean | null;
    consecutiveFailures: number;
    recoveriesTotal: number;
    recoveriesLastHour: number;
    lastRecoveryAt: number | null;
    lastProbeAt: number | null;
    lastUnhealthyReason: string | null;
  };
};

type DaemonEvent = {
  id: string;
  ts: string;
  level: 'info' | 'warn' | 'error' | 'ok';
  message: string;
};

type ChannelSnapshot = {
  updatedAt: string | null;
  telegram: {
    enabled: boolean;
    active: boolean;
    threadAlive: boolean;
    processed: number;
    runs: number;
    connectorsSeen: number;
    droppedSenderCount: number;
    lastError: string | null;
    lastErrorAt: string | null;
    lastPollAt: string | null;
    connectorLabel: string | null;
    connectorLastAction: string | null;
    connectorLastRunId: string | null;
    connectorLastError: string | null;
    connectorChatId: string | null;
  };
  whatsapp: {
    enabled: boolean;
    active: boolean;
    threadAlive: boolean;
    processed: number;
    runs: number;
    connectorsSeen: number;
    lastError: string | null;
    lastErrorAt: string | null;
    lastInboundAt: string | null;
    connectorLabel: string | null;
    connectorLastAction: string | null;
    connectorLastRunId: string | null;
    connectorLastError: string | null;
  };
};

type TelegramMediaSnapshot = {
  updatedAt: string | null;
  configuredDir: string;
  resolvedDir: string;
  exists: boolean;
  filesTotal: number;
  bytesTotal: number;
  truncated: boolean;
  recent: Array<{
    path: string;
    bytes: number;
    mtime: string;
  }>;
};

export default function SetupPage() {
  const streamRef = useRef<EventSource | null>(null);
  const daemonSnapshotRef = useRef<DaemonSnapshot | null>(null);
  const pageState = usePageState();

  const {
    runtimeApiKey,
    setRuntimeApiKey,
    connectionMode,
    setConnectionMode,
    setSetupStatus,
    provider,
    setProvider,
    providerAuthMode,
    setProviderAuthMode,
    model,
    setModel,
    modelsLoading,
    modelOptions,
    credentialId,
    setCredentialId,
    credentialLabel,
    setCredentialLabel,
    openaiKeyInput,
    setOpenaiKeyInput,
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
    isCredentialsLoading,
    isConnectorsLoading,
    setupBusy,
    isChecking,
    showSetupWizard,
    setShowSetupWizard,
    setupSession,
    setupSessionBusy,
    setupStatus,
    providerOptions,
    viewportWidth,
    setViewportWidth,
  } = pageState;

  const api = usePlatformApi(pageState, streamRef);
  const {
    runRuntimeCheck,
    continueGuidedSetup,
    getOpsDaemonStatusFromWeb,
    getTelegramMediaStatusFromWeb,
    resumeSetupSession,
    cancelSetupSession,
    setupAction,
    saveByokCredential,
    refreshCredentials,
    saveConnector,
    refreshConnectors,
    testConnector,
    testConnection,
    closeStream,
  } = api;

  const {
    setupReady,
    setupProgressCount,
    setupSteps,
    nextSetupStep,
    onboardingNextStep,
    selectedProviderOption,
    providerCredentialOptions,
  } = usePageActions(pageState, api);

  const [daemonSnapshot, setDaemonSnapshot] = useState<DaemonSnapshot | null>(null);
  const [daemonEvents, setDaemonEvents] = useState<DaemonEvent[]>([]);
  const [daemonLastPollAt, setDaemonLastPollAt] = useState<string | null>(null);
  const [daemonPollError, setDaemonPollError] = useState<string | null>(null);
  const [channelSnapshot, setChannelSnapshot] = useState<ChannelSnapshot | null>(null);
  const [channelPollError, setChannelPollError] = useState<string | null>(null);
  const [mediaSnapshot, setMediaSnapshot] = useState<TelegramMediaSnapshot | null>(null);
  const [mediaPollError, setMediaPollError] = useState<string | null>(null);

  const addDaemonEvent = useCallback((level: DaemonEvent['level'], message: string) => {
    const now = new Date().toISOString();
    setDaemonEvents((prev) => {
      const last = prev[0];
      if (last && last.level === level && last.message === message) {
        return prev;
      }
      const next: DaemonEvent = {
        id: `${now}:${Math.random().toString(36).slice(2, 8)}`,
        ts: now,
        level,
        message,
      };
      return [next, ...prev].slice(0, 40);
    });
  }, []);

  const pollDaemonStatus = useCallback(
    async (source: 'auto' | 'manual' = 'auto') => {
      try {
        const snapshot = await getOpsDaemonStatusFromWeb();
        const prev = daemonSnapshotRef.current;
        daemonSnapshotRef.current = snapshot;
        setDaemonSnapshot(snapshot);
        setDaemonLastPollAt(new Date().toISOString());
        setDaemonPollError(null);

        if (!prev) {
          if (snapshot.running) {
            addDaemonEvent('ok', 'Daemon is online.');
          } else {
            addDaemonEvent('error', 'Daemon is offline.');
          }
          return;
        }

        if (!prev.running && snapshot.running) {
          addDaemonEvent('ok', 'Daemon recovered and is running.');
        } else if (prev.running && !snapshot.running) {
          addDaemonEvent('error', 'Daemon stopped.');
        }

        if (prev.watchdog.healthy === false && snapshot.watchdog.healthy === true) {
          addDaemonEvent('ok', 'Watchdog is healthy again.');
        } else if (prev.watchdog.healthy !== false && snapshot.watchdog.healthy === false) {
          addDaemonEvent(
            'warn',
            snapshot.watchdog.lastUnhealthyReason
              ? `Watchdog unhealthy: ${snapshot.watchdog.lastUnhealthyReason}`
              : 'Watchdog unhealthy.',
          );
        }

        if (snapshot.watchdog.recoveriesTotal > prev.watchdog.recoveriesTotal) {
          addDaemonEvent('info', `Automatic recovery attempt count: ${snapshot.watchdog.recoveriesTotal}.`);
        }

        if (source === 'manual') {
          addDaemonEvent('info', 'Daemon status refreshed.');
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to load daemon status.';
        setDaemonPollError(message);
        addDaemonEvent('error', `Daemon status error: ${message}`);
      }
    },
    [addDaemonEvent, getOpsDaemonStatusFromWeb],
  );

  const pollChannelStatus = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (runtimeApiKey.trim()) {
        headers['X-API-Key'] = runtimeApiKey.trim();
      }

      const fetchJson = async (path: string): Promise<Record<string, unknown>> => {
        const response = await fetch(`${ORION_API_URL}${path}`, { headers, cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`${path} HTTP ${response.status}`);
        }
        const payload = (await response.json()) as unknown;
        if (!payload || typeof payload !== 'object') return {};
        return payload as Record<string, unknown>;
      };

      const [healthResult, telegramResult, whatsappResult] = await Promise.allSettled([
        fetchJson('/health'),
        fetchJson('/channels/telegram/autopilot/status'),
        fetchJson('/channels/whatsapp/autopilot/status'),
      ]);

      const health =
        healthResult.status === 'fulfilled'
          ? healthResult.value
          : {};
      const telegramStatus =
        telegramResult.status === 'fulfilled'
          ? telegramResult.value
          : {};
      const whatsappStatus =
        whatsappResult.status === 'fulfilled'
          ? whatsappResult.value
          : {};

      if (healthResult.status === 'rejected' && telegramResult.status === 'rejected' && whatsappResult.status === 'rejected') {
        throw new Error('Runtime status endpoints are unavailable.');
      }

      const telegramAutopilot =
        telegramStatus.autopilot && typeof telegramStatus.autopilot === 'object'
          ? (telegramStatus.autopilot as Record<string, unknown>)
          : {};
      const whatsappAutopilot =
        whatsappStatus.autopilot && typeof whatsappStatus.autopilot === 'object'
          ? (whatsappStatus.autopilot as Record<string, unknown>)
          : {};

      const telegramConnectors = Array.isArray(telegramStatus.connectors)
        ? (telegramStatus.connectors as Array<Record<string, unknown>>)
        : [];
      const whatsappConnectors = Array.isArray(whatsappStatus.connectors)
        ? (whatsappStatus.connectors as Array<Record<string, unknown>>)
        : [];
      const telegramConnector = telegramConnectors[0] || {};
      const whatsappConnector = whatsappConnectors[0] || {};

      const snapshot: ChannelSnapshot = {
        updatedAt: new Date().toISOString(),
        telegram: {
          enabled: Boolean(
            telegramAutopilot.enabled ?? health.telegram_autopilot_enabled,
          ),
          active: Boolean(
            telegramAutopilot.active ?? health.telegram_autopilot_active,
          ),
          threadAlive: Boolean(
            telegramAutopilot.thread_alive ?? health.telegram_autopilot_thread_alive,
          ),
          processed: Number(
            telegramAutopilot.processed_updates ?? health.telegram_autopilot_processed_updates ?? 0,
          ),
          runs: Number(
            telegramAutopilot.runs_started ?? health.telegram_autopilot_runs_started ?? 0,
          ),
          connectorsSeen: Number(
            telegramAutopilot.connectors_seen ?? health.telegram_autopilot_connectors_seen ?? telegramConnectors.length,
          ),
          droppedSenderCount: Number(
            telegramAutopilot.dropped_sender_count ?? 0,
          ),
          lastError:
            typeof (telegramAutopilot.last_error ?? health.telegram_autopilot_last_error) === 'string' &&
            String(telegramAutopilot.last_error ?? health.telegram_autopilot_last_error).trim()
              ? String(telegramAutopilot.last_error ?? health.telegram_autopilot_last_error)
              : null,
          lastErrorAt:
            typeof telegramAutopilot.last_error_at === 'string' && String(telegramAutopilot.last_error_at).trim()
              ? String(telegramAutopilot.last_error_at)
              : null,
          lastPollAt:
            typeof (telegramAutopilot.last_poll_at ?? health.telegram_autopilot_last_poll_at) === 'string' &&
            String(telegramAutopilot.last_poll_at ?? health.telegram_autopilot_last_poll_at).trim()
              ? String(telegramAutopilot.last_poll_at ?? health.telegram_autopilot_last_poll_at)
              : null,
          connectorLabel:
            typeof telegramConnector.label === 'string' && telegramConnector.label.trim()
              ? telegramConnector.label
              : null,
          connectorLastAction:
            typeof telegramConnector.last_action === 'string' && telegramConnector.last_action.trim()
              ? telegramConnector.last_action
              : null,
          connectorLastRunId:
            typeof telegramConnector.last_run_id === 'string' && telegramConnector.last_run_id.trim()
              ? telegramConnector.last_run_id
              : null,
          connectorLastError:
            typeof telegramConnector.last_error === 'string' && telegramConnector.last_error.trim()
              ? telegramConnector.last_error
              : null,
          connectorChatId:
            typeof telegramConnector.last_chat_id === 'string' && telegramConnector.last_chat_id.trim()
              ? telegramConnector.last_chat_id
              : null,
        },
        whatsapp: {
          enabled: Boolean(
            whatsappAutopilot.enabled ?? health.whatsapp_autopilot_enabled,
          ),
          active: Boolean(
            whatsappAutopilot.active ?? health.whatsapp_autopilot_active,
          ),
          threadAlive: Boolean(
            whatsappAutopilot.thread_alive ?? health.whatsapp_autopilot_thread_alive,
          ),
          processed: Number(
            whatsappAutopilot.processed_messages ?? health.whatsapp_autopilot_processed_messages ?? 0,
          ),
          runs: Number(
            whatsappAutopilot.runs_started ?? health.whatsapp_autopilot_runs_started ?? 0,
          ),
          connectorsSeen: Number(
            whatsappAutopilot.connectors_seen ?? health.whatsapp_autopilot_connectors_seen ?? whatsappConnectors.length,
          ),
          lastError:
            typeof (whatsappAutopilot.last_error ?? health.whatsapp_autopilot_last_error) === 'string' &&
            String(whatsappAutopilot.last_error ?? health.whatsapp_autopilot_last_error).trim()
              ? String(whatsappAutopilot.last_error ?? health.whatsapp_autopilot_last_error)
              : null,
          lastErrorAt:
            typeof whatsappAutopilot.last_error_at === 'string' && String(whatsappAutopilot.last_error_at).trim()
              ? String(whatsappAutopilot.last_error_at)
              : null,
          lastInboundAt:
            typeof (whatsappAutopilot.last_inbound_at ?? health.whatsapp_autopilot_last_inbound_at) === 'string' &&
            String(whatsappAutopilot.last_inbound_at ?? health.whatsapp_autopilot_last_inbound_at).trim()
              ? String(whatsappAutopilot.last_inbound_at ?? health.whatsapp_autopilot_last_inbound_at)
              : null,
          connectorLabel:
            typeof whatsappConnector.label === 'string' && whatsappConnector.label.trim()
              ? whatsappConnector.label
              : null,
          connectorLastAction:
            typeof whatsappConnector.last_action === 'string' && whatsappConnector.last_action.trim()
              ? whatsappConnector.last_action
              : null,
          connectorLastRunId:
            typeof whatsappConnector.last_run_id === 'string' && whatsappConnector.last_run_id.trim()
              ? whatsappConnector.last_run_id
              : null,
          connectorLastError:
            typeof whatsappConnector.last_error === 'string' && whatsappConnector.last_error.trim()
              ? whatsappConnector.last_error
              : null,
        },
      };
      setChannelSnapshot(snapshot);
      setChannelPollError(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load channel status.';
      setChannelPollError(message);
    }
  }, [runtimeApiKey]);

  const pollMediaStatus = useCallback(async () => {
    try {
      const payload = await getTelegramMediaStatusFromWeb();
      const snapshot: TelegramMediaSnapshot = {
        updatedAt: new Date().toISOString(),
        configuredDir: payload.configuredDir,
        resolvedDir: payload.resolvedDir,
        exists: Boolean(payload.exists),
        filesTotal: Number(payload.filesTotal || 0),
        bytesTotal: Number(payload.bytesTotal || 0),
        truncated: Boolean(payload.truncated),
        recent: Array.isArray(payload.recent)
          ? payload.recent.map((item) => ({
              path: String(item.path || ''),
              bytes: Number(item.bytes || 0),
              mtime: String(item.mtime || ''),
            }))
          : [],
      };
      setMediaSnapshot(snapshot);
      setMediaPollError(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load Telegram media status.';
      setMediaPollError(message);
    }
  }, [getTelegramMediaStatusFromWeb]);

  useEffect(() => {
    const apply = () => setViewportWidth(window.innerWidth);
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [setViewportWidth]);

  useEffect(() => {
    setShowSetupWizard(true);
  }, [setShowSetupWizard]);

  useEffect(() => {
    return () => closeStream();
  }, [closeStream]);

  useEffect(() => {
    const kick = window.setTimeout(() => {
      void pollDaemonStatus('manual');
    }, 0);
    const timer = window.setInterval(() => {
      void pollDaemonStatus('auto');
    }, 15000);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(timer);
    };
  }, [pollDaemonStatus]);

  useEffect(() => {
    const kick = window.setTimeout(() => {
      void pollChannelStatus();
    }, 0);
    const timer = window.setInterval(() => {
      void pollChannelStatus();
    }, 15000);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(timer);
    };
  }, [pollChannelStatus]);

  useEffect(() => {
    const kick = window.setTimeout(() => {
      void pollMediaStatus();
    }, 0);
    const timer = window.setInterval(() => {
      void pollMediaStatus();
    }, 20000);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(timer);
    };
  }, [pollMediaStatus]);

  const isMobile = viewportWidth < 860;
  const telegramHealthy = Boolean(
    channelSnapshot?.telegram.enabled &&
      channelSnapshot.telegram.active &&
      channelSnapshot.telegram.threadAlive &&
      !channelSnapshot.telegram.lastError &&
      !channelSnapshot.telegram.connectorLastError,
  );
  const whatsappHealthy = Boolean(
    channelSnapshot?.whatsapp.enabled &&
      channelSnapshot.whatsapp.active &&
      channelSnapshot.whatsapp.threadAlive &&
      !channelSnapshot.whatsapp.lastError &&
      !channelSnapshot.whatsapp.connectorLastError,
  );
  const hasConnectedTools = connectorCredentials.length > 0;
  const launchAssistantSteps = [
    {
      id: 'access',
      label: 'Step 1',
      title: 'Confirm workspace access',
      copy: 'Make sure the assistant can reach the runtime and local workspace before anything else.',
      state: setupStatus.runtimeReady ? 'Done' : onboardingNextStep === 'runtime' ? 'Now' : 'Pending',
      actionLabel: setupStatus.runtimeReady ? 'Re-check workspace' : 'Check workspace',
      action: () => {
        void runRuntimeCheck();
      },
      emphasized: !setupStatus.runtimeReady,
    },
    {
      id: 'account',
      label: 'Step 2',
      title: 'Choose the AI account',
      copy: 'Pick managed access, your own key, or a local companion so the assistant can run with the right model access.',
      state: setupStatus.accountConnected ? 'Done' : onboardingNextStep === 'account' ? 'Now' : 'Pending',
      actionLabel: setupStatus.accountConnected ? 'Review account step' : 'Open account step',
      action: () => {
        void continueGuidedSetup();
      },
      emphasized: onboardingNextStep === 'account',
    },
    {
      id: 'connections',
      label: 'Step 3',
      title: 'Connect one live tool or channel',
      copy: 'Use Connections for Google, Microsoft 365, Telegram, WhatsApp, and the rest. That page is already the dedicated place to link tools.',
      state: hasConnectedTools ? 'Connected' : 'Optional',
      actionLabel: 'Open Connections',
      href: '/integrations',
      emphasized: !hasConnectedTools && setupReady,
    },
    {
      id: 'launch',
      label: 'Step 4',
      title: 'Start the first task',
      copy: 'Go back to Home and give the assistant one concrete outcome. Keep the first task narrow and easy to verify.',
      state: setupReady ? 'Ready' : 'Blocked',
      actionLabel: 'Open Home',
      href: '/',
      emphasized: setupReady,
    },
  ] as const;

  return (
    <div
      className="orion-page-shell orion-animate-in"
      style={{
        maxWidth: 1080,
        margin: '0 auto',
        padding: isMobile ? '14px' : '22px',
        display: 'grid',
        gap: 14,
      }}
    >
      <header className="orion-page-header">
        <div className="orion-page-title-wrap">
          <div className="orion-page-icon">
            <ShieldCheck size={18} />
          </div>
          <div>
            <h1 className="orion-page-title">Setup</h1>
            <p className="orion-page-subtitle">Launch the assistant with workspace access, one AI account, optional connections, and a clear first task.</p>
          </div>
        </div>
        <div className="orion-page-actions">
          <Link className="orion-btn orion-btn-ghost" href="/integrations" style={{ minHeight: 36 }}>
            Open Connections
          </Link>
          <Link className="orion-btn orion-btn-ghost" href="/" style={{ minHeight: 36 }}>
            Open Home
          </Link>
        </div>
      </header>

      <section
        className="orion-panel muted"
        style={{
          padding: isMobile ? 12 : 16,
          display: 'grid',
          gap: 12,
        }}
      >
        <div className="orion-panel-header" style={{ marginBottom: 0 }}>
          <div>
            <div className="orion-panel-title">Launch Assistant</div>
            <div className="orion-panel-copy">Use Setup for readiness and AI access. Use Connections for channels and tools. Then go back to Home and start the first task.</div>
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))',
            gap: 10,
          }}
        >
          {launchAssistantSteps.map((item) => (
            <div
              key={item.title}
              style={{
                borderRadius: 10,
                border: item.emphasized ? `1px solid ${UI.accentBorder}` : `1px solid ${UI.borderSoft}`,
                background: item.emphasized
                  ? `linear-gradient(180deg, color-mix(in srgb, ${UI.accentSoft} 20%, ${UI.surfaceAlt} 80%) 0%, ${UI.surfaceAlt} 100%)`
                  : UI.surfaceAlt,
                padding: '12px 14px',
                display: 'grid',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ fontSize: 10.5, color: UI.textMuted, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {item.label}
                </div>
                <span
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${item.state === 'Done' || item.state === 'Ready' || item.state === 'Connected' ? UI.successBorder : item.state === 'Now' ? UI.accentBorder : UI.border}`,
                    background: item.state === 'Done' || item.state === 'Ready' || item.state === 'Connected' ? UI.successBg : item.state === 'Now' ? UI.accentSoft : UI.shell,
                    color: item.state === 'Done' || item.state === 'Ready' || item.state === 'Connected' ? UI.successFg : item.state === 'Now' ? UI.accent : UI.textMuted,
                    padding: '2px 8px',
                    fontSize: 10.5,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.state}
                </span>
              </div>
              <div style={{ fontSize: 13.5, color: UI.textSoft, fontWeight: 700 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: UI.textMuted, lineHeight: 1.45 }}>{item.copy}</div>
              {'href' in item ? (
                <Link className="orion-btn orion-btn-ghost" href={item.href} style={{ minHeight: 32, width: 'fit-content', paddingInline: 10, fontSize: 11.5 }}>
                  {item.actionLabel}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={item.action}
                  className="orion-btn orion-btn-ghost"
                  style={{ minHeight: 32, width: 'fit-content', paddingInline: 10, fontSize: 11.5 }}
                >
                  {item.actionLabel}
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <span
            style={{
              borderRadius: 10,
              border: `1px solid ${setupReady ? UI.successBorder : UI.border}`,
              background: setupReady ? UI.successBg : UI.shell,
              color: setupReady ? UI.successFg : UI.textMuted,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {setupReady ? 'Ready' : `Progress ${setupProgressCount}/3`}
          </span>
          <span
            style={{
              borderRadius: 10,
              border: `1px solid ${UI.border}`,
              background: UI.shell,
              color: UI.textSoft,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            Account mode: {connectionMode === 'local_companion' ? 'Local Companion' : connectionMode === 'byok' ? 'Use My Own Key' : 'Managed Access'}
          </span>
          {setupSession?.next_step ? (
            <span
              style={{
                borderRadius: 10,
                border: `1px solid ${UI.border}`,
                background: UI.shell,
                color: UI.textSoft,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              Next: {setupSession.next_step}
            </span>
          ) : null}
          {setupSession?.updated_at ? (
            <span
              style={{
                borderRadius: 10,
                border: `1px solid ${UI.border}`,
                background: UI.shell,
                color: UI.textMuted,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              Updated {fmtTime(setupSession.updated_at)}
            </span>
          ) : null}
        </div>

        {!setupReady ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                void continueGuidedSetup();
              }}
              disabled={setupBusy !== null || isChecking}
              className="orion-btn orion-btn-primary"
              style={{ minHeight: 34, fontSize: 12, opacity: setupBusy !== null || isChecking ? 0.75 : 1 }}
            >
              {onboardingNextStep === 'runtime'
                ? 'Start step 1'
                : onboardingNextStep === 'account'
                ? 'Open step 2'
                : onboardingNextStep === 'connection'
                ? 'Open step 3'
                : 'Continue onboarding'}
            </button>
            <button
              onClick={() => {
                void runRuntimeCheck();
              }}
              disabled={setupBusy !== null || isChecking}
              className="orion-btn orion-btn-ghost"
              style={{ minHeight: 34, fontSize: 12, background: UI.shell, opacity: setupBusy !== null || isChecking ? 0.75 : 1 }}
            >
              Check workspace
            </button>
            <Link className="orion-btn orion-btn-ghost" href="/integrations" style={{ minHeight: 34, fontSize: 12, background: UI.shell }}>
              Open Connections
            </Link>
          </div>
        ) : (
          <div
            style={{
              borderRadius: 10,
              border: `1px solid ${UI.successBorder}`,
              background: UI.successBg,
              color: UI.successFg,
              padding: '9px 10px',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <CheckCircle2 size={14} color={UI.successFg} />
            Setup is complete. Connections stays available for channels and tools, and you can start work from Home.
          </div>
        )}

        {nextSetupStep?.blocked ? (
          <div
            style={{
              borderRadius: 10,
              border: `1px solid ${UI.warningBorder}`,
              background: UI.warningBg,
              color: UI.warningFg,
              padding: '9px 10px',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <AlertTriangle size={14} color={UI.warningFg} />
            {nextSetupStep.label}
          </div>
        ) : null}
      </section>

      <section
        className="orion-panel"
        style={{
          padding: isMobile ? 12 : 16,
        }}
      >
        <SetupWizard
          showSetupWizard={showSetupWizard}
          setShowSetupWizard={setShowSetupWizard}
          setupReady={setupReady}
          setupSteps={setupSteps}
          setupSession={setupSession}
          setupSessionBusy={setupSessionBusy}
          resumeSetupSession={resumeSetupSession}
          cancelSetupSession={cancelSetupSession}
          nextSetupStep={nextSetupStep}
          setupBusy={setupBusy}
          isChecking={isChecking}
          runRuntimeCheck={runRuntimeCheck}
          runtimeApiKey={runtimeApiKey}
          setRuntimeApiKey={setRuntimeApiKey}
          connectionMode={connectionMode}
          setConnectionMode={setConnectionMode}
          setSetupStatus={setSetupStatus}
          provider={provider}
          setProvider={setProvider}
          providerAuthMode={providerAuthMode}
          setProviderAuthMode={setProviderAuthMode}
          setupAction={setupAction}
          providerOptions={providerOptions}
          model={model}
          setModel={setModel}
          modelsLoading={modelsLoading}
          modelOptions={modelOptions}
          selectedProviderOption={selectedProviderOption}
          credentialId={credentialId}
          setCredentialId={setCredentialId}
          providerCredentialOptions={providerCredentialOptions}
          credentialLabel={credentialLabel}
          setCredentialLabel={setCredentialLabel}
          openaiKeyInput={openaiKeyInput}
          setOpenaiKeyInput={setOpenaiKeyInput}
          saveByokCredential={saveByokCredential}
          refreshCredentials={refreshCredentials}
          isCredentialsLoading={isCredentialsLoading}
          connectorCredentialId={connectorCredentialId}
          setConnectorCredentialId={setConnectorCredentialId}
          connectorCredentials={connectorCredentials}
          setConnectorType={setConnectorType}
          connectorType={connectorType}
          connectorLabel={connectorLabel}
          setConnectorLabel={setConnectorLabel}
          googleUseLocalAuth={googleUseLocalAuth}
          setGoogleUseLocalAuth={setGoogleUseLocalAuth}
          googleConnectorToken={googleConnectorToken}
          setGoogleConnectorToken={setGoogleConnectorToken}
          googleCalendarId={googleCalendarId}
          setGoogleCalendarId={setGoogleCalendarId}
          googleTimezone={googleTimezone}
          setGoogleTimezone={setGoogleTimezone}
          microsoftAccessToken={microsoftAccessToken}
          setMicrosoftAccessToken={setMicrosoftAccessToken}
          telegramBotToken={telegramBotToken}
          setTelegramBotToken={setTelegramBotToken}
          telegramChatId={telegramChatId}
          setTelegramChatId={setTelegramChatId}
          discordBotToken={discordBotToken}
          setDiscordBotToken={setDiscordBotToken}
          discordChannelId={discordChannelId}
          setDiscordChannelId={setDiscordChannelId}
          discordGuildId={discordGuildId}
          setDiscordGuildId={setDiscordGuildId}
          instagramAccessToken={instagramAccessToken}
          setInstagramAccessToken={setInstagramAccessToken}
          instagramAccountId={instagramAccountId}
          setInstagramAccountId={setInstagramAccountId}
          instagramPageId={instagramPageId}
          setInstagramPageId={setInstagramPageId}
          twilioAccountSid={twilioAccountSid}
          setTwilioAccountSid={setTwilioAccountSid}
          twilioAuthToken={twilioAuthToken}
          setTwilioAuthToken={setTwilioAuthToken}
          twilioFromNumber={twilioFromNumber}
          setTwilioFromNumber={setTwilioFromNumber}
          twilioToNumber={twilioToNumber}
          setTwilioToNumber={setTwilioToNumber}
          saveConnector={saveConnector}
          refreshConnectors={refreshConnectors}
          isConnectorsLoading={isConnectorsLoading}
          testConnector={testConnector}
          testConnection={testConnection}
          setupStatusObj={setupStatus}
          isMobile={isMobile}
        />
      </section>

      <section
        style={{
          borderRadius: 10,
          border: `1px solid ${UI.border}`,
          background: UI.surface,
          padding: isMobile ? 12 : 16,
          display: 'grid',
          gap: 10,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: UI.textSoft }}>Advanced diagnostics moved to Health</div>
        <div style={{ fontSize: 12, color: UI.textMuted, lineHeight: 1.45 }}>
          Setup is onboarding-first. Runtime controls, daemon recovery, channel reliability, and media diagnostics live in Health.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="orion-btn orion-btn-primary" href="/health" style={{ minHeight: 34, fontSize: 12 }}>
            Open Health
          </Link>
          <button
            onClick={() => {
              void Promise.all([pollDaemonStatus('manual'), pollChannelStatus(), pollMediaStatus()])
                .then(() => addDaemonEvent('info', 'Setup diagnostics refreshed.'))
                .catch((error: unknown) => {
                  const message = error instanceof Error ? error.message : 'Refresh failed.';
                  addDaemonEvent('error', message);
                });
            }}
            className="orion-btn orion-btn-ghost"
            style={{ minHeight: 34, fontSize: 12, background: UI.shell }}
          >
            Refresh status
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              borderRadius: 10,
              border: `1px solid ${daemonSnapshot?.running ? UI.successBorder : UI.warningBorder}`,
              background: daemonSnapshot?.running ? UI.successBg : UI.warningBg,
              color: daemonSnapshot?.running ? UI.successFg : UI.warningFg,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            Daemon {daemonSnapshot?.running ? 'running' : 'offline'}
          </span>
          <span
            style={{
              borderRadius: 10,
              border: `1px solid ${telegramHealthy ? UI.successBorder : UI.warningBorder}`,
              background: telegramHealthy ? UI.successBg : UI.warningBg,
              color: telegramHealthy ? UI.successFg : UI.warningFg,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            Telegram {telegramHealthy ? 'healthy' : 'attention'}
          </span>
          <span
            style={{
              borderRadius: 10,
              border: `1px solid ${whatsappHealthy ? UI.successBorder : UI.warningBorder}`,
              background: whatsappHealthy ? UI.successBg : UI.warningBg,
              color: whatsappHealthy ? UI.successFg : UI.warningFg,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            WhatsApp {whatsappHealthy ? 'healthy' : 'attention'}
          </span>
          <span
            style={{
              borderRadius: 10,
              border: `1px solid ${UI.border}`,
              background: UI.shell,
              color: UI.textMuted,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            Media files {mediaSnapshot?.filesTotal ?? 0}
          </span>
        </div>

        <details
          style={{
            borderTop: `1px solid ${UI.borderSoft}`,
            paddingTop: 8,
          }}
        >
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: UI.textSoft }}>
            Advanced diagnostics
          </summary>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            <div style={{ fontSize: 12, color: UI.textMuted }}>
              Use <Link href="/health" style={{ color: UI.textSoft, textDecoration: 'underline' }}>Health</Link> for full diagnostics and recovery actions.
            </div>

            <div style={{ borderTop: `1px solid ${UI.borderSoft}`, borderBottom: `1px solid ${UI.borderSoft}`, padding: '8px 0', display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 12, color: UI.textSoft }}>
                Daemon {daemonSnapshot?.running ? 'running' : 'offline'} · watchdog {daemonSnapshot?.watchdog.healthy === true ? 'healthy' : daemonSnapshot?.watchdog.healthy === false ? 'unhealthy' : 'pending'} · last poll {daemonLastPollAt ? fmtTime(daemonLastPollAt) : '-'}
              </div>
              <div style={{ fontSize: 12, color: UI.textSoft }}>
                Telegram {telegramHealthy ? 'healthy' : 'attention'} · WhatsApp {whatsappHealthy ? 'healthy' : 'attention'} · media files {mediaSnapshot?.filesTotal ?? 0}
              </div>
              <div style={{ fontSize: 12, color: UI.textMuted }}>
                Last event: {daemonEvents[0] ? `${fmtTime(daemonEvents[0].ts)} · ${daemonEvents[0].message}` : 'none'}
              </div>
            </div>

            {(daemonPollError || channelPollError || mediaPollError) ? (
              <div
                style={{
                  borderLeft: `2px solid ${UI.warningBorder}`,
                  background: UI.warningBg,
                  color: UI.warningFg,
                  padding: '8px 10px',
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                {daemonPollError ? `daemon: ${daemonPollError}` : ''}
                {channelPollError ? `${daemonPollError ? ' | ' : ''}channels: ${channelPollError}` : ''}
                {mediaPollError ? `${daemonPollError || channelPollError ? ' | ' : ''}media: ${mediaPollError}` : ''}
              </div>
            ) : null}
          </div>
        </details>
      </section>

      <section
        style={{
          borderRadius: 10,
          border: `1px solid ${UI.border}`,
          background: UI.surface,
          padding: isMobile ? 12 : 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: UI.textMuted,
          fontSize: 12,
        }}
      >
        <ShieldCheck size={14} color={UI.accent} />
        Use this page for onboarding and tool access changes. Run daily work from Home.
      </section>
    </div>
  );
}
