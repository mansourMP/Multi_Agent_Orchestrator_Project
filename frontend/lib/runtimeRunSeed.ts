const RUNTIME_RUN_SEED_STORAGE_KEY = 'orion.runtime-run-seeds.v1';
export const RUNTIME_RUN_SEEDS_UPDATED_EVENT = 'orion:runtime-run-seeds';

const RUNTIME_RUN_SEED_TTL_MS = 30 * 60 * 1000;
const MAX_RUNTIME_RUN_SEEDS = 50;

export type RuntimeRunSeed = {
  run_id: string;
  status?: string | null;
  workflow_name?: string | null;
  user_goal?: string | null;
  created_at?: string | null;
  agent_role?: string | null;
  triggered_by?: string | null;
  active_profile_id?: string | null;
  active_profile_label?: string | null;
  active_profile_provider?: string | null;
  active_profile_model?: string | null;
  execution_target_selected?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeSeed(raw: unknown): RuntimeRunSeed | null {
  if (!isRecord(raw)) return null;
  const runId = String(raw.run_id || '').trim();
  if (!runId) return null;
  const createdAt = String(raw.created_at || '').trim();
  return {
    run_id: runId,
    status: String(raw.status || '').trim() || 'running',
    workflow_name: String(raw.workflow_name || '').trim() || null,
    user_goal: String(raw.user_goal || '').trim() || null,
    created_at: createdAt || new Date().toISOString(),
    agent_role: String(raw.agent_role || '').trim() || null,
    triggered_by: String(raw.triggered_by || '').trim() || null,
    active_profile_id: String(raw.active_profile_id || '').trim() || null,
    active_profile_label: String(raw.active_profile_label || '').trim() || null,
    active_profile_provider: String(raw.active_profile_provider || '').trim() || null,
    active_profile_model: String(raw.active_profile_model || '').trim() || null,
    execution_target_selected: String(raw.execution_target_selected || '').trim() || null,
  };
}

function isFresh(seed: RuntimeRunSeed): boolean {
  const createdAt = String(seed.created_at || '').trim();
  if (!createdAt) return true;
  const timestamp = new Date(createdAt).getTime();
  if (Number.isNaN(timestamp)) return true;
  return Date.now() - timestamp <= RUNTIME_RUN_SEED_TTL_MS;
}

function persistSeeds(items: RuntimeRunSeed[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(RUNTIME_RUN_SEED_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(RUNTIME_RUN_SEEDS_UPDATED_EVENT));
  } catch {
    // Ignore storage failures.
  }
}

export function readSeededRuntimeRuns(): RuntimeRunSeed[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(RUNTIME_RUN_SEED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .map((item) => normalizeSeed(item))
      .filter((item): item is RuntimeRunSeed => item !== null)
      .filter(isFresh)
      .slice(0, MAX_RUNTIME_RUN_SEEDS);
    if (normalized.length !== parsed.length) persistSeeds(normalized);
    return normalized;
  } catch {
    return [];
  }
}

export function upsertSeededRuntimeRun(seed: RuntimeRunSeed): void {
  const normalized = normalizeSeed(seed);
  if (!normalized) return;
  const existing = readSeededRuntimeRuns().filter((item) => item.run_id !== normalized.run_id);
  persistSeeds([normalized, ...existing].slice(0, MAX_RUNTIME_RUN_SEEDS));
}
