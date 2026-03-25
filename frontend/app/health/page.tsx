'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Laptop,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
  XCircle,
} from 'lucide-react';
import { OsPageHeader } from '@/components/ui/OsPageHeader';
import { BRAND } from '@/lib/brand';
import { API_BASE } from '@/lib/config';
import {
  collectPriorityFixes,
  DoctorCheckGroup,
  formatDoctorCheckTitle,
  groupDoctorChecks,
  PriorityFix,
} from '@/lib/doctorChecks';

type CardStatus = 'loading' | 'ok' | 'warn' | 'error';

type StatusCardData = {
  status: CardStatus;
  latency?: number;
  detail?: string;
};

type DoctorCheck = {
  name: string;
  status: 'pass' | 'warn' | 'fail' | string;
  detail?: string;
  recommendation?: string;
};

type DoctorPayload = {
  ok: boolean;
  overview?: {
    status: 'pass' | 'warn' | 'fail' | string;
    title: string;
    detail: string;
  };
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
  groups?: DoctorCheckGroup[];
  priority_fixes?: PriorityFix[];
  checks: DoctorCheck[];
  generated_at?: string;
};

type DoctorHistoryPayload = {
  items: Array<{
    generated_at?: string | null;
    ok: boolean;
    overview: {
      status: 'pass' | 'warn' | 'fail' | string;
      title: string;
      detail: string;
    };
    summary: {
      pass: number;
      warn: number;
      fail: number;
    };
  }>;
  count: number;
  updated_at?: string | null;
};

type MetricsPayload = {
  auth_required: boolean;
  runs: {
    started: number;
    completed: number;
    failed: number;
    timeout: number;
    active: number;
    waiting_for_input: number;
    completion_rate: number;
  };
  kpis: {
    avg_run_duration_ms: number;
    avg_time_to_first_value_ms: number;
    avg_human_wait_ms: number;
  };
};

type RuntimeHealthPayload = {
  ok: boolean;
  auth_required: boolean;
  openai_key_present: boolean;
  openai_key_valid: boolean;
  openai_status?: string | number | null;
  openai_error?: string | null;
};

type ProviderProfileHealthItem = {
  id?: string;
  provider?: string;
  label?: string;
  health?: string;
  cooldown_until?: string | null;
  last_error?: string | null;
  success_count?: number;
  failure_count?: number;
};

type ProviderProfilesHealthPayload = {
  summary: {
    healthy: number;
    cooldown: number;
    disabled: number;
    total: number;
  };
  items: ProviderProfileHealthItem[];
};

type LocalOpsAction =
  | 'start_services'
  | 'restart_services'
  | 'readiness'
  | 'release_status'
  | 'ops_daemon_status'
  | 'ops_daemon_restart';

type OpsDaemonSnapshot = {
  running: boolean;
  url: string;
  transport: string;
  updatedAt: string | null;
  watchdogHealthy: boolean | null;
};

type ValidationCheck = {
  name: string;
  status: 'pass' | 'fail' | string;
};

type ValidationPayload = {
  suite: string;
  generated_at?: string | null;
  detail?: string;
  summary: {
    pass: number;
    fail: number;
    total: number;
    ok: boolean;
  };
  checks: ValidationCheck[];
};

type ValidationHistoryPayload = {
  items: Array<{
    suite: string;
    generated_at?: string | null;
    detail?: string | null;
    filename?: string;
    summary: {
      pass: number;
      fail: number;
      total: number;
      ok: boolean;
    };
  }>;
  count: number;
};

type LocalWorkersPayload = {
  enabled: boolean;
  lease_seconds: number;
  summary: {
    known: number;
    online: number;
    busy: number;
    idle: number;
    offline: number;
    pending_runs: number;
    claimed_runs: number;
  };
  items: Array<{
    worker_id: string;
    status: string;
    online: boolean;
    current_run_id?: string | null;
    last_seen_at?: string | null;
    seconds_since_seen?: number | null;
    lease_seconds?: number;
    note?: string | null;
  }>;
};

type DesktopStatusPayload = {
  stackReady: boolean;
  frontendReady: boolean;
  runtimeReady: boolean;
  lastCheckedAt?: string | null;
  lastError?: string | null;
  frontendUrl?: string;
  runtimeHealthUrl?: string;
};

type HistoryRunsPayload = {
  items: Array<{
    run_id: string;
    status: string;
    pack_id?: string | null;
    agent_role?: string | null;
    created_at?: string | null;
    result_summary?: string | null;
  }>;
};

type HealthOverviewEntry = {
  status: number;
  latency: number;
  payload: unknown;
};

type HealthOverviewPayload = {
  backend: HealthOverviewEntry;
  runtime: HealthOverviewEntry;
  doctor: HealthOverviewEntry;
  doctorHistory: HealthOverviewEntry;
  metrics: HealthOverviewEntry;
  profiles: HealthOverviewEntry;
  validation: HealthOverviewEntry;
  validationHistory: HealthOverviewEntry;
  workers: HealthOverviewEntry;
  desktopHistory: HealthOverviewEntry;
};

function statusMeta(status: CardStatus): {
  iconColor: string;
  textColor: string;
  bg: string;
  border: string;
  label: string;
} {
  if (status === 'ok') {
    return {
      iconColor: 'var(--success-fg)',
      textColor: 'var(--success-fg)',
      bg: 'var(--success-bg)',
      border: '1px solid var(--success-border)',
      label: 'Healthy',
    };
  }
  if (status === 'warn') {
    return {
      iconColor: 'var(--warning-fg)',
      textColor: 'var(--warning-fg)',
      bg: 'var(--warning-bg)',
      border: '1px solid var(--warning-border)',
      label: 'Warning',
    };
  }
  if (status === 'error') {
    return {
      iconColor: 'var(--error-fg)',
      textColor: 'var(--error-fg)',
      bg: 'var(--error-bg)',
      border: '1px solid var(--error-border)',
      label: 'Error',
    };
  }
  return {
    iconColor: '#94a3b8',
    textColor: 'var(--text-secondary)',
    bg: 'rgba(148,163,184,0.12)',
    border: '1px solid rgba(148,163,184,0.3)',
    label: 'Checking',
  };
}

function checkBadgeColor(status: string): { bg: string; text: string; border: string } {
  if (status === 'pass') {
    return {
      bg: 'var(--success-bg)',
      text: 'var(--success-fg)',
      border: '1px solid var(--success-border)',
    };
  }
  if (status === 'warn') {
    return {
      bg: 'var(--warning-bg)',
      text: 'var(--warning-fg)',
      border: '1px solid var(--warning-border)',
    };
  }
  return {
    bg: 'var(--error-bg)',
    text: 'var(--error-fg)',
    border: '1px solid var(--error-border)',
  };
}

export default function HealthPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [backend, setBackend] = useState<StatusCardData>({ status: 'loading' });
  const [runtime, setRuntime] = useState<StatusCardData>({ status: 'loading' });
  const [doctorCard, setDoctorCard] = useState<StatusCardData>({ status: 'loading' });
  const [metricsCard, setMetricsCard] = useState<StatusCardData>({ status: 'loading' });
  const [profilesCard, setProfilesCard] = useState<StatusCardData>({ status: 'loading' });
  const [validationCard, setValidationCard] = useState<StatusCardData>({ status: 'loading' });
  const [workersCard, setWorkersCard] = useState<StatusCardData>({ status: 'loading' });
  const [doctor, setDoctor] = useState<DoctorPayload | null>(null);
  const [doctorHistory, setDoctorHistory] = useState<DoctorHistoryPayload | null>(null);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const [profilesHealth, setProfilesHealth] = useState<ProviderProfilesHealthPayload | null>(null);
  const [validation, setValidation] = useState<ValidationPayload | null>(null);
  const [validationHistory, setValidationHistory] = useState<ValidationHistoryPayload | null>(null);
  const [workers, setWorkers] = useState<LocalWorkersPayload | null>(null);
  const [desktopStatus, setDesktopStatus] = useState<DesktopStatusPayload | null>(null);
  const [desktopIssue, setDesktopIssue] = useState<{
    title: string;
    detail: string;
    runId: string | null;
    createdAt: string | null;
  } | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [opsBusy, setOpsBusy] = useState<LocalOpsAction | null>(null);
  const [opsReport, setOpsReport] = useState('');
  const [showPassChecks, setShowPassChecks] = useState(false);
  const [opsDaemon, setOpsDaemon] = useState<OpsDaemonSnapshot>({
    running: false,
    url: API_BASE,
    transport: 'route',
    updatedAt: null,
    watchdogHealthy: null,
  });

  const desktopBridge = useMemo(
    () =>
      isMounted && typeof window !== 'undefined'
        ? ((window as typeof window & {
            empyralisDesktop?: {
              getStatus?: () => Promise<DesktopStatusPayload>;
              restartStack?: () => Promise<DesktopStatusPayload>;
              openLogsDir?: () => Promise<string>;
              openExternal?: (target: string) => Promise<boolean>;
              platform?: string;
            };
          }).empyralisDesktop ?? null)
        : null,
    [isMounted],
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const formatDisplayDate = useCallback(
    (value?: string | null, empty = 'unknown') => {
      if (!value) return empty;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return empty;
      return isMounted ? date.toLocaleString() : date.toISOString().replace('T', ' ').replace('Z', ' UTC');
    },
    [isMounted],
  );

  const attentionItems = useMemo(() => {
    const items: Array<{ id: string; severity: 'warn' | 'error'; title: string; detail: string }> = [];

    if (backend.status === 'error') {
      items.push({
        id: 'backend-down',
        severity: 'error',
        title: 'Backend API unreachable',
        detail: backend.detail || 'Backend health endpoint did not respond.',
      });
    }
    if (runtime.status === 'error' || runtime.status === 'warn') {
      items.push({
        id: 'runtime-health',
        severity: runtime.status === 'error' ? 'error' : 'warn',
        title: 'Runtime needs attention',
        detail: runtime.detail || 'Runtime health has warnings.',
      });
    }
    if (doctor?.summary?.fail && doctor.summary.fail > 0) {
      items.push({
        id: 'doctor-fail',
        severity: 'error',
        title: `${doctor.summary.fail} doctor check(s) failing`,
        detail: 'Open Doctor Report and resolve failed checks first.',
      });
    } else if (doctor?.summary?.warn && doctor.summary.warn > 0) {
      items.push({
        id: 'doctor-warn',
        severity: 'warn',
        title: `${doctor.summary.warn} doctor warning(s)`,
        detail: 'Review warnings and apply recommendations.',
      });
    }
    if (metrics && (metrics.runs.failed > 0 || metrics.runs.timeout > 0)) {
      items.push({
        id: 'run-failures',
        severity: 'warn',
        title: 'Recent run failures detected',
        detail: `failed ${metrics.runs.failed} • timeout ${metrics.runs.timeout}`,
      });
    }
    if (profilesHealth?.summary?.cooldown && profilesHealth.summary.cooldown > 0) {
      items.push({
        id: 'profile-cooldown',
        severity: 'warn',
        title: 'Provider profiles in cooldown',
        detail: `${profilesHealth.summary.cooldown} profile(s) throttled or temporarily disabled.`,
      });
    }
    if (validation && validation.summary.total > 0 && validation.summary.fail > 0) {
      items.push({
        id: 'validation-failing',
        severity: 'error',
        title: 'Validation suite failing',
        detail: `${validation.summary.pass}/${validation.summary.total} checks passing in latest smoke run.`,
      });
    }
    if (!opsDaemon.running) {
      items.push({
        id: 'daemon-offline',
        severity: 'warn',
        title: 'Ops daemon offline',
        detail: 'Local workflow helpers are unavailable until daemon is running.',
      });
    }
    if (opsDaemon.watchdogHealthy === false) {
      items.push({
        id: 'watchdog-unhealthy',
        severity: 'warn',
        title: 'Watchdog unhealthy',
        detail: 'Autorecover loop is degraded; restart daemon from Actions.',
      });
    }
    if (desktopStatus && desktopStatus.lastError) {
      items.push({
        id: 'desktop-shell-error',
        severity: 'warn',
        title: 'Desktop shell needs attention',
        detail: desktopStatus.lastError,
      });
    }
    if (desktopIssue) {
      items.push({
        id: 'desktop-runtime-issue',
        severity: 'warn',
        title: desktopIssue.title,
        detail: desktopIssue.detail,
      });
    }
    if (workers?.enabled && workers.summary.online === 0) {
      items.push({
        id: 'local-worker-offline',
        severity: 'error',
        title: 'Local companion offline',
        detail: 'Desktop execution is unavailable until a local worker reconnects.',
      });
    } else if (workers && workers.summary.pending_runs > 0 && workers.summary.busy === 0) {
      items.push({
        id: 'local-worker-stalled',
        severity: 'warn',
        title: 'Local companion queue waiting',
        detail: `${workers.summary.pending_runs} run(s) pending with no active worker claim.`,
      });
    }
    return items.slice(0, 8);
  }, [backend.detail, backend.status, desktopIssue, desktopStatus, doctor, metrics, opsDaemon.running, opsDaemon.watchdogHealthy, profilesHealth, runtime.detail, runtime.status, validation, workers]);

  const doctorChecksOrdered = useMemo(() => {
    if (!doctor?.checks || !Array.isArray(doctor.checks)) return [];
    const rank = (status: string): number => {
      const normalized = String(status || '').toLowerCase();
      if (normalized === 'fail' || normalized === 'error') return 0;
      if (normalized === 'warn' || normalized === 'warning') return 1;
      if (normalized === 'pass' || normalized === 'ok') return 2;
      return 3;
    };
    return [...doctor.checks].sort((a, b) => {
      const score = rank(a.status) - rank(b.status);
      if (score !== 0) return score;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [doctor?.checks]);

  const doctorChecksVisible = useMemo(() => {
    if (showPassChecks) return doctorChecksOrdered;
    return doctorChecksOrdered.filter((item) => {
      const normalized = String(item.status || '').toLowerCase();
      return normalized !== 'pass' && normalized !== 'ok';
    });
  }, [doctorChecksOrdered, showPassChecks]);

  const doctorGroups = useMemo(
    () => (doctor?.groups?.length ? doctor.groups : groupDoctorChecks(doctorChecksVisible)),
    [doctor?.groups, doctorChecksVisible],
  );

  const priorityFixes = useMemo(
    () => (doctor?.priority_fixes?.length ? doctor.priority_fixes : collectPriorityFixes(doctorChecksOrdered, 6)),
    [doctor?.priority_fixes, doctorChecksOrdered],
  );

  const doctorOverview = useMemo(() => {
    if (doctor?.overview) {
      const status = String(doctor.overview.status || '').toLowerCase();
      return {
        tone: status === 'fail' ? ('error' as const) : status === 'warn' ? ('warn' as const) : ('ok' as const),
        title: doctor.overview.title,
        detail: doctor.overview.detail,
      };
    }
    if (!doctor) {
      return {
        tone: 'warn' as const,
        title: 'Doctor not ready',
        detail: 'Run the doctor checks and confirm the runtime key is accepted before trusting machine or cloud execution.',
      };
    }
    if (backend.status === 'error' || runtime.status === 'error' || doctor.summary.fail > 0) {
      return {
        tone: 'error' as const,
        title: 'Critical gaps found',
        detail: 'Resolve failed checks before treating this runtime as production ready.',
      };
    }
    if (backend.status === 'warn' || runtime.status === 'warn' || doctor.summary.warn > 0) {
      return {
        tone: 'warn' as const,
        title: 'Needs attention',
        detail: 'Core services are reachable, but warnings still weaken trust and runtime safety.',
      };
    }
    return {
      tone: 'ok' as const,
      title: 'Doctor healthy',
      detail: 'The runtime, policies, and storage layers are aligned for normal operation.',
    };
  }, [backend.status, doctor, runtime.status]);

  const footerBanner = useMemo(() => {
    if (backend.status === 'error' || runtime.status === 'error') {
      return {
        tone: 'error' as const,
        icon: XCircle,
        message: 'Critical services are down. Check logs and rerun checks.',
      };
    }
    if (doctorCard.status === 'warn' || doctorCard.status === 'error') {
      return {
        tone: 'warn' as const,
        icon: AlertTriangle,
        message: 'Protected diagnostics require server-side runtime access.',
      };
    }
    if (doctorCard.status === 'ok' && runtime.status === 'ok') {
      return {
        tone: 'ok' as const,
        icon: CheckCircle2,
        message: 'Runtime is healthy at current settings.',
      };
    }
    return null;
  }, [backend.status, doctorCard.status, runtime.status]);

  const doctorTrendItems = useMemo(() => {
    if (!doctorHistory?.items?.length) return [];
    return doctorHistory.items.slice(0, 6).map((item, index) => {
      const currentScore = item.summary.fail * 100 + item.summary.warn * 10;
      const previous = doctorHistory.items[index + 1];
      const previousScore = previous ? previous.summary.fail * 100 + previous.summary.warn * 10 : currentScore;
      let trend: 'improved' | 'regressed' | 'stable' = 'stable';
      if (currentScore < previousScore) trend = 'improved';
      else if (currentScore > previousScore) trend = 'regressed';
      return {
        ...item,
        trend,
      };
    });
  }, [doctorHistory]);

  const updateOpsDaemonFromPayload = useCallback((payload: unknown) => {
    const record = payload as Record<string, unknown>;
    const watchdog = (record?.watchdog ?? null) as Record<string, unknown> | null;
    setOpsDaemon({
      running: Boolean(record?.running),
      url: typeof record?.url === 'string' && record.url.trim() ? record.url : API_BASE,
      transport: typeof record?.transport === 'string' && record.transport.trim() ? record.transport : 'route',
      updatedAt: new Date().toISOString(),
      watchdogHealthy:
        watchdog && typeof watchdog.healthy === 'boolean'
          ? watchdog.healthy
          : null,
      });
  }, []);

  const runLocalOpsAction = useCallback(
    async (action: LocalOpsAction): Promise<Record<string, unknown>> => {
      const res = await fetch('/api/local-ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const message =
          typeof payload?.error === 'string' && payload.error.trim()
            ? payload.error
            : `Operation failed (HTTP ${res.status}).`;
        throw new Error(message);
      }
      return payload;
    },
    [],
  );

  const formatLocalOpsOutput = useCallback((payload: Record<string, unknown>): string => {
    const stdout = typeof payload.stdout === 'string' ? payload.stdout.trim() : '';
    const stderr = typeof payload.stderr === 'string' ? payload.stderr.trim() : '';
    const info: string[] = [];
    if (typeof payload.action === 'string') info.push(`action: ${payload.action}`);
    if (typeof payload.transport === 'string') info.push(`transport: ${payload.transport}`);
    if (typeof payload.fallbackReason === 'string' && payload.fallbackReason) info.push(`fallback: ${payload.fallbackReason}`);
    if (payload.running !== undefined) info.push(`running: ${String(Boolean(payload.running))}`);
    const blocks = [info.join(' | '), stdout, stderr ? `stderr:\n${stderr}` : ''].filter(Boolean);
    return blocks.join('\n\n');
  }, []);

  const checkAll = useCallback(async () => {
    setIsRefreshing(true);

    const [backendRes, runtimeRes, doctorRes, doctorHistoryRes, metricsRes, profilesRes, validationRes, validationHistoryRes, workersRes, desktopHistoryRes] = await Promise.allSettled([
      timedFetch(`${BACKEND_API_URL}/health`),
      timedFetch(`${ORION_API_URL}/health`),
      timedFetch(`${ORION_API_URL}/doctor`, { headers: runtimeHeaders() }),
      timedFetch(`${ORION_API_URL}/doctor/history?limit=8`, { headers: runtimeHeaders() }),
      timedFetch(`${ORION_API_URL}/metrics`, { headers: runtimeHeaders() }),
      timedFetch(`${ORION_API_URL}/providers/profiles/health?workspace_id=default`, { headers: runtimeHeaders() }),
      timedFetch(`${ORION_API_URL}/validation/latest`, { headers: runtimeHeaders() }),
      timedFetch(`${ORION_API_URL}/validation/history?limit=6`, { headers: runtimeHeaders() }),
      timedFetch(`/api/runtime/machines`),
      timedFetch(`${ORION_API_URL}/history/runs?limit=20&status=failed&pack_id=local-execution-v1`, { headers: runtimeHeaders() }),
    ]);

    if (backendRes.status === 'fulfilled') {
      if (backendRes.value.response.ok) {
        setBackend({
          status: 'ok',
          latency: backendRes.value.latency,
          detail: 'Backend API reachable.',
        });
      } else {
        setBackend({
          status: 'error',
          latency: backendRes.value.latency,
          detail: `Backend returned HTTP ${backendRes.value.response.status}.`,
        });
      }
    } else {
      setBackend({ status: 'error', detail: 'Cannot reach backend API.' });
    }

    if (runtimeRes.status === 'fulfilled') {
      if (runtimeRes.value.response.ok) {
        const payload = (await runtimeRes.value.response.json()) as RuntimeHealthPayload;
        const status: CardStatus = payload.ok ? 'ok' : payload.openai_key_present ? 'warn' : 'error';
        const detail = payload.ok
          ? 'Runtime healthy.'
          : payload.openai_key_present
            ? 'Runtime up, but provider connectivity needs attention.'
            : 'Runtime up, but provider key is missing.';
        setRuntime({
          status,
          latency: runtimeRes.value.latency,
          detail,
        });
      } else {
        setRuntime({
          status: 'error',
          latency: runtimeRes.value.latency,
          detail: `Runtime health returned HTTP ${runtimeRes.value.response.status}.`,
        });
      }
    } else {
      setRuntime({ status: 'error', detail: `Cannot reach the ${BRAND.product} runtime health endpoint.` });
    }

    if (doctorRes.status === 'fulfilled') {
      if (doctorRes.value.response.ok) {
        const payload = (await doctorRes.value.response.json()) as DoctorPayload;
        setDoctor(payload);
        const status: CardStatus = payload.summary.fail > 0 ? 'error' : payload.summary.warn > 0 ? 'warn' : 'ok';
        setDoctorCard({
          status,
          latency: doctorRes.value.latency,
          detail: `${payload.summary.pass} pass • ${payload.summary.warn} warn • ${payload.summary.fail} fail`,
        });
      } else if (doctorRes.value.response.status === 401) {
        setDoctor(null);
        setDoctorCard({
          status: 'warn',
          latency: doctorRes.value.latency,
          detail: 'Diagnostics require runtime API key. Add it in Setup step 1.',
        });
      } else {
        const errorText = await doctorRes.value.response.text().catch(() => '');
        setDoctor(null);
        setDoctorCard({
          status: 'error',
          latency: doctorRes.value.latency,
          detail: errorText || `Doctor returned HTTP ${doctorRes.value.response.status}.`,
        });
      }
    } else {
      setDoctor(null);
      setDoctorCard({ status: 'error', detail: 'Cannot reach /doctor endpoint.' });
    }

    if (doctorHistoryRes.status === 'fulfilled' && doctorHistoryRes.value.response.ok) {
      const payload = (await doctorHistoryRes.value.response.json()) as DoctorHistoryPayload;
      setDoctorHistory(payload);
    } else {
      setDoctorHistory(null);
    }

    if (metricsRes.status === 'fulfilled') {
      if (metricsRes.value.response.ok) {
        const payload = (await metricsRes.value.response.json()) as MetricsPayload;
        setMetrics(payload);
        const hasFailures = payload.runs.failed > 0 || payload.runs.timeout > 0;
        const status: CardStatus = hasFailures ? 'warn' : 'ok';
        setMetricsCard({
          status,
          latency: metricsRes.value.latency,
          detail: `Runs: ${payload.runs.started} total • ${payload.runs.active} active`,
        });
      } else if (metricsRes.value.response.status === 401) {
        setMetrics(null);
        setMetricsCard({
          status: 'warn',
          latency: metricsRes.value.latency,
          detail: 'Metrics require runtime API key. Add it in Setup step 1.',
        });
      } else {
        const errorText = await metricsRes.value.response.text().catch(() => '');
        setMetrics(null);
        setMetricsCard({
          status: 'error',
          latency: metricsRes.value.latency,
          detail: errorText || `Metrics returned HTTP ${metricsRes.value.response.status}.`,
        });
      }
    } else {
      setMetrics(null);
      setMetricsCard({ status: 'error', detail: 'Cannot reach /metrics endpoint.' });
    }

    if (profilesRes.status === 'fulfilled') {
      if (profilesRes.value.response.ok) {
        const payload = (await profilesRes.value.response.json()) as ProviderProfilesHealthPayload;
        setProfilesHealth(payload);
        const status: CardStatus =
          payload.summary.cooldown > 0 ? 'warn' : payload.summary.total > 0 ? 'ok' : 'warn';
        setProfilesCard({
          status,
          latency: profilesRes.value.latency,
          detail: `${payload.summary.healthy} healthy • ${payload.summary.cooldown} cooldown • ${payload.summary.disabled} disabled`,
        });
      } else if (profilesRes.value.response.status === 401) {
        setProfilesHealth(null);
        setProfilesCard({
          status: 'warn',
          latency: profilesRes.value.latency,
          detail: 'Provider profile diagnostics require runtime API key.',
        });
      } else {
        const errorText = await profilesRes.value.response.text().catch(() => '');
        setProfilesHealth(null);
        setProfilesCard({
          status: 'error',
          latency: profilesRes.value.latency,
          detail: errorText || `Provider profile health returned HTTP ${profilesRes.value.response.status}.`,
        });
      }
    } else {
      setProfilesHealth(null);
      setProfilesCard({ status: 'error', detail: 'Cannot reach /providers/profiles/health endpoint.' });
    }

    if (validationRes.status === 'fulfilled') {
      if (validationRes.value.response.ok) {
        const payload = (await validationRes.value.response.json()) as ValidationPayload;
        setValidation(payload);
        const status: CardStatus =
          payload.summary.total === 0 ? 'warn' : payload.summary.fail > 0 ? 'error' : 'ok';
        setValidationCard({
          status,
          latency: validationRes.value.latency,
          detail:
            payload.summary.total === 0
              ? payload.detail || 'No validation suite run yet.'
              : `${payload.summary.pass}/${payload.summary.total} passing`,
        });
      } else if (validationRes.value.response.status === 401) {
        setValidation(null);
        setValidationCard({
          status: 'warn',
          latency: validationRes.value.latency,
          detail: 'Validation suite requires runtime API key.',
        });
      } else {
        const errorText = await validationRes.value.response.text().catch(() => '');
        setValidation(null);
        setValidationCard({
          status: 'error',
          latency: validationRes.value.latency,
          detail: errorText || `Validation returned HTTP ${validationRes.value.response.status}.`,
        });
      }
    } else {
      setValidation(null);
      setValidationCard({ status: 'error', detail: 'Cannot reach /validation/latest endpoint.' });
    }

    if (validationHistoryRes.status === 'fulfilled') {
      if (validationHistoryRes.value.response.ok) {
        const payload = (await validationHistoryRes.value.response.json()) as ValidationHistoryPayload;
        setValidationHistory(payload);
      } else {
        setValidationHistory(null);
      }
    } else {
      setValidationHistory(null);
    }

    if (workersRes.status === 'fulfilled') {
      if (workersRes.value.response.ok) {
        const runtimePayload = (await workersRes.value.response.json()) as {
          summary?: LocalWorkersPayload['summary'];
          items?: Array<{
            runtime_id?: string;
            status?: string;
            online?: boolean;
            current_task_id?: string | null;
            last_seen_at?: string | null;
            note?: string | null;
          }>;
        };
        const payload: LocalWorkersPayload = {
          enabled: true,
          lease_seconds: 0,
          summary: runtimePayload.summary || {
            known: 0,
            online: 0,
            busy: 0,
            idle: 0,
            offline: 0,
            pending_runs: 0,
            claimed_runs: 0,
          },
          items: Array.isArray(runtimePayload.items)
            ? runtimePayload.items.map((item) => ({
                worker_id: String(item.runtime_id || '').trim(),
                status: String(item.status || 'offline').trim() || 'offline',
                online: Boolean(item.online),
                current_run_id: typeof item.current_task_id === 'string' ? item.current_task_id : null,
                last_seen_at: typeof item.last_seen_at === 'string' ? item.last_seen_at : null,
                note: typeof item.note === 'string' ? item.note : null,
              }))
            : [],
        };
        setWorkers(payload);
        const status: CardStatus =
          !payload.enabled
            ? 'warn'
            : payload.summary.online === 0
              ? 'error'
              : payload.summary.pending_runs > 0 && payload.summary.busy === 0
                ? 'warn'
                : 'ok';
        setWorkersCard({
          status,
          latency: workersRes.value.latency,
          detail: !payload.enabled
            ? 'Local companion disabled.'
            : `${payload.summary.online} online • ${payload.summary.busy} busy • ${payload.summary.pending_runs} queued`,
        });
      } else if (workersRes.value.response.status === 401) {
        setWorkers(null);
        setWorkersCard({
          status: 'warn',
          latency: workersRes.value.latency,
          detail: 'Local companion status requires runtime API key.',
        });
      } else {
        const errorText = await workersRes.value.response.text().catch(() => '');
        setWorkers(null);
        setWorkersCard({
          status: 'error',
          latency: workersRes.value.latency,
          detail: errorText || `Local companion returned HTTP ${workersRes.value.response.status}.`,
        });
      }
    } else {
      setWorkers(null);
      setWorkersCard({ status: 'error', detail: 'Cannot reach runtime machine status endpoint.' });
    }

    if (desktopHistoryRes.status === 'fulfilled' && desktopHistoryRes.value.response.ok) {
      const payload = (await desktopHistoryRes.value.response.json()) as HistoryRunsPayload;
      const failedDesktopRun = (payload.items || []).find((item) => {
        const summary = String(item.result_summary || '').toLowerCase();
        return (
          summary.includes('screen recording permission') ||
          summary.includes('active display session') ||
          summary.includes('electron runtime not found') ||
          summary.includes('browser capture failed') ||
          summary.includes('capture page')
        );
      });
      if (failedDesktopRun) {
        const summary = String(failedDesktopRun.result_summary || '').trim();
        let title = 'Recent desktop execution issue';
        if (summary.toLowerCase().includes('screen recording permission')) {
          title = 'Screen Recording permission missing';
        } else if (summary.toLowerCase().includes('active display session')) {
          title = 'Desktop session unavailable';
        } else if (summary.toLowerCase().includes('electron runtime not found')) {
          title = 'Browser runtime unavailable';
        }
        setDesktopIssue({
          title,
          detail: summary.slice(0, 220),
          runId: failedDesktopRun.run_id || null,
          createdAt: failedDesktopRun.created_at || null,
        });
      } else {
        setDesktopIssue(null);
      }
    } else {
      setDesktopIssue(null);
    }

    try {
      const daemonPayload = await runLocalOpsAction('ops_daemon_status');
      updateOpsDaemonFromPayload(daemonPayload);
    } catch {
      // Keep diagnostics working even if local ops endpoint is unavailable.
    }

    if (desktopBridge?.getStatus) {
      try {
        const payload = await desktopBridge.getStatus();
        setDesktopStatus(payload);
      } catch {
        setDesktopStatus(null);
      }
    } else {
      setDesktopStatus(null);
    }

    setLastCheckedAt(new Date().toISOString());
    setIsRefreshing(false);
  }, [desktopBridge, runLocalOpsAction, runtimeHeaders, updateOpsDaemonFromPayload]);

  const runOps = useCallback(
    async (action: LocalOpsAction) => {
      setOpsBusy(action);
      try {
        const payload = await runLocalOpsAction(action);
        if (action === 'ops_daemon_status' || action === 'ops_daemon_restart') {
          updateOpsDaemonFromPayload(payload);
        }
        if (action === 'start_services' || action === 'restart_services') {
          await checkAll();
        }
        setOpsReport(formatLocalOpsOutput(payload));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Operation failed.';
        setOpsReport(message);
      } finally {
        setOpsBusy(null);
      }
    },
    [checkAll, formatLocalOpsOutput, runLocalOpsAction, updateOpsDaemonFromPayload],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkAll();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [checkAll]);

  useEffect(() => {
    if (!desktopBridge?.getStatus) return;
    const interval = window.setInterval(() => {
      void desktopBridge
        .getStatus?.()
        .then((payload) => {
          setDesktopStatus(payload);
        })
        .catch(() => {
          // Keep current shell state if polling fails.
        });
    }, 8000);
    return () => window.clearInterval(interval);
  }, [desktopBridge]);

  const statusCard = (
    title: string,
    Icon: React.ComponentType<{ size?: number; color?: string }>,
    data: StatusCardData,
  ) => {
    const meta = statusMeta(data.status);
    return (
      <div
        style={{
          background: 'var(--glass-panel)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 10,
          padding: 12,
          display: 'grid',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              display: 'grid',
              placeItems: 'center',
              background: meta.bg,
              border: meta.border,
              flexShrink: 0,
            }}
          >
            <Icon size={18} color={meta.iconColor} />
          </div>
          <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{title}</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: meta.textColor,
                  background: meta.bg,
                  border: meta.border,
                  borderRadius: 999,
                  padding: '2px 7px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {meta.label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {typeof data.latency === 'number' ? `${data.latency} ms` : '--'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{data.detail || 'No details.'}</div>
          </div>
        </div>
      </div>
    );
  };

  const localRuntimeOnline = Boolean(workers?.summary?.online && workers.summary.online > 0);
  const showLocalRuntimeGuide = !localRuntimeOnline;
  const localRuntimeGuideTitle = opsDaemon.running ? 'Bring a local machine online' : 'Start a local runtime';
  const localRuntimeGuideCopy = opsDaemon.running
    ? 'The platform runtime is reachable, but no local machine is online yet. Start the local companion on this device and confirm it appears below.'
    : 'Hekor is ready for a local runtime, but the local companion is not running yet. Start it here, then confirm the machine appears online.';

  return (
    <div className="orion-page-shell orion-animate-in" style={{ maxWidth: 1320 }}>
      <OsPageHeader
        icon={<Activity size={18} />}
        title="Health"
        subtitle="Diagnostics, runtime checks, and recovery for the platform."
        meta={
          <>
            <span>Admin</span>
            <span>Last checked: {formatDisplayDate(lastCheckedAt, 'never')}</span>
          </>
        }
        actions={
          <>
            <Link href="/control-center" className="orion-btn orion-btn-ghost" style={{ minHeight: 36 }}>
              <ShieldCheck size={14} />
              Overview
            </Link>
            <button onClick={checkAll} className="orion-btn orion-btn-ghost" style={{ minHeight: 36 }}>
              <RefreshCw size={14} style={isRefreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
              Run Check
            </button>
          </>
        }
      />

      {showLocalRuntimeGuide ? (
        <section className="orion-panel muted orion-health-runtime-guide">
          <div className="orion-health-runtime-guide-header">
            <div className="orion-state-icon" aria-hidden="true">
              <Laptop size={18} />
            </div>
            <div>
              <div className="orion-panel-title">{localRuntimeGuideTitle}</div>
              <div className="orion-panel-copy">{localRuntimeGuideCopy}</div>
            </div>
          </div>

          <div className="orion-health-runtime-guide-steps">
            <div className="orion-health-runtime-guide-step">
              <div className="orion-health-runtime-guide-step-index">1</div>
              <div>
                <div className="orion-health-runtime-guide-step-title">Start the local stack</div>
                <div className="orion-health-runtime-guide-step-copy">Launch the local runtime and services on this device.</div>
              </div>
            </div>
            <div className="orion-health-runtime-guide-step">
              <div className="orion-health-runtime-guide-step-index">2</div>
              <div>
                <div className="orion-health-runtime-guide-step-title">Check readiness</div>
                <div className="orion-health-runtime-guide-step-copy">Verify the environment is healthy and the runtime key is accepted.</div>
              </div>
            </div>
            <div className="orion-health-runtime-guide-step">
              <div className="orion-health-runtime-guide-step-index">3</div>
              <div>
                <div className="orion-health-runtime-guide-step-title">Confirm the machine is online</div>
                <div className="orion-health-runtime-guide-step-copy">Open Machines and make sure the device appears before running tasks locally.</div>
              </div>
            </div>
          </div>

          <div className="orion-state-actions">
            <button
              type="button"
              onClick={() => void runOps('start_services')}
              disabled={Boolean(opsBusy)}
              className="btn-primary"
            >
              {opsBusy === 'start_services' ? 'Starting...' : 'Start local runtime'}
            </button>
            <button
              type="button"
              onClick={() => void runOps('readiness')}
              disabled={Boolean(opsBusy)}
              className="btn-secondary"
            >
              {opsBusy === 'readiness' ? 'Checking...' : 'Check readiness'}
            </button>
            <Link href="/machines" className="btn-secondary">
              Open Machines
            </Link>
          </div>

          {opsReport ? <div className="orion-health-runtime-guide-report">{opsReport}</div> : null}
        </section>
      ) : null}

      <section className="orion-panel orion-health-doctor-overview">
        <div className="orion-health-doctor-overview-header">
          <div>
            <div className="orion-panel-title">Doctor overview</div>
            <div className="orion-panel-copy">
              One place to verify runtime trust, execution safety, storage, and machine readiness.
            </div>
          </div>
          <div
            className={`orion-health-doctor-overview-badge is-${doctorOverview.tone}`}
          >
            {doctorOverview.title}
          </div>
        </div>

        <div className="orion-health-doctor-overview-copy">{doctorOverview.detail}</div>

        <div className="orion-health-doctor-summary-grid">
          <div className="orion-health-doctor-summary-card">
            <div className="orion-health-doctor-summary-label">Passing</div>
            <div className="orion-health-doctor-summary-value">{doctor?.summary.pass ?? 0}</div>
          </div>
          <div className="orion-health-doctor-summary-card">
            <div className="orion-health-doctor-summary-label">Warnings</div>
            <div className="orion-health-doctor-summary-value">{doctor?.summary.warn ?? 0}</div>
          </div>
          <div className="orion-health-doctor-summary-card">
            <div className="orion-health-doctor-summary-label">Failing</div>
            <div className="orion-health-doctor-summary-value">{doctor?.summary.fail ?? 0}</div>
          </div>
          <div className="orion-health-doctor-summary-card">
            <div className="orion-health-doctor-summary-label">Generated</div>
            <div className="orion-health-doctor-summary-value is-small">
              {formatDisplayDate(doctor?.generated_at, 'Not yet')}
            </div>
          </div>
        </div>

        <div className="orion-health-doctor-priority">
          <div className="orion-health-doctor-priority-header">
            <div className="orion-panel-title">Priority fixes</div>
            <button
              onClick={() => setShowPassChecks((prev) => !prev)}
              className="orion-btn orion-btn-ghost"
              style={{ minHeight: 28, fontSize: 11, padding: '0 8px' }}
            >
              {showPassChecks ? 'Hide pass' : 'Show pass'}
            </button>
          </div>

          {priorityFixes.length === 0 ? (
            <div className="orion-health-doctor-priority-empty">
              No failing or warning checks right now.
            </div>
          ) : (
            <div className="orion-health-doctor-fixes">
              {priorityFixes.map((fix) => (
                <div key={fix.id} className="orion-health-doctor-fix">
                  <div className="orion-health-doctor-fix-topline">
                    <span className={`orion-health-doctor-fix-badge is-${fix.status}`}>{fix.status}</span>
                    <span className="orion-health-doctor-fix-category">{fix.category}</span>
                  </div>
                  <div className="orion-health-doctor-fix-title">{fix.title}</div>
                  <div className="orion-health-doctor-fix-detail">{fix.detail}</div>
                  <div className="orion-health-doctor-fix-recommendation">{fix.recommendation}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="orion-panel" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Needs attention</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Daemon {opsDaemon.running ? 'running' : 'stopped'} • {opsDaemon.url} • {opsDaemon.transport}
            {opsDaemon.watchdogHealthy === null ? '' : ` • watchdog ${opsDaemon.watchdogHealthy ? 'healthy' : 'unhealthy'}`}
          </div>
        </div>
        {attentionItems.length === 0 ? (
          <div
            style={{
              borderLeft: '2px solid rgba(34,197,94,0.45)',
              background: 'var(--success-bg)',
              color: 'var(--success-fg)',
              padding: '10px 12px',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <CheckCircle2 size={14} />
            No active issues.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 0, borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
            {attentionItems.map((item, index) => (
              <div
                key={item.id}
                style={{
                  borderLeft: item.severity === 'error' ? '2px solid var(--error-border)' : '2px solid var(--warning-border)',
                  background: item.severity === 'error' ? 'var(--error-bg)' : 'var(--warning-bg)',
                  color: 'var(--text-primary)',
                  padding: '10px 12px',
                  display: 'grid',
                  gap: 4,
                  borderBottom: index < attentionItems.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {item.severity === 'error' ? <XCircle size={14} color="var(--error-fg)" /> : <AlertTriangle size={14} color="var(--warning-fg)" />}
                  <span style={{ fontSize: 12, fontWeight: 800 }}>{item.title}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.detail}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={checkAll}
            className="orion-btn orion-btn-ghost"
            style={{ minHeight: 32, fontSize: 12 }}
          >
            <RefreshCw size={13} />
            Run check
          </button>
          <Link href="/setup" className="orion-btn orion-btn-ghost" style={{ minHeight: 32, fontSize: 12 }}>
            Open Setup
          </Link>
        </div>

        <details
          style={{
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: 8,
          }}
        >
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
            Ops actions
          </summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, marginTop: 10 }}>
          <button
            onClick={() => void runOps('start_services')}
            disabled={Boolean(opsBusy)}
            className="orion-btn orion-btn-ghost"
            style={{ minHeight: 34, fontSize: 12, opacity: opsBusy ? 0.75 : 1 }}
          >
            {opsBusy === 'start_services' ? 'Starting...' : 'Start'}
          </button>
          <button
            onClick={() => void runOps('restart_services')}
            disabled={Boolean(opsBusy)}
            className="orion-btn orion-btn-ghost"
            style={{ minHeight: 34, fontSize: 12, opacity: opsBusy ? 0.75 : 1 }}
          >
            {opsBusy === 'restart_services' ? 'Restarting...' : 'Restart'}
          </button>
          <button
            onClick={() => void runOps('readiness')}
            disabled={Boolean(opsBusy)}
            className="orion-btn orion-btn-ghost"
            style={{ minHeight: 34, fontSize: 12, opacity: opsBusy ? 0.75 : 1 }}
          >
            {opsBusy === 'readiness' ? 'Checking...' : 'Readiness'}
          </button>
          <button
            onClick={() => void runOps('release_status')}
            disabled={Boolean(opsBusy)}
            className="orion-btn orion-btn-ghost"
            style={{ minHeight: 34, fontSize: 12, opacity: opsBusy ? 0.75 : 1 }}
          >
            {opsBusy === 'release_status' ? 'Checking...' : 'Release'}
          </button>
          <button
            onClick={() => void runOps('ops_daemon_status')}
            disabled={Boolean(opsBusy)}
            className="orion-btn orion-btn-ghost"
            style={{ minHeight: 34, fontSize: 12, opacity: opsBusy ? 0.75 : 1 }}
          >
            {opsBusy === 'ops_daemon_status' ? 'Checking...' : 'Daemon'}
          </button>
          <button
            onClick={() => void runOps('ops_daemon_restart')}
            disabled={Boolean(opsBusy)}
            className="orion-btn orion-btn-primary"
            style={{ minHeight: 34, fontSize: 12, opacity: opsBusy ? 0.75 : 1 }}
          >
            {opsBusy === 'ops_daemon_restart' ? 'Restarting...' : 'Daemon restart'}
          </button>
          </div>
        </details>
        {opsReport ? (
          <pre
            style={{
              margin: 0,
              borderTop: '1px solid var(--border-subtle)',
              borderBottom: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              padding: '10px 12px',
              fontSize: 12,
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {opsReport}
          </pre>
        ) : null}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {statusCard('Backend API', Server, backend)}
        {statusCard(`${BRAND.product} Runtime`, Terminal, runtime)}
        {statusCard('Doctor Checks', ShieldCheck, doctorCard)}
        {statusCard('Execution Metrics', Database, metricsCard)}
        {statusCard('Provider Profiles', ShieldCheck, profilesCard)}
        {statusCard('Validation Suite', CheckCircle2, validationCard)}
        {statusCard('Local Companion', Terminal, workersCard)}
        {isMounted && desktopBridge
          ? statusCard(
              'Desktop Shell',
              Terminal,
              desktopStatus
                ? {
                    status: desktopStatus.stackReady ? 'ok' : desktopStatus.lastError ? 'warn' : 'error',
                    detail: desktopStatus.stackReady
                      ? 'Desktop wrapper is connected to frontend and runtime.'
                      : desktopStatus.lastError || 'Desktop wrapper cannot reach local services.',
                  }
                : { status: 'loading', detail: 'Checking desktop wrapper.' },
            )
          : null}
      </div>

      <section className="orion-panel">
        <div className="orion-panel-header" style={{ marginBottom: 12 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} color="var(--primary-base)" />
            <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>Validation Suite</h2>
          </div>
        </div>
        {!validation || validation.summary.total === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            No validation report yet. Run <code>bash scripts/empyralis_core_smoke.sh</code> to publish the latest suite.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Latest suite: <strong style={{ color: 'var(--text-primary)' }}>{validation.suite}</strong>
              <br />
              Generated: {formatDisplayDate(validation.generated_at)}
              <br />
              Result: {validation.summary.pass}/{validation.summary.total} passing
            </div>
            <div style={{ borderTop: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)' }}>
              {validation.checks.map((check, index) => {
                const badge = checkBadgeColor(check.status);
                return (
                  <div
                    key={`${check.name}:${index}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '84px 1fr',
                      gap: 8,
                      padding: '9px 10px',
                      borderBottom: index < validation.checks.length - 1 ? '1px solid var(--border-default)' : 'none',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        borderRadius: 999,
                        padding: '2px 8px',
                        fontSize: 10,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        background: badge.bg,
                        color: badge.text,
                        border: badge.border,
                        width: 'fit-content',
                      }}
                    >
                      {check.status}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{check.name}</span>
                  </div>
                );
              })}
            </div>
            {validationHistory?.items?.length ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
                  Recent suite history
                </div>
                <div style={{ borderTop: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)' }}>
                  {validationHistory.items.map((item, index) => {
                    const tone = item.summary.fail > 0 ? 'var(--error-fg)' : 'var(--success-fg)';
                    const bg = item.summary.fail > 0 ? 'var(--error-bg)' : 'var(--success-bg)';
                    const border = item.summary.fail > 0 ? 'var(--error-border)' : 'var(--success-border)';
                    return (
                      <div
                        key={`${item.filename || item.generated_at || item.suite}:${index}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '100px 1fr auto',
                          gap: 8,
                          alignItems: 'center',
                          padding: '9px 10px',
                          borderBottom: index < validationHistory.items.length - 1 ? '1px solid var(--border-default)' : 'none',
                        }}
                      >
                        <span
                          style={{
                            borderRadius: 999,
                            padding: '2px 8px',
                            fontSize: 10,
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            background: bg,
                            color: tone,
                            border: `1px solid ${border}`,
                            width: 'fit-content',
                          }}
                        >
                          {item.summary.pass}/{item.summary.total}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{item.suite}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {formatDisplayDate(item.generated_at, 'Unknown time')}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right' }}>
                          {item.summary.fail > 0 ? `${item.summary.fail} failed` : 'Passing'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {isMounted && desktopBridge ? (
        <section className="orion-panel">
          <div className="orion-panel-header" style={{ marginBottom: 12 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Terminal size={16} color="var(--primary-base)" />
              <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>Desktop Shell</h2>
            </div>
          </div>
          {!desktopStatus ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Checking desktop wrapper state.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { label: 'Stack', ok: desktopStatus.stackReady },
                  { label: 'Frontend', ok: desktopStatus.frontendReady },
                  { label: 'Runtime', ok: desktopStatus.runtimeReady },
                ].map((item) => (
                  <span
                    key={item.label}
                    style={{
                      borderRadius: 999,
                      padding: '2px 8px',
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      background: item.ok ? 'var(--success-bg)' : 'var(--warning-bg)',
                      color: item.ok ? 'var(--success-fg)' : 'var(--warning-fg)',
                      border: item.ok ? '1px solid var(--success-border)' : '1px solid var(--warning-border)',
                    }}
                  >
                    {item.label} {item.ok ? 'ready' : 'attention'}
                  </span>
                ))}
                {desktopBridge.platform ? (
                  <span
                    style={{
                      borderRadius: 999,
                      padding: '2px 8px',
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      background: 'var(--bg-element)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {desktopBridge.platform}
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Frontend: {desktopStatus.frontendReady ? 'ready' : 'offline'}
                <br />
                Runtime: {desktopStatus.runtimeReady ? 'ready' : 'offline'}
                <br />
                Last checked: {formatDisplayDate(desktopStatus.lastCheckedAt)}
                {desktopStatus.lastError ? (
                  <>
                    <br />
                    Last error: <span style={{ color: 'var(--warning-fg)' }}>{desktopStatus.lastError}</span>
                  </>
                ) : null}
              </div>
              <div
                style={{
                  borderLeft: desktopStatus.stackReady ? '2px solid var(--success-border)' : '2px solid var(--warning-border)',
                  background: desktopStatus.stackReady ? 'var(--success-bg)' : 'var(--warning-bg)',
                  color: 'var(--text-primary)',
                  padding: '10px 12px',
                  fontSize: 12,
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div style={{ fontWeight: 800, color: desktopStatus.stackReady ? 'var(--success-fg)' : 'var(--warning-fg)' }}>
                  {desktopStatus.stackReady ? 'Desktop wrapper connected' : 'Recovery guidance'}
                </div>
                <div style={{ color: 'var(--text-secondary)' }}>
                  {desktopStatus.stackReady
                    ? 'Wrapper, frontend, and runtime are connected. Use Local Companion status below to confirm execution readiness.'
                    : 'Use Restart stack first. If capture or browser runs still fail on macOS, confirm Screen Recording is granted to Terminal, iTerm, or the packaged Empyralis app.'}
                </div>
              </div>
              {desktopIssue ? (
                <div
                  style={{
                    borderLeft: '2px solid var(--warning-border)',
                    background: 'var(--warning-bg)',
                    color: 'var(--text-primary)',
                    padding: '10px 12px',
                    fontSize: 12,
                    display: 'grid',
                    gap: 4,
                  }}
                >
                  <div style={{ fontWeight: 800, color: 'var(--warning-fg)' }}>{desktopIssue.title}</div>
                  <div style={{ color: 'var(--text-secondary)' }}>{desktopIssue.detail}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {desktopIssue.createdAt ? (
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {formatDisplayDate(desktopIssue.createdAt)}
                      </span>
                    ) : null}
                    {desktopIssue.runId ? (
                      <Link
                        href={`/runs/${encodeURIComponent(desktopIssue.runId)}/inspect`}
                        className="orion-btn orion-btn-ghost"
                        style={{ minHeight: 28, fontSize: 11, padding: '0 8px' }}
                      >
                        Open failing run
                      </Link>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={async () => {
                    if (!desktopBridge.getStatus) return;
                    const payload = await desktopBridge.getStatus();
                    setDesktopStatus(payload);
                  }}
                  className="orion-btn orion-btn-ghost"
                  style={{ minHeight: 32, fontSize: 12 }}
                >
                  Refresh shell
                </button>
                <button
                  onClick={async () => {
                    if (!desktopBridge.restartStack) return;
                    const payload = await desktopBridge.restartStack();
                    setDesktopStatus(payload);
                    await checkAll();
                  }}
                  className="orion-btn orion-btn-ghost"
                  style={{ minHeight: 32, fontSize: 12 }}
                >
                  Restart stack
                </button>
                <button
                  onClick={async () => {
                    if (!desktopBridge.openLogsDir) return;
                    await desktopBridge.openLogsDir();
                  }}
                  className="orion-btn orion-btn-ghost"
                  style={{ minHeight: 32, fontSize: 12 }}
                >
                  Open logs
                </button>
                {desktopBridge.openExternal && desktopStatus.frontendUrl ? (
                  <button
                    onClick={async () => {
                      if (!desktopBridge.openExternal || !desktopStatus.frontendUrl) return;
                      await desktopBridge.openExternal(desktopStatus.frontendUrl);
                    }}
                    className="orion-btn orion-btn-ghost"
                    style={{ minHeight: 32, fontSize: 12 }}
                  >
                    Open frontend
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </section>
      ) : null}

      <section className="orion-panel">
        <div className="orion-panel-header" style={{ marginBottom: 12 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Terminal size={16} color="var(--primary-base)" />
            <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>Local Companion</h2>
          </div>
        </div>
        {!workers ? (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Checking local worker state.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Enabled: {workers.enabled ? 'yes' : 'no'}
              <br />
              Online: {workers.summary.online} of {workers.summary.known}
              <br />
              Busy: {workers.summary.busy} • Idle: {workers.summary.idle} • Offline: {workers.summary.offline}
              <br />
              Queue: {workers.summary.pending_runs} pending • {workers.summary.claimed_runs} claimed
            </div>
            {workers.items.length > 0 ? (
              <div style={{ borderTop: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)' }}>
                {workers.items.slice(0, 4).map((worker, index) => {
                  const online = worker.online;
                  return (
                    <div
                      key={worker.worker_id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '92px 1fr',
                        gap: 8,
                        padding: '9px 10px',
                        borderBottom: index < Math.min(workers.items.length, 4) - 1 ? '1px solid var(--border-default)' : 'none',
                        alignItems: 'start',
                      }}
                    >
                      <span
                        style={{
                          borderRadius: 999,
                          padding: '2px 8px',
                          fontSize: 10,
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          background: online ? 'var(--success-bg)' : 'var(--error-bg)',
                          color: online ? 'var(--success-fg)' : 'var(--error-fg)',
                          border: online ? '1px solid var(--success-border)' : '1px solid var(--error-border)',
                          width: 'fit-content',
                        }}
                      >
                        {worker.status || (online ? 'online' : 'offline')}
                      </span>
                      <div style={{ display: 'grid', gap: 3 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{worker.worker_id}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {worker.current_run_id ? `Current run: ${worker.current_run_id}` : 'No active run'}
                          {typeof worker.seconds_since_seen === 'number' ? ` • seen ${worker.seconds_since_seen}s ago` : ''}
                        </div>
                        {worker.note ? (
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{worker.note}</div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            <div
              style={{
                borderLeft: '2px solid var(--warning-border)',
                background: 'var(--warning-bg)',
                color: 'var(--text-primary)',
                padding: '10px 12px',
                fontSize: 12,
                display: 'grid',
                gap: 4,
              }}
            >
              <div style={{ fontWeight: 800, color: 'var(--warning-fg)' }}>Desktop permission note</div>
              <div style={{ color: 'var(--text-secondary)' }}>
                Browser capture and screenshots use the local desktop session. On macOS, grant Screen Recording to Terminal, iTerm, or the packaged Empyralis app when capture features fail.
              </div>
            </div>
          </div>
        )}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        <section className="orion-panel">
          <div className="orion-panel-header" style={{ marginBottom: 12 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={16} color="#38bdf8" />
              <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>Doctor Report</h2>
            </div>
          </div>

          {!doctor && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              No doctor data yet. Run check and verify runtime key config.
            </div>
          )}

          {doctor && (
            <div className="orion-health-doctor-groups">
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Showing {doctorChecksVisible.length} of {doctorChecksOrdered.length} checks
              </div>
              {doctorGroups.length === 0 ? (
                <div className="orion-health-doctor-priority-empty">No warning or failing checks in the current view.</div>
              ) : (
                doctorGroups.map((group) => (
                  <div key={group.id} className="orion-health-doctor-group">
                    <div className="orion-health-doctor-group-header">
                      <div>
                        <div className="orion-health-doctor-group-title">{group.title}</div>
                        <div className="orion-health-doctor-group-copy">{group.description}</div>
                      </div>
                      <div className="orion-health-doctor-group-counts">
                        <span>{group.summary.fail} fail</span>
                        <span>{group.summary.warn} warn</span>
                        <span>{group.summary.pass} pass</span>
                      </div>
                    </div>
                    <div className="orion-health-doctor-checks">
                      {group.checks.map((check) => {
                        const badge = checkBadgeColor(check.status);
                        return (
                          <div key={check.name} className="orion-health-doctor-check">
                            <span
                              style={{
                                borderRadius: 999,
                                padding: '2px 8px',
                                fontSize: 10,
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                background: badge.bg,
                                color: badge.text,
                                border: badge.border,
                                width: 'fit-content',
                              }}
                            >
                              {check.status}
                            </span>
                            <div className="orion-health-doctor-check-body">
                              <div className="orion-health-doctor-check-title">{formatDoctorCheckTitle(check.name)}</div>
                              <div className="orion-health-doctor-check-detail">{check.detail || 'No detail provided.'}</div>
                              <div className="orion-health-doctor-check-recommendation">
                                {check.recommendation || 'No recommendation required.'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        <section className="orion-panel">
          <div className="orion-panel-header" style={{ marginBottom: 12 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Database size={16} color="#a78bfa" />
              <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>Runtime KPIs</h2>
            </div>
          </div>

          {!metrics && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Metrics unavailable. Ensure `/metrics` is reachable.
            </div>
          )}

          {metrics && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>RUNS</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Started: {metrics.runs.started}
                  <br />
                  Completed: {metrics.runs.completed}
                  <br />
                  Failed: {metrics.runs.failed}
                  <br />
                  Timeout: {metrics.runs.timeout}
                  <br />
                  Active: {metrics.runs.active}
                  <br />
                  Waiting input: {metrics.runs.waiting_for_input}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>KPI</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Completion rate: {(metrics.runs.completion_rate * 100).toFixed(1)}%
                  <br />
                  Avg run duration: {metrics.kpis.avg_run_duration_ms.toFixed(0)} ms
                  <br />
                  Avg time to first value: {metrics.kpis.avg_time_to_first_value_ms.toFixed(0)} ms
                  <br />
                  Avg human wait: {metrics.kpis.avg_human_wait_ms.toFixed(0)} ms
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>PROVIDER PROFILES</div>
                {!profilesHealth ? (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    No provider profile data yet.
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Healthy: {profilesHealth.summary.healthy}
                    <br />
                    Cooldown: {profilesHealth.summary.cooldown}
                    <br />
                    Disabled: {profilesHealth.summary.disabled}
                    <br />
                    Total: {profilesHealth.summary.total}
                    {(profilesHealth.items || []).slice(0, 3).map((item) => (
                      <div key={item.id || `${item.provider}-${item.label}`} style={{ marginTop: 6 }}>
                        {item.provider || 'provider'} / {item.label || 'profile'}: {item.health || 'unknown'}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="orion-panel">
        <div className="orion-panel-header" style={{ marginBottom: 12 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Activity size={16} color="var(--primary-base)" />
            <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>Doctor history</h2>
          </div>
        </div>

        {!doctorHistory || doctorTrendItems.length === 0 ? (
          <div className="orion-health-doctor-priority-empty">
            No doctor history yet. Run checks a few times to build a trust timeline.
          </div>
        ) : (
          <div className="orion-health-doctor-history">
            {doctorTrendItems.map((item, index) => (
              <div key={`${item.generated_at || index}`} className="orion-health-doctor-history-item">
                <div className="orion-health-doctor-history-topline">
                  <span className={`orion-health-doctor-fix-badge is-${String(item.overview.status || '').toLowerCase() === 'fail' ? 'fail' : String(item.overview.status || '').toLowerCase() === 'warn' ? 'warn' : 'ok'}`}>
                    {item.overview.title || 'Snapshot'}
                  </span>
                  <span className={`orion-health-doctor-history-trend is-${item.trend}`}>
                    {item.trend}
                  </span>
                </div>
                <div className="orion-health-doctor-history-time">
                  {formatDisplayDate(item.generated_at, 'Unknown time')}
                </div>
                <div className="orion-health-doctor-history-detail">{item.overview.detail}</div>
                <div className="orion-health-doctor-history-summary">
                  <span>{item.summary.fail} fail</span>
                  <span>{item.summary.warn} warn</span>
                  <span>{item.summary.pass} pass</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {footerBanner ? (
        <div
          style={{
            borderLeft:
              footerBanner.tone === 'error'
                ? '2px solid var(--error-border)'
                : footerBanner.tone === 'warn'
                ? '2px solid var(--warning-border)'
                : '2px solid var(--success-border)',
            background:
              footerBanner.tone === 'error'
                ? 'var(--error-bg)'
                : footerBanner.tone === 'warn'
                ? 'var(--warning-bg)'
                : 'var(--success-bg)',
            color:
              footerBanner.tone === 'error'
                ? 'var(--error-fg)'
                : footerBanner.tone === 'warn'
                ? 'var(--warning-fg)'
                : 'var(--success-fg)',
            padding: '10px 12px',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {React.createElement(footerBanner.icon, { size: 14 })}
          {footerBanner.message}
        </div>
      ) : null}
    </div>
  );
}
