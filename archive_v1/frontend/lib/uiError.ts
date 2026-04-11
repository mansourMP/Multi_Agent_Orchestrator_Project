const NOTHING_HERE_YET = 'Nothing here yet.';
const BACKEND_CONNECT_MESSAGE = 'Unable to connect — check your backend is running.';
const RUNTIME_SETTLING_MESSAGE = 'The runtime is still starting up — try again in a moment.';
const ACCESS_MESSAGE = 'You do not have access to that yet.';

export function humanizeUiError(raw: unknown, fallback = 'Unable to load this right now.'): string {
  const text = String(raw || '').trim();
  if (!text) return fallback;

  if (/cannot get/i.test(text) || /\bnot found\b/i.test(text)) {
    return NOTHING_HERE_YET;
  }

  if (/\bunauthorized\b/i.test(text) || /\bforbidden\b/i.test(text)) {
    return ACCESS_MESSAGE;
  }

  if (
    /backend is offline/i.test(text)
    || /cannot reach the backend/i.test(text)
    || /failed to fetch/i.test(text)
    || /fetch failed/i.test(text)
    || /econnrefused/i.test(text)
    || /couldn't connect to server/i.test(text)
    || /network ?error/i.test(text)
  ) {
    return BACKEND_CONNECT_MESSAGE;
  }

  if (/runtime settling/i.test(text) || /service unavailable/i.test(text) || /timed out waiting/i.test(text)) {
    return RUNTIME_SETTLING_MESSAGE;
  }

  return text;
}

export function isTechnicalUiError(raw: unknown): boolean {
  const text = String(raw || '').trim();
  if (!text) return false;
  return (
    /\bunauthorized\b/i.test(text)
    || /\bnot found\b/i.test(text)
    || /cannot get/i.test(text)
    || /backend is offline/i.test(text)
    || /runtime settling/i.test(text)
    || /failed to fetch/i.test(text)
    || /econnrefused/i.test(text)
    || /couldn't connect to server/i.test(text)
  );
}

export const UI_ERROR_COPY = {
  access: ACCESS_MESSAGE,
  backend: BACKEND_CONNECT_MESSAGE,
  empty: NOTHING_HERE_YET,
  runtime: RUNTIME_SETTLING_MESSAGE,
};
