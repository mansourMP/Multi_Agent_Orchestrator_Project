export interface WhatsAppDisconnectState {
  shouldReconnect: boolean;
  statusCode?: number;
  reason: string;
}

export interface WhatsAppReconnectPolicy {
  initialDelayMs: number;
  maxDelayMs: number;
  factor: number;
  jitterRatio: number;
  maxAttempts: number;
}

export const DEFAULT_WHATSAPP_RECONNECT_POLICY: WhatsAppReconnectPolicy = {
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  factor: 1.8,
  jitterRatio: 0.25,
  maxAttempts: 12,
};

function normalizeStatusCode(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function resolveWhatsAppReconnectState(
  lastDisconnect: unknown,
  disconnectReason: { loggedOut?: number; restartRequired?: number },
): WhatsAppDisconnectState {
  const error = lastDisconnect && typeof lastDisconnect === "object"
    ? (lastDisconnect as { error?: { output?: { statusCode?: unknown }; message?: unknown } }).error
    : undefined;
  const statusCode =
    normalizeStatusCode(error?.output?.statusCode) ??
    normalizeStatusCode((lastDisconnect as { statusCode?: unknown } | undefined)?.statusCode);
  const reason = String(error?.message ?? "connection_closed").trim() || "connection_closed";
  if (statusCode === disconnectReason.loggedOut) {
    return { shouldReconnect: false, statusCode, reason };
  }
  if (statusCode === disconnectReason.restartRequired) {
    return { shouldReconnect: true, statusCode, reason: "restart_required" };
  }
  return {
    shouldReconnect: true,
    statusCode,
    reason,
  };
}

export function computeWhatsAppReconnectDelay(
  attempt: number,
  policy: WhatsAppReconnectPolicy = DEFAULT_WHATSAPP_RECONNECT_POLICY,
): number {
  const normalizedAttempt = Math.max(Math.floor(attempt), 0);
  const baseDelay = Math.min(
    policy.maxDelayMs,
    Math.max(
      policy.initialDelayMs,
      policy.initialDelayMs * Math.pow(Math.max(policy.factor, 1), normalizedAttempt),
    ),
  );
  const jitterWindow = Math.max(Math.floor(baseDelay * Math.max(policy.jitterRatio, 0)), 0);
  if (!jitterWindow) {
    return Math.floor(baseDelay);
  }
  const offset = Math.floor((Math.random() * 2 - 1) * jitterWindow);
  return Math.max(policy.initialDelayMs, Math.floor(baseDelay + offset));
}
