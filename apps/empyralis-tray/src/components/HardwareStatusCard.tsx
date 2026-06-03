import type { TrayStatus } from '../tray-client';

type HardwareStatusCardProps = {
  status: TrayStatus | null;
  loading: boolean;
};

function statusLabel(status: TrayStatus | null, loading: boolean): string {
  if (loading && !status) {
    return 'Checking';
  }
  if (!status) {
    return 'Unavailable';
  }
  if (status.error) {
    return 'Needs attention';
  }
  if (status.session_verified && status.state === 'active') {
    return 'Active';
  }
  if (status.session_verified || status.state === 'connected') {
    return 'Connected';
  }
  if (status.state === 'connecting' || status.desired_connected || status.gateway_running || status.supervisor_running) {
    return 'Connecting';
  }
  return 'Idle';
}

export function HardwareStatusCard({ status, loading }: HardwareStatusCardProps) {
  const state = status?.state ?? 'idle';
  const label = statusLabel(status, loading);
  const deviceName = status?.device_name || 'This device';
  const detail = status?.error
    || (status?.session_verified
      ? 'Verified with this workspace.'
      : status?.gateway_running
        ? 'Gateway is running; verifying workspace session.'
        : status?.supervisor_running
          ? 'Local runner is ready; gateway is stopped.'
          : 'No local hardware connection is running.');

  return (
    <section className="hardware-card" aria-label="Hardware status">
      <div className="hardware-card__main">
        <span className={`hardware-card__dot is-${state}`} aria-hidden="true" />
        <div>
          <h1>{deviceName}</h1>
          <p>{detail}</p>
        </div>
      </div>
      <span className={`hardware-card__status is-${state}`}>{label}</span>
    </section>
  );
}
