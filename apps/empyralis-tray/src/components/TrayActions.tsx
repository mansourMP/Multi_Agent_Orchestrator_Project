import { AppButton } from './AppButton';
import type { TrayStatus } from '../tray-client';

type TrayActionsProps = {
  status: TrayStatus | null;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onStartGateway: () => void;
  onStopGateway: () => void;
  onSetLaunchAtLogin: (enabled: boolean) => void;
};

export function TrayActions({
  status,
  busy,
  onConnect,
  onDisconnect,
  onStartGateway,
  onStopGateway,
  onSetLaunchAtLogin,
}: TrayActionsProps) {
  const connected = Boolean(status?.session_verified);
  const processRunning = Boolean(status?.supervisor_running || status?.gateway_running);
  const gatewayRunning = Boolean(status?.gateway_running);

  return (
    <section className="tray-actions" aria-label="Hardware controls">
      <AppButton disabled={busy} onClick={connected ? onDisconnect : onConnect}>
        {connected ? 'Disconnect device' : processRunning ? 'Reconnect device' : 'Connect this device'}
      </AppButton>
      <AppButton disabled={busy} onClick={gatewayRunning ? onStopGateway : onStartGateway}>
        {gatewayRunning ? 'Stop Gateway' : 'Start Gateway'}
      </AppButton>
      <label className="tray-toggle">
        <input
          type="checkbox"
          checked={Boolean(status?.launch_at_login)}
          disabled={busy}
          onChange={(event) => onSetLaunchAtLogin(event.currentTarget.checked)}
        />
        <span>Launch at login</span>
      </label>
    </section>
  );
}
