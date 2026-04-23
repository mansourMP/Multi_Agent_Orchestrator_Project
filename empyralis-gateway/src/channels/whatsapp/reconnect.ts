export interface WhatsAppDisconnectState {
  shouldReconnect: boolean;
  statusCode?: number;
  reason: string;
}

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
