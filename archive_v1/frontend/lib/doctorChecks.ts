export type DoctorCheckRecord = {
  name: string;
  status: 'pass' | 'warn' | 'fail' | string;
  detail?: string;
  recommendation?: string;
};

export type DoctorCheckGroup = {
  id: string;
  title: string;
  description: string;
  checks: DoctorCheckRecord[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
};

export type PriorityFix = {
  id: string;
  status: 'warn' | 'fail';
  title: string;
  detail: string;
  recommendation: string;
  category: string;
};

const CATEGORY_META: Record<
  string,
  {
    title: string;
    description: string;
  }
> = {
  runtime: {
    title: 'Runtime & execution',
    description: 'Contract health, routing, memory, and execution safety.',
  },
  auth: {
    title: 'Auth & provider access',
    description: 'Provider credentials, sign-in mode, and runtime auth.',
  },
  network: {
    title: 'Network & control plane',
    description: 'Origins, rate limits, TLS, and control-plane boundaries.',
  },
  automation: {
    title: 'Automation & channels',
    description: 'Schedulers and channel autopilots that keep workflows moving.',
  },
  storage: {
    title: 'Storage & persistence',
    description: 'Writable state paths for vault, profiles, setup, and idempotency.',
  },
  general: {
    title: 'General',
    description: 'Runtime checks that do not fit a dedicated category yet.',
  },
};

const HUMAN_NAMES: Record<string, string> = {
  runtime_contract: 'Runtime contract',
  runtime_validation: 'Runtime validation',
  execution_routing: 'Execution routing',
  memory_runtime: 'Memory runtime',
  openai_credentials: 'OpenAI credentials',
  openai_connectivity: 'OpenAI connectivity',
  codex_signin_mode: 'Codex sign-in mode',
  auth_policy: 'Runtime auth policy',
  cors_origins: 'Frontend origins',
  control_plane_origins: 'Control-plane origins',
  control_plane_rate_limit: 'Control-plane rate limit',
  run_timeout: 'Run timeout',
  retry_policy: 'Retry policy',
  scheduler: 'Scheduler',
  scheduler_poll: 'Scheduler polling',
  telegram_autopilot: 'Telegram autopilot',
  telegram_autopilot_runtime: 'Telegram autopilot runtime',
  telegram_autopilot_connectors: 'Telegram autopilot connectors',
  telegram_autopilot_errors: 'Telegram autopilot errors',
  whatsapp_autopilot: 'WhatsApp autopilot',
  whatsapp_autopilot_runtime: 'WhatsApp autopilot runtime',
  whatsapp_autopilot_connectors: 'WhatsApp autopilot connectors',
  whatsapp_autopilot_errors: 'WhatsApp autopilot errors',
  vault_storage: 'Vault storage',
  setup_sessions_storage: 'Setup session storage',
  provider_profiles_storage: 'Provider profile storage',
  idempotency_storage: 'Idempotency storage',
  tls_bundle: 'TLS bundle',
};

function normalizeStatus(status: string): 'pass' | 'warn' | 'fail' {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'pass' || normalized === 'ok') return 'pass';
  if (normalized === 'warn' || normalized === 'warning') return 'warn';
  return 'fail';
}

export function getDoctorCheckCategory(name: string): keyof typeof CATEGORY_META {
  if (name.startsWith('telegram_') || name.startsWith('whatsapp_') || name.startsWith('scheduler')) {
    return 'automation';
  }
  if (
    name === 'runtime_contract' ||
    name === 'runtime_validation' ||
    name === 'execution_routing' ||
    name === 'memory_runtime' ||
    name === 'run_timeout' ||
    name === 'retry_policy'
  ) {
    return 'runtime';
  }
  if (
    name === 'openai_credentials' ||
    name === 'openai_connectivity' ||
    name === 'codex_signin_mode' ||
    name === 'auth_policy'
  ) {
    return 'auth';
  }
  if (
    name === 'cors_origins' ||
    name === 'control_plane_origins' ||
    name === 'control_plane_rate_limit' ||
    name === 'tls_bundle'
  ) {
    return 'network';
  }
  if (
    name === 'vault_storage' ||
    name === 'setup_sessions_storage' ||
    name === 'provider_profiles_storage' ||
    name === 'idempotency_storage'
  ) {
    return 'storage';
  }
  return 'general';
}

export function formatDoctorCheckTitle(name: string): string {
  if (HUMAN_NAMES[name]) return HUMAN_NAMES[name];
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function groupDoctorChecks(checks: DoctorCheckRecord[]): DoctorCheckGroup[] {
  const buckets = new Map<string, DoctorCheckRecord[]>();

  for (const check of checks) {
    const category = getDoctorCheckCategory(check.name);
    const existing = buckets.get(category) || [];
    existing.push(check);
    buckets.set(category, existing);
  }

  return Array.from(buckets.entries())
    .map(([id, items]) => {
      const summary = items.reduce(
        (acc, item) => {
          const status = normalizeStatus(item.status);
          acc[status] += 1;
          return acc;
        },
        { pass: 0, warn: 0, fail: 0 },
      );

      const checksOrdered = [...items].sort((a, b) => {
        const rank = { fail: 0, warn: 1, pass: 2 };
        const left = rank[normalizeStatus(a.status)];
        const right = rank[normalizeStatus(b.status)];
        if (left !== right) return left - right;
        return formatDoctorCheckTitle(a.name).localeCompare(formatDoctorCheckTitle(b.name));
      });

      return {
        id,
        title: CATEGORY_META[id].title,
        description: CATEGORY_META[id].description,
        checks: checksOrdered,
        summary,
      };
    })
    .sort((a, b) => {
      const scoreA = a.summary.fail * 100 + a.summary.warn * 10 + a.summary.pass;
      const scoreB = b.summary.fail * 100 + b.summary.warn * 10 + b.summary.pass;
      return scoreB - scoreA;
    });
}

export function collectPriorityFixes(checks: DoctorCheckRecord[], limit = 6): PriorityFix[] {
  return checks
    .filter((check) => normalizeStatus(check.status) !== 'pass')
    .sort((a, b) => {
      const rank = { fail: 0, warn: 1, pass: 2 };
      const left = rank[normalizeStatus(a.status)];
      const right = rank[normalizeStatus(b.status)];
      if (left !== right) return left - right;
      return formatDoctorCheckTitle(a.name).localeCompare(formatDoctorCheckTitle(b.name));
    })
    .slice(0, limit)
    .map((check): PriorityFix | null => {
      const category = getDoctorCheckCategory(check.name);
      const status = normalizeStatus(check.status);
      if (status === 'pass') return null;
      return {
        id: check.name,
        status,
        title: formatDoctorCheckTitle(check.name),
        detail: check.detail || 'No detail provided.',
        recommendation: check.recommendation || 'Review configuration and rerun checks.',
        category: CATEGORY_META[category].title,
      };
    })
    .filter((item): item is PriorityFix => item !== null);
}
