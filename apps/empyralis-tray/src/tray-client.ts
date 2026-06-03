import { invoke } from '@tauri-apps/api/core';

export type TrayStatusState = 'idle' | 'connected' | 'active' | 'error';

export type TrayStatus = {
  state: TrayStatusState;
  device_name: string;
  supervisor_running: boolean;
  gateway_running: boolean;
  supervisor_adopted: boolean;
  gateway_adopted: boolean;
  session_verified?: boolean;
  heartbeat_fresh?: boolean;
  session_status?: string;
  launch_at_login?: boolean;
  status_url: string;
  error?: string | null;
};

export function getStatus(): Promise<TrayStatus> {
  return invoke<TrayStatus>('get_status');
}

export function connectDevice(): Promise<TrayStatus> {
  return invoke<TrayStatus>('connect_device');
}

export function disconnectDevice(): Promise<TrayStatus> {
  return invoke<TrayStatus>('disconnect_device');
}

export function startGateway(): Promise<TrayStatus> {
  return invoke<TrayStatus>('start_gateway');
}

export function stopGateway(): Promise<TrayStatus> {
  return invoke<TrayStatus>('stop_gateway');
}

export function setLaunchAtLogin(enabled: boolean): Promise<TrayStatus> {
  return invoke<TrayStatus>('set_launch_at_login', { enabled });
}
