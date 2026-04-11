'use client';

export type RuntimeConnectionStatus = {
  configured: boolean;
  healthy: boolean;
};

export async function fetchRuntimeConnectionStatus(): Promise<RuntimeConnectionStatus> {
  const response = await fetch('/api/onboarding/runtime-connection', {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const payload = await response.json().catch(() => ({}));
  return {
    configured: Boolean(payload?.configured),
    healthy: Boolean(payload?.healthy),
  };
}

export async function connectRuntimeWithApiKey(apiKey: string): Promise<void> {
  const response = await fetch('/api/onboarding/runtime-connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail = payload && typeof payload.detail === 'string' && payload.detail.trim()
      ? payload.detail.trim()
      : 'Unable to connect to the runtime.';
    throw new Error(detail);
  }
}
