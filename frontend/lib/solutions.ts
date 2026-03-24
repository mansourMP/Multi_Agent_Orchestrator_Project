'use client';

import { ORION_API_URL } from '@/app/page.api';
import { fetchWorkflows } from '@/lib/api';
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
    recent_alerts?: Array<{
      id: string;
      ts: string;
      title?: string;
      message: string;
      severity?: string;
      solution_id?: string;
    }>;
  };
};

export type SolutionsState = {
  installed: InstalledSolution[];
  active: InstalledSolution[];
  mcp_endpoint?: string | null;
  mcp_tools?: string[];
};

export type RecentRunItem = {
  run_id: string;
  status?: string | null;
  agent_role?: string | null;
  user_goal?: string | null;
  result_summary?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AutomationRecord = {
  id: string;
  name: string;
  description?: string;
  status?: string;
  updatedAt?: string | null;
  lastRun?: string | null;
};

function runtimeHeaders(): HeadersInit {
  const runtimeKey = readRuntimeApiKeyFromStorage('');
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

export async function fetchSolutionsState(): Promise<SolutionsState> {
  const body = await readJson<{ installed?: InstalledSolution[]; active?: InstalledSolution[]; mcp_endpoint?: string | null; mcp_tools?: string[] }>(`${ORION_API_URL}/solutions/state`, 'Failed to load solutions.');
  return {
    installed: Array.isArray(body.installed) ? body.installed : [],
    active: Array.isArray(body.active) ? body.active : [],
    mcp_endpoint: typeof body.mcp_endpoint === 'string' && body.mcp_endpoint.trim() ? body.mcp_endpoint.trim() : null,
    mcp_tools: Array.isArray(body.mcp_tools) ? body.mcp_tools.map((item) => String(item || '').trim()).filter(Boolean) : [],
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

export async function fetchAutomations(workspaceId: string = 'default'): Promise<AutomationRecord[]> {
  const body = await fetchWorkflows(workspaceId);
  const items = Array.isArray(body)
    ? body
    : Array.isArray((body as { items?: unknown[] } | null | undefined)?.items)
      ? (body as { items: AutomationRecord[] }).items
      : [];
  return items.filter((item): item is AutomationRecord => Boolean(item && typeof item === 'object' && String((item as { id?: unknown }).id || '').trim()));
}

export async function fetchRecentRuns(limit: number = 5, workspaceId: string = 'default'): Promise<RecentRunItem[]> {
  const params = new URLSearchParams();
  params.set('limit', String(Math.max(1, limit)));
  params.set('workspace_id', workspaceId);
  const body = await readJson<{ items?: RecentRunItem[] }>(`${ORION_API_URL}/history/runs?${params.toString()}`, 'Failed to load recent runs.');
  return Array.isArray(body.items) ? body.items : [];
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
