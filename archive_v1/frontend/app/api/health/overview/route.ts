import type { NextRequest } from 'next/server';
import { enforceBffRouteGuard } from '@/lib/server/bffRouteGuard';
import { requireControlPlaneSession } from '@/lib/server/controlPlaneSession';
import { runtimeJsonRequest } from '@/lib/server/runtimeControlPlane';

export const dynamic = 'force-dynamic';

type OverviewEntry = {
  status: number;
  latency: number;
  payload: unknown;
};

async function timedRuntimeRequest(runtimePath: string): Promise<OverviewEntry> {
  const started = Date.now();
  try {
    const { status, payload } = await runtimeJsonRequest(runtimePath, { method: 'GET' });
    return {
      status,
      latency: Date.now() - started,
      payload,
    };
  } catch (error) {
    return {
      status: 503,
      latency: Date.now() - started,
      payload: {
        detail: error instanceof Error ? error.message : `Request failed for ${runtimePath}.`,
      },
    };
  }
}

function normalizeHealthPayload(payload: unknown) {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  return {
    ok: Boolean(record.ok),
    auth_required: Boolean(record.auth_required),
    openai_key_present: Boolean(record.openai_key_present),
    openai_key_valid: Boolean(record.openai_key_valid),
    openai_status: record.openai_status ?? null,
    openai_error: typeof record.openai_error === 'string' ? record.openai_error : null,
  };
}

function normalizeDoctorPayload(payload: unknown) {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  return {
    ok: Boolean(record.ok),
    overview: record.overview && typeof record.overview === 'object'
      ? {
          status: String((record.overview as Record<string, unknown>).status || '').trim() || 'warn',
          title: String((record.overview as Record<string, unknown>).title || '').trim(),
          detail: String((record.overview as Record<string, unknown>).detail || '').trim(),
        }
      : undefined,
    summary: record.summary && typeof record.summary === 'object'
      ? {
          pass: Number((record.summary as Record<string, unknown>).pass || 0),
          warn: Number((record.summary as Record<string, unknown>).warn || 0),
          fail: Number((record.summary as Record<string, unknown>).fail || 0),
        }
      : { pass: 0, warn: 0, fail: 0 },
    groups: Array.isArray(record.groups) ? record.groups : [],
    priority_fixes: Array.isArray(record.priority_fixes) ? record.priority_fixes : [],
    checks: Array.isArray(record.checks) ? record.checks : [],
    generated_at: typeof record.generated_at === 'string' ? record.generated_at : undefined,
  };
}

function normalizeDoctorHistoryPayload(payload: unknown) {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const items = Array.isArray(record.items) ? record.items : [];
  return {
    items: items.map((item) => {
      const entry = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const overview = entry.overview && typeof entry.overview === 'object'
        ? (entry.overview as Record<string, unknown>)
        : {};
      const summary = entry.summary && typeof entry.summary === 'object'
        ? (entry.summary as Record<string, unknown>)
        : {};
      return {
        generated_at: typeof entry.generated_at === 'string' ? entry.generated_at : null,
        ok: Boolean(entry.ok),
        overview: {
          status: String(overview.status || '').trim() || 'warn',
          title: String(overview.title || '').trim(),
          detail: String(overview.detail || '').trim(),
        },
        summary: {
          pass: Number(summary.pass || 0),
          warn: Number(summary.warn || 0),
          fail: Number(summary.fail || 0),
        },
      };
    }),
    count: Number(record.count || 0),
    updated_at: typeof record.updated_at === 'string' ? record.updated_at : null,
  };
}

function normalizeMetricsPayload(payload: unknown) {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const runs = record.runs && typeof record.runs === 'object' ? (record.runs as Record<string, unknown>) : {};
  const kpis = record.kpis && typeof record.kpis === 'object' ? (record.kpis as Record<string, unknown>) : {};
  return {
    auth_required: Boolean(record.auth_required),
    runs: {
      started: Number(runs.started || 0),
      completed: Number(runs.completed || 0),
      failed: Number(runs.failed || 0),
      timeout: Number(runs.timeout || 0),
      active: Number(runs.active || 0),
      waiting_for_input: Number(runs.waiting_for_input || 0),
      completion_rate: Number(runs.completion_rate || 0),
    },
    kpis: {
      avg_run_duration_ms: Number(kpis.avg_run_duration_ms || 0),
      avg_time_to_first_value_ms: Number(kpis.avg_time_to_first_value_ms || 0),
      avg_human_wait_ms: Number(kpis.avg_human_wait_ms || 0),
    },
  };
}

function normalizeProfilesPayload(payload: unknown) {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const summary = record.summary && typeof record.summary === 'object' ? (record.summary as Record<string, unknown>) : {};
  const items = Array.isArray(record.items) ? record.items : [];
  return {
    summary: {
      healthy: Number(summary.healthy || 0),
      cooldown: Number(summary.cooldown || 0),
      disabled: Number(summary.disabled || 0),
      total: Number(summary.total || 0),
    },
    items: items.map((item) => {
      const entry = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        id: typeof entry.id === 'string' ? entry.id : undefined,
        provider: typeof entry.provider === 'string' ? entry.provider : undefined,
        label: typeof entry.label === 'string' ? entry.label : undefined,
        health: typeof entry.health === 'string' ? entry.health : undefined,
        cooldown_until: typeof entry.cooldown_until === 'string' ? entry.cooldown_until : null,
        last_error: typeof entry.last_error === 'string' ? entry.last_error : null,
        success_count: typeof entry.success_count === 'number' ? entry.success_count : 0,
        failure_count: typeof entry.failure_count === 'number' ? entry.failure_count : 0,
      };
    }),
  };
}

function normalizeValidationPayload(payload: unknown) {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const summary = record.summary && typeof record.summary === 'object' ? (record.summary as Record<string, unknown>) : {};
  const checks = Array.isArray(record.checks) ? record.checks : [];
  return {
    suite: typeof record.suite === 'string' ? record.suite : '',
    generated_at: typeof record.generated_at === 'string' ? record.generated_at : null,
    detail: typeof record.detail === 'string' ? record.detail : undefined,
    summary: {
      pass: Number(summary.pass || 0),
      fail: Number(summary.fail || 0),
      total: Number(summary.total || 0),
      ok: Boolean(summary.ok),
    },
    checks: checks.map((item) => {
      const entry = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        name: typeof entry.name === 'string' ? entry.name : '',
        status: typeof entry.status === 'string' ? entry.status : 'fail',
      };
    }).filter((item) => item.name),
  };
}

function normalizeValidationHistoryPayload(payload: unknown) {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const items = Array.isArray(record.items) ? record.items : [];
  return {
    items: items.map((item) => {
      const entry = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const summary = entry.summary && typeof entry.summary === 'object' ? (entry.summary as Record<string, unknown>) : {};
      return {
        suite: typeof entry.suite === 'string' ? entry.suite : '',
        generated_at: typeof entry.generated_at === 'string' ? entry.generated_at : null,
        detail: typeof entry.detail === 'string' ? entry.detail : null,
        filename: typeof entry.filename === 'string' ? entry.filename : undefined,
        summary: {
          pass: Number(summary.pass || 0),
          fail: Number(summary.fail || 0),
          total: Number(summary.total || 0),
          ok: Boolean(summary.ok),
        },
      };
    }).filter((item) => item.suite),
    count: Number(record.count || 0),
  };
}

function normalizeWorkersPayload(payload: unknown) {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const summary = record.summary && typeof record.summary === 'object' ? (record.summary as Record<string, unknown>) : {};
  const items = Array.isArray(record.items) ? record.items : [];
  return {
    summary: {
      known: Number(summary.known || 0),
      online: Number(summary.online || 0),
      busy: Number(summary.busy || 0),
      idle: Number(summary.idle || 0),
      offline: Number(summary.offline || 0),
      pending_runs: Number(summary.pending_runs || 0),
      claimed_runs: Number(summary.claimed_runs || 0),
    },
    items: items.map((item) => {
      const entry = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        runtime_id: typeof entry.runtime_id === 'string' ? entry.runtime_id : '',
        status: typeof entry.status === 'string' ? entry.status : 'offline',
        online: Boolean(entry.online),
        current_task_id: typeof entry.current_task_id === 'string' ? entry.current_task_id : null,
        last_seen_at: typeof entry.last_seen_at === 'string' ? entry.last_seen_at : null,
        note: typeof entry.note === 'string' ? entry.note : null,
      };
    }).filter((item) => item.runtime_id),
  };
}

function normalizeDesktopHistoryPayload(payload: unknown) {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const items = Array.isArray(record.items) ? record.items : [];
  return {
    items: items.map((item) => {
      const entry = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      return {
        run_id: String(entry.run_id || '').trim(),
        status: typeof entry.status === 'string' ? entry.status : '',
        pack_id: typeof entry.pack_id === 'string' ? entry.pack_id : null,
        agent_role: typeof entry.agent_role === 'string' ? entry.agent_role : null,
        created_at: typeof entry.created_at === 'string' ? entry.created_at : null,
        result_summary: typeof entry.result_summary === 'string' ? entry.result_summary : null,
      };
    }).filter((item) => item.run_id),
  };
}

export async function GET(request: NextRequest) {
  const rejection = enforceBffRouteGuard(request, { methods: ['GET'] });
  if (rejection) return rejection;
  const authFailure = await requireControlPlaneSession(request);
  if (authFailure) return authFailure;

  const [
    health,
    doctor,
    doctorHistory,
    metrics,
    profiles,
    validation,
    validationHistory,
    workers,
    desktopHistory,
  ] = await Promise.all([
    timedRuntimeRequest('/health'),
    timedRuntimeRequest('/doctor'),
    timedRuntimeRequest('/doctor/history?limit=8'),
    timedRuntimeRequest('/metrics'),
    timedRuntimeRequest('/providers/profiles/health?workspace_id=default'),
    timedRuntimeRequest('/validation/latest'),
    timedRuntimeRequest('/validation/history?limit=6'),
    timedRuntimeRequest('/runtime/runtimes/status'),
    timedRuntimeRequest('/history/runs?limit=6&status=failed&pack_id=local-execution-v1'),
  ]);

  return Response.json({
    backend: {
      status: health.status,
      latency: health.latency,
      payload: health.status >= 200 && health.status < 300
        ? { detail: 'Backend API reachable.' }
        : health.payload,
    },
    runtime: {
      status: health.status,
      latency: health.latency,
      payload: normalizeHealthPayload(health.payload),
    },
    doctor: {
      status: doctor.status,
      latency: doctor.latency,
      payload: normalizeDoctorPayload(doctor.payload),
    },
    doctorHistory: {
      status: doctorHistory.status,
      latency: doctorHistory.latency,
      payload: normalizeDoctorHistoryPayload(doctorHistory.payload),
    },
    metrics: {
      status: metrics.status,
      latency: metrics.latency,
      payload: normalizeMetricsPayload(metrics.payload),
    },
    profiles: {
      status: profiles.status,
      latency: profiles.latency,
      payload: normalizeProfilesPayload(profiles.payload),
    },
    validation: {
      status: validation.status,
      latency: validation.latency,
      payload: normalizeValidationPayload(validation.payload),
    },
    validationHistory: {
      status: validationHistory.status,
      latency: validationHistory.latency,
      payload: normalizeValidationHistoryPayload(validationHistory.payload),
    },
    workers: {
      status: workers.status,
      latency: workers.latency,
      payload: normalizeWorkersPayload(workers.payload),
    },
    desktopHistory: {
      status: desktopHistory.status,
      latency: desktopHistory.latency,
      payload: normalizeDesktopHistoryPayload(desktopHistory.payload),
    },
  });
}
