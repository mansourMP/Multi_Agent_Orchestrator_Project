export function buildRunStartedMessage(profileLabel?: string | null, provider?: string | null, model?: string | null): string {
  const normalizedProfile = String(profileLabel || '').trim();
  const normalizedProvider = String(provider || '').trim();
  const normalizedModel = String(model || '').trim();
  if (normalizedProfile && normalizedProvider && normalizedModel) {
    return `Run requested with ${normalizedProfile} (${normalizedProvider}:${normalizedModel}).`;
  }
  if (normalizedProvider && normalizedModel) {
    return `Run requested with ${normalizedProvider}:${normalizedModel}.`;
  }
  if (normalizedProfile) return `Run requested with ${normalizedProfile}.`;
  return 'Run started.';
}

export const RUN_STARTED_STATUS_COPY = 'Run started.';
export const RUN_COMPLETED_STATUS_COPY = 'Run completed.';
export const RUN_FAILED_STATUS_COPY = 'Run failed.';
export const RUN_WAITING_STATUS_COPY = 'Run requires your approval.';
export const OPEN_LIVE_RUN_LABEL = 'Open live run';
