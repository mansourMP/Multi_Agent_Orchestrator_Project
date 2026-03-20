'use client';

import { ORION_API_URL } from '@/app/page.api';
import { readRuntimeApiKeyFromStorage } from '@/lib/runtimeKey';

export type InstalledSolution = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  route_base?: string;
  primary_route?: string;
  required_skills?: string[];
  ui_preset?: {
    nav_items?: Array<{ label?: string; href?: string; icon?: string }>;
    admin_bottom_items?: Array<{ label?: string; href?: string; icon?: string }>;
  };
  status?: {
    ok?: boolean;
    spaces_monitored?: number;
    unresolved_alerts?: number;
    last_scan_at?: string | null;
    summary?: string;
  };
};

export type HotelSpace = {
  space_id: string;
  space_name: string;
  status: string;
  occupancy_count: number;
  updated_at?: string | null;
  confidence?: number;
  summary_line?: string;
  summary_lines?: string[];
  snapshot_url?: string;
  unresolved_alert_count?: number;
  business_hours?: Record<string, string>;
  scan_cadence_minutes?: number;
  busy_threshold?: number;
  telegram_recipients?: string[];
  camera_url?: string;
  current_state?: Record<string, unknown>;
};

export type HotelAlert = {
  id: string;
  ts: string;
  space_id: string;
  space_name?: string;
  severity: string;
  code: string;
  message: string;
  resolved: boolean;
};

export type HotelHistoryItem = {
  ts: string;
  space_id: string;
  occupancy_count: number;
  status: string;
  business_state?: string;
  anomaly?: boolean;
  confidence?: number;
};

function runtimeHeaders(): HeadersInit {
  const runtimeKey = readRuntimeApiKeyFromStorage(process.env.NEXT_PUBLIC_ORION_API_KEY || 'replace-with-strong-key');
  return runtimeKey ? { 'X-API-Key': runtimeKey } : {};
}

async function readJson<T>(url: string, fallbackMessage: string): Promise<T> {
  const res = await fetch(url, { headers: runtimeHeaders() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((body as { detail?: string; message?: string })?.detail || (body as { message?: string })?.message || fallbackMessage));
  }
  return body as T;
}

export async function fetchSolutionsState(): Promise<{ installed: InstalledSolution[]; active: InstalledSolution[] }> {
  const body = await readJson<{ installed?: InstalledSolution[]; active?: InstalledSolution[] }>(`${ORION_API_URL}/solutions/state`, 'Failed to load solutions.');
  return {
    installed: Array.isArray(body.installed) ? body.installed : [],
    active: Array.isArray(body.active) ? body.active : [],
  };
}

export async function fetchSkillsState(): Promise<{ installed: Array<{ id: string; name: string; enabled: boolean }> }> {
  const body = await readJson<{ installed?: Array<{ id: string; name: string; enabled: boolean }> }>(`${ORION_API_URL}/skills/state`, 'Failed to load skills.');
  return { installed: Array.isArray(body.installed) ? body.installed : [] };
}

export async function fetchWeeklySchedules(): Promise<Array<Record<string, unknown>>> {
  const body = await readJson<{ items?: Array<Record<string, unknown>> }>(`${ORION_API_URL}/schedules/weekly`, 'Failed to load schedules.');
  return Array.isArray(body.items) ? body.items : [];
}

export async function fetchHotelSpaces(): Promise<HotelSpace[]> {
  const body = await readJson<{ items?: HotelSpace[] }>(`${ORION_API_URL}/api/solutions/hotel-vision/spaces`, 'Failed to load spaces.');
  return Array.isArray(body.items) ? body.items : [];
}

export async function fetchHotelSpace(spaceId: string): Promise<HotelSpace> {
  const body = await readJson<{ item?: HotelSpace }>(`${ORION_API_URL}/api/solutions/hotel-vision/spaces/${encodeURIComponent(spaceId)}`, 'Failed to load space.');
  return (body.item && typeof body.item === 'object' ? body.item : { space_id: spaceId, space_name: spaceId, status: 'unknown', occupancy_count: 0 }) as HotelSpace;
}

export async function fetchHotelSpaceHistory(spaceId: string): Promise<HotelHistoryItem[]> {
  const body = await readJson<{ items?: HotelHistoryItem[] }>(`${ORION_API_URL}/api/solutions/hotel-vision/spaces/${encodeURIComponent(spaceId)}/history`, 'Failed to load history.');
  return Array.isArray(body.items) ? body.items : [];
}

export async function fetchHotelAlerts(params?: { unresolvedOnly?: boolean; days?: number; spaceId?: string }): Promise<HotelAlert[]> {
  const search = new URLSearchParams();
  if (params?.unresolvedOnly) search.set('unresolved_only', 'true');
  if (params?.days) search.set('days', String(params.days));
  if (params?.spaceId) search.set('space_id', params.spaceId);
  const suffix = search.toString() ? `?${search.toString()}` : '';
  const body = await readJson<{ items?: HotelAlert[] }>(`${ORION_API_URL}/api/solutions/hotel-vision/alerts${suffix}`, 'Failed to load alerts.');
  return Array.isArray(body.items) ? body.items : [];
}

export async function resolveHotelAlert(alertId: string): Promise<void> {
  await readJson(`${ORION_API_URL}/api/solutions/hotel-vision/alerts/${encodeURIComponent(alertId)}/resolve`, 'Failed to resolve alert.');
}

export async function askHotelSpace(spaceId: string, question: string): Promise<string> {
  const res = await fetch(`${ORION_API_URL}/api/solutions/hotel-vision/spaces/${encodeURIComponent(spaceId)}/ask`, {
    method: 'POST',
    headers: { ...runtimeHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((body as { detail?: string; message?: string })?.detail || (body as { message?: string })?.message || 'Failed to ask space.'));
  }
  return String((body as { answer?: string }).answer || '').trim();
}

export function formatRelativeTime(value: string | null | undefined): string {
  const token = String(value || '').trim();
  if (!token) return 'Unknown';
  const parsed = Date.parse(token);
  if (!Number.isFinite(parsed)) return 'Unknown';
  const deltaMs = Date.now() - parsed;
  const deltaMinutes = Math.round(deltaMs / 60000);
  if (deltaMinutes <= 1) return '1 min ago';
  if (deltaMinutes < 60) return `${deltaMinutes} min ago`;
  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours} hr ago`;
  const deltaDays = Math.round(deltaHours / 24);
  return `${deltaDays} day${deltaDays === 1 ? '' : 's'} ago`;
}

export function statusTone(status: string): 'green' | 'yellow' | 'red' | 'grey' {
  const token = String(status || '').trim().toLowerCase();
  if (token === 'open_normal') {
    return 'green';
  }
  if (token === 'open_busy') {
    return 'yellow';
  }
  if (token === 'alert') {
    return 'red';
  }
  return 'grey';
}

export function alertSeverityTone(severity: string): 'green' | 'yellow' | 'red' | 'grey' {
  const token = String(severity || '').trim().toLowerCase();
  if (token === 'critical') return 'red';
  if (token === 'warning') return 'yellow';
  if (token === 'info') return 'green';
  return 'grey';
}
