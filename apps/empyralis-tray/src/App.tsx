import { useCallback, useEffect, useState } from 'react';

import { HardwareStatusCard } from './components/HardwareStatusCard';
import { TrayActions } from './components/TrayActions';
import {
  connectDevice,
  disconnectDevice,
  getStatus,
  setLaunchAtLogin,
  startGateway,
  stopGateway,
  type TrayStatus,
} from './tray-client';

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

  return (
    <main className="tray-shell">
      <HardwareStatusCard status={status} loading={loading} />
      <TrayActions
        status={status}
        busy={busy}
        onConnect={() => void run(connectDevice)}
        onDisconnect={() => void run(disconnectDevice)}
        onStartGateway={() => void run(startGateway)}
        onStopGateway={() => void run(stopGateway)}
        onSetLaunchAtLogin={(enabled) => void run(() => setLaunchAtLogin(enabled))}
      />
      <footer className="tray-footer">
        <span>Local status</span>
        <code>{status?.status_url ?? 'http://127.0.0.1:7790/status'}</code>
      </footer>
    </main>
  );
}
