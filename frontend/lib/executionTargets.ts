export type ExecutionTarget = 'auto' | 'local_companion' | 'cloud';
export type ExecutionTargetGuide = {
  value: ExecutionTarget;
  label: string;
  summary: string;
  hint: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function normalizeExecutionTarget(value: unknown): ExecutionTarget {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    normalized === 'local'
    || normalized === 'local_companion'
    || normalized === 'desktop'
    || normalized === 'browser'
  ) {
    return 'local_companion';
  }
  if (
    normalized === 'cloud'
    || normalized === 'server'
    || normalized === 'headless'
  ) {
    return 'cloud';
  }
  return 'auto';
}

export function formatExecutionTargetLabel(value: unknown): string {
  const target = normalizeExecutionTarget(value);
  if (target === 'local_companion') return 'Local machine';
  if (target === 'cloud') return 'Cloud runtime';
  return 'Automatic';
}

export function describeExecutionTarget(value: unknown, hasLocalRuntime: boolean): string {
  const target = normalizeExecutionTarget(value);
  if (target === 'local_companion') {
    return hasLocalRuntime
      ? 'Run this on a connected local machine.'
      : 'No local machine is online right now.';
  }
  if (target === 'cloud') {
    return 'Run this in the managed cloud runtime.';
  }
  return hasLocalRuntime
    ? 'Prefer a local machine when available, then fall back to cloud.'
    : 'No local machine is online, so this will run in cloud mode.';
}

export function getExecutionTargetGuides(hasLocalRuntime: boolean): ExecutionTargetGuide[] {
  return [
    {
      value: 'auto',
      label: 'Automatic',
      summary: 'Hekor chooses the best place to run the task.',
      hint: hasLocalRuntime
        ? 'Best default. Use this when you do not care where work runs.'
        : 'Best default. Right now this will stay in cloud mode until a machine comes online.',
    },
    {
      value: 'local_companion',
      label: 'Local machine',
      summary: 'Run on a connected machine you control.',
      hint: hasLocalRuntime
        ? 'Use this when work needs local files, local apps, or device-only access.'
        : 'Only available when a local machine is online.',
    },
    {
      value: 'cloud',
      label: 'Cloud runtime',
      summary: 'Run in Hekor without depending on this device.',
      hint: 'Use this for hosted work, remote execution, or when your machine should stay out of the loop.',
    },
  ];
}

export function hasOnlineLocalRuntime(payload: unknown): boolean {
  const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
  return items.some((item) => {
    if (!isRecord(item)) return false;
    const runtimeType = String(item.runtime_type || '').trim().toLowerCase();
    const executionTargets = Array.isArray(item.execution_targets) ? item.execution_targets : [];
    const normalizedTargets = executionTargets.map((target) => String(target || '').trim().toLowerCase());
    return Boolean(item.online) && (
      runtimeType === 'local'
      || runtimeType === 'local_companion'
      || normalizedTargets.includes('local')
      || normalizedTargets.includes('local_companion')
    );
  });
}
