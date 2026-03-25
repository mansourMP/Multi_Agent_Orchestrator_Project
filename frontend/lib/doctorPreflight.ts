import { collectPriorityFixes, type DoctorCheckRecord, type PriorityFix } from '@/lib/doctorChecks';
import { API_BASE } from '@/lib/config';
import { type ExecutionTarget, formatExecutionTargetLabel } from '@/lib/executionTargets';
import { readRuntimeApiKeyFromStorage } from '@/lib/runtimeKey';

const ORION_API_URL = process.env.NEXT_PUBLIC_ORION_API_URL ?? API_BASE;

type DoctorOverview = {
  status: 'pass' | 'warn' | 'fail';
  title: string;
  detail: string;
};

type DoctorSummary = {
  pass: number;
  warn: number;
  fail: number;
};

type DoctorPayload = {
  ok?: boolean;
  overview?: {
    status?: string;
    title?: string;
    detail?: string;
  };
  summary?: Partial<DoctorSummary>;
  checks?: DoctorCheckRecord[];
  priority_fixes?: PriorityFix[];
  generated_at?: string | null;
};

export type DoctorPreflightReport = {
  available: boolean;
  overview: DoctorOverview;
  summary: DoctorSummary;
  checks: DoctorCheckRecord[];
  priorityFixes: PriorityFix[];
  generatedAt?: string | null;
};

export type DoctorRunGateDecision = {
  status: 'pass' | 'warn' | 'fail';
  blocking: boolean;
  title: string;
  detail: string;
  recommendation: string;
  report: DoctorPreflightReport;
};

type DoctorRunGateOptions = {
  executionTarget: ExecutionTarget;
  runtimeProvider?: string | null;
  usesManagedOpenAi?: boolean;
};

function normalizeDoctorStatus(value: unknown): 'pass' | 'warn' | 'fail' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'pass' || normalized === 'ok') return 'pass';
  if (normalized === 'warn' || normalized === 'warning') return 'warn';
  return 'fail';
}

function buildDoctorHeaders(headers?: HeadersInit): Headers {
  const merged = new Headers(headers || {});
  const runtimeApiKey = readRuntimeApiKeyFromStorage('');
  if (runtimeApiKey && !merged.has('X-API-Key')) {
    merged.set('X-API-Key', runtimeApiKey);
  }
  return merged;
}

function buildUnavailableReport(detail: string): DoctorPreflightReport {
  return {
    available: false,
    overview: {
      status: 'warn',
      title: 'Doctor unavailable',
      detail,
    },
    summary: { pass: 0, warn: 1, fail: 0 },
    checks: [],
    priorityFixes: [],
    generatedAt: null,
  };
}

function firstCheckByStatus(checks: DoctorCheckRecord[], status: 'warn' | 'fail'): DoctorCheckRecord | null {
  return checks.find((check) => normalizeDoctorStatus(check.status) === status) || null;
}

export async function fetchDoctorPreflight(headers?: HeadersInit): Promise<DoctorPreflightReport> {
  let response: Response;
  try {
    response = await fetch(`${ORION_API_URL}/doctor`, {
      headers: buildDoctorHeaders(headers),
      cache: 'no-store',
    });
  } catch {
    return buildUnavailableReport('Hekor could not confirm runtime health right now.');
  }

  if (!response.ok) {
    let detail = 'Hekor could not confirm runtime health right now.';
    try {
      const payload = (await response.json()) as { detail?: string; error?: string; message?: string };
      detail = payload.detail || payload.error || payload.message || detail;
    } catch {
      // Ignore parsing failures and keep the default detail.
    }
    return buildUnavailableReport(detail);
  }

  const payload = (await response.json().catch(() => ({}))) as DoctorPayload;
  const checks = Array.isArray(payload.checks) ? payload.checks : [];
  const summary = {
    pass: Number(payload.summary?.pass || 0),
    warn: Number(payload.summary?.warn || 0),
    fail: Number(payload.summary?.fail || 0),
  };
  const priorityFixes = Array.isArray(payload.priority_fixes) && payload.priority_fixes.length > 0
    ? payload.priority_fixes
    : collectPriorityFixes(checks);
  const overviewStatus = normalizeDoctorStatus(payload.overview?.status || (summary.fail > 0 ? 'fail' : summary.warn > 0 ? 'warn' : 'pass'));

  return {
    available: true,
    overview: {
      status: overviewStatus,
      title: String(payload.overview?.title || (overviewStatus === 'pass' ? 'Runtime healthy' : overviewStatus === 'warn' ? 'Runtime has warnings' : 'Runtime needs attention')).trim(),
      detail: String(payload.overview?.detail || (overviewStatus === 'pass' ? 'Hekor is ready to run tasks.' : 'Review Health before starting sensitive work.')).trim(),
    },
    summary,
    checks,
    priorityFixes,
    generatedAt: payload.generated_at || null,
  };
}

export function evaluateDoctorRunGate(
  report: DoctorPreflightReport,
  options: DoctorRunGateOptions,
): DoctorRunGateDecision {
  const firstFail = firstCheckByStatus(report.checks, 'fail');
  const firstWarn = firstCheckByStatus(report.checks, 'warn');
  const runtimeProvider = String(options.runtimeProvider || '').trim().toLowerCase();
  const routeLabel = formatExecutionTargetLabel(options.executionTarget).toLowerCase();

  if (!report.available) {
    return {
      status: 'warn',
      blocking: false,
      title: report.overview.title,
      detail: report.overview.detail,
      recommendation: 'Open Health and rerun checks if you want a fresh runtime report before starting work.',
      report,
    };
  }

  const openAiConnectivityWarning = report.checks.find(
    (check) => check.name === 'openai_connectivity' && normalizeDoctorStatus(check.status) === 'warn',
  );
  if (openAiConnectivityWarning && runtimeProvider === 'openai' && options.usesManagedOpenAi) {
    return {
      status: 'fail',
      blocking: true,
      title: 'OpenAI connection needs attention',
      detail: openAiConnectivityWarning.detail || 'Managed OpenAI access is not ready for this run.',
      recommendation:
        openAiConnectivityWarning.recommendation
        || 'Open Health and reconnect the managed OpenAI account before running.',
      report,
    };
  }

  if (firstFail) {
    if (options.executionTarget === 'local_companion') {
      return {
        status: 'fail',
        blocking: true,
        title: 'Local runtime needs attention',
        detail: firstFail.detail || report.overview.detail,
        recommendation: firstFail.recommendation || 'Open Health and fix the runtime before running locally.',
        report,
      };
    }
    return {
      status: 'warn',
      blocking: false,
      title: 'Runtime needs attention',
      detail: `${firstFail.detail || report.overview.detail} Hekor can still try ${routeLabel}, but you should review Health first.`,
      recommendation: firstFail.recommendation || 'Open Health before starting high-trust work.',
      report,
    };
  }

  if (firstWarn) {
    return {
      status: 'warn',
      blocking: false,
      title: report.overview.title || 'Runtime has warnings',
      detail: firstWarn.detail || report.overview.detail,
      recommendation: firstWarn.recommendation || 'Open Health to review the warning before you run.',
      report,
    };
  }

  return {
    status: 'pass',
    blocking: false,
    title: report.overview.title || 'Runtime healthy',
    detail: report.overview.detail || `Doctor checks passed for ${routeLabel}.`,
    recommendation: 'No action needed.',
    report,
  };
}

export async function fetchDoctorRunGate(
  options: DoctorRunGateOptions,
  headers?: HeadersInit,
): Promise<DoctorRunGateDecision> {
  const report = await fetchDoctorPreflight(headers);
  return evaluateDoctorRunGate(report, options);
}
