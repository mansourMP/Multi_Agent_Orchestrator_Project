'use client';

import { ensureControlPlaneSession } from '@/lib/controlPlaneSession';

export type DesktopSetupCheck = {
  id: string;
  label: string;
  status: 'granted' | 'denied' | 'unsupported' | 'unknown';
  source?: string | null;
  detail?: string | null;
  settings_target?: string | null;
};

export type DesktopSetupStatus = {
  ok: boolean;
  platform: string;
  desktop_setup_completed: boolean;
  can_continue: boolean;
  checks: DesktopSetupCheck[];
  missing_ids: string[];
  machine?: {
    machine_id?: string | null;
    display_name?: string | null;
    online?: boolean;
    runtime_type?: string | null;
    enrollment_state?: string | null;
    last_seen_at?: string | null;
  } | null;
};

export type DesktopDemoStatus = {
  ok: boolean;
  run_id: string;
  workspace_id?: string;
  status: string;
  terminal: boolean;
  summary: string;
  description: string;
  failure_message?: string | null;
  artifact?: {
    artifact_id?: string | null;
    label?: string | null;
    uri: string;
    content_type?: string | null;
    byte_size?: number | null;
    kind?: string | null;
  } | null;
  ocr?: {
    status: string;
    text: string;
    error?: string | null;
  } | null;
};

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  await ensureControlPlaneSession();
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload?.detail === 'string' ? payload.detail.trim() : '';
    throw new Error(detail || `Request failed: ${response.status}`);
  }
  return payload as T;
}

export async function fetchDesktopSetupStatus(workspaceId = 'default'): Promise<DesktopSetupStatus> {
  return jsonFetch<DesktopSetupStatus>(`/api/setup/desktop?workspaceId=${encodeURIComponent(workspaceId)}`, {
    method: 'GET',
  });
}

export async function completeDesktopSetup(workspaceId = 'default'): Promise<DesktopSetupStatus> {
  return jsonFetch<DesktopSetupStatus>('/api/setup/desktop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId }),
  });
}

export async function startDesktopDemo(workspaceId = 'default'): Promise<{ ok: boolean; run_id: string; status: string }> {
  return jsonFetch<{ ok: boolean; run_id: string; status: string }>('/api/demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId }),
  });
}

export async function fetchDesktopDemoStatus(runId: string, workspaceId = 'default'): Promise<DesktopDemoStatus> {
  return jsonFetch<DesktopDemoStatus>(`/api/demo/${encodeURIComponent(runId)}?workspaceId=${encodeURIComponent(workspaceId)}`, {
    method: 'GET',
  });
}
