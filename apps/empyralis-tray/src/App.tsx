import { useCallback, useEffect, useState } from 'react';

import {
  connectDevice,
  disconnectDevice,
  getStatus,
  setLaunchAtLogin,
  startGateway,
  stopGateway,
  type TrayStatus,
} from './tray-client';

function statusLabel(status: TrayStatus | null, loading: boolean): string {
  if (loading && !status) {
    return 'Checking';
  }
  if (!status) {
    return 'Idle';
  }
  if (status.error) {
    return 'Error';
  }
  if (status.session_verified && status.state === 'active') {
    return 'Active';
  }
  if (status.state === 'connecting' || status.desired_connected) {
    return 'Connecting';
  }
  return 'Idle';
}

function workspaceState(status: TrayStatus | null): string {
  if (!status) {
    return 'Not verified';
  }
  if (status.error) {
    return status.error;
  }
  if (status.session_verified) {
    return 'Verified with this workspace';
  }
  if (status.session_status && status.session_status !== 'none') {
    return status.session_status;
  }
  if (status.gateway_running) {
    return 'Empyralis Agent running, session not verified';
  }
  return 'Not verified';
}

function boolText(enabled: boolean | undefined): string {
  return enabled ? 'On' : 'Off';
}

function boolClass(enabled: boolean | undefined): string {
  return enabled ? 'is-on' : 'is-off';
}

function normalizeStateClass(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '-');
}

export function App() {
  const [status, setStatus] = useState<TrayStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await getStatus();
    setStatus(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh().catch(() => setLoading(false));
    const interval = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const run = useCallback(async (action: () => Promise<TrayStatus>) => {
    setBusy(true);
    try {
      setStatus(await action());
    } finally {
      setBusy(false);
      void refresh().catch(() => undefined);
    }
  }, [refresh]);

  const label = statusLabel(status, loading);
  const stateClass = normalizeStateClass(label);
  const machineName = status?.device_name || 'This device';
  const isConnected = Boolean(status?.session_verified);
  const gatewayRunning = Boolean(status?.gateway_running);
  const reconnecting = status?.desired_connected === true || status?.state === 'connecting';

  return (
    <main className="tray-shell" aria-label="Empyralis hardware menu">
      <section className="tray-section tray-section--machine" aria-label="Machine status">
        <div className="tray-row tray-row--machine">
          <span className={`tray-dot is-${stateClass}`} aria-hidden="true" />
          <div className="tray-copy">
            <h1>{machineName}</h1>
            <p>{workspaceState(status)}</p>
          </div>
          <strong className={`tray-status state-${stateClass}`}>{label}</strong>
        </div>
      </section>

      <div className="tray-separator" />

      <section className="tray-section" aria-label="Controls">
        <div className="tray-control-row">
          <button className="app-button" disabled={busy} onClick={() => (isConnected ? void run(disconnectDevice) : void run(connectDevice))}>
            {isConnected ? 'Disconnect' : reconnecting ? 'Reconnect' : 'Connect'}
          </button>
          <button className="app-button" disabled={busy} onClick={() => (gatewayRunning ? void run(stopGateway) : void run(startGateway))}>
            {gatewayRunning ? 'Stop Agent' : 'Start Agent'}
          </button>
        </div>
        <label className="tray-row tray-row--toggle">
          <span>Launch at login</span>
          <input
            type="checkbox"
            checked={Boolean(status?.launch_at_login)}
            disabled={busy}
            onChange={(event) => void run(() => setLaunchAtLogin(event.currentTarget.checked))}
          />
        </label>
      </section>

      <div className="tray-separator" />

      <section className="tray-section" aria-label="Usage">
        <div className="tray-section-title">Usage</div>
        <div className="tray-row">
          <span>Current</span>
          <span className="tray-value is-muted">Usage unavailable</span>
        </div>
      </section>

      <div className="tray-separator" />

      <details className="tray-diagnostics">
        <summary>Diagnostics</summary>
        <section className="tray-section" aria-label="Diagnostics">
          <div className="tray-row">
            <span>Agent process</span>
            <span className={`tray-value ${boolClass(status?.gateway_running)}`}>{boolText(status?.gateway_running)}</span>
          </div>
          <div className="tray-row">
            <span>Local runner</span>
            <span className={`tray-value ${boolClass(status?.supervisor_running)}`}>{boolText(status?.supervisor_running)}</span>
          </div>
          <div className="tray-row">
            <span>Workspace session</span>
            <span className={`tray-value ${boolClass(status?.session_verified)}`}>{boolText(status?.session_verified)}</span>
          </div>
          <div className="tray-row">
            <span>Heartbeat</span>
            <span className={`tray-value ${boolClass(status?.heartbeat_fresh)}`}>{boolText(status?.heartbeat_fresh)}</span>
          </div>
        </section>
      </details>
    </main>
  );
}
