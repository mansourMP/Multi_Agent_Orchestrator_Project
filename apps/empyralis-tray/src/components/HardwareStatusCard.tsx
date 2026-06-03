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
  if (status.state === 'active') {
    return 'Active';
  }
  if (status.state === 'connected') {
    return 'Connected';
  }
  return 'Idle';
}

export function HardwareStatusCard({ status, loading }: HardwareStatusCardProps) {
  const state = status?.state ?? 'idle';
  const label = statusLabel(status, loading);
  const deviceName = status?.device_name || 'This device';
  const detail = status?.error
    || (status?.gateway_running
      ? 'Gateway and local runner are available.'
      : status?.supervisor_running
        ? 'Local runner is ready. Gateway is stopped.'
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
