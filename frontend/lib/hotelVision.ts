'use client';

import { ORION_API_URL } from '@/app/page.api';
import { readRuntimeApiKeyFromStorage } from '@/lib/runtimeKey';

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
  hotel_name?: string;
  timezone?: string;
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

async function readJson<T>(url: string, fallbackMessage: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...runtimeHeaders(),
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((body as { detail?: string; message?: string })?.detail || (body as { message?: string })?.message || fallbackMessage));
  }
  return body as T;
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
  await readJson(`${ORION_API_URL}/api/solutions/hotel-vision/alerts/${encodeURIComponent(alertId)}/resolve`, 'Failed to resolve alert.', {
    method: 'POST',
  });
}

export async function askHotelSpace(spaceId: string, question: string): Promise<string> {
  const body = await readJson<{ answer?: string }>(
    `${ORION_API_URL}/api/solutions/hotel-vision/spaces/${encodeURIComponent(spaceId)}/ask`,
    'Failed to ask space.',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    },
  );
  return String(body.answer || '').trim();
}

export async function updateHotelSpaceConfig(
  spaceId: string,
  payload: {
    space_name?: string;
    camera_url?: string;
    business_hours?: Record<string, string>;
    scan_cadence_minutes?: number;
    busy_threshold?: number;
    telegram_recipients?: string[];
    hotel_name?: string;
    timezone?: string;
  },
): Promise<HotelSpace> {
  const body = await readJson<{ item?: HotelSpace }>(
    `${ORION_API_URL}/api/solutions/hotel-vision/spaces/${encodeURIComponent(spaceId)}/config`,
    'Failed to save space settings.',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  return (body.item && typeof body.item === 'object' ? body.item : { space_id: spaceId, space_name: spaceId, status: 'unknown', occupancy_count: 0 }) as HotelSpace;
}

export function statusTone(status: string): 'green' | 'yellow' | 'red' | 'grey' {
  const token = String(status || '').trim().toLowerCase();
  if (token === 'open_normal') return 'green';
  if (token === 'open_busy') return 'yellow';
  if (token === 'alert') return 'red';
  return 'grey';
}

export function alertSeverityTone(severity: string): 'green' | 'yellow' | 'red' | 'grey' {
  const token = String(severity || '').trim().toLowerCase();
  if (token === 'critical') return 'red';
  if (token === 'warning') return 'yellow';
  if (token === 'info') return 'green';
  return 'grey';
}
