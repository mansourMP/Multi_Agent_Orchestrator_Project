export interface TelegramReconnectState {
  shouldReconnect: boolean;
  status: "authorization_required" | "code_required" | "password_required" | "disconnected" | "logged_out";
  reason: string;
  loginHint?: string;
  statusCode?: number;
}

export interface TelegramReconnectPolicy {
  initialDelayMs: number;
  maxDelayMs: number;
  factor: number;
  jitterRatio: number;
  maxAttempts: number;
}

export const DEFAULT_TELEGRAM_RECONNECT_POLICY: TelegramReconnectPolicy = {
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

export function resolveTelegramReconnectState(error: unknown): TelegramReconnectState {
  const raw = error && typeof error === "object" ? (error as { message?: unknown; code?: unknown }) : undefined;
  const message = String(raw?.message ?? error ?? "connection_closed").trim() || "connection_closed";
  const normalized = message.toLowerCase();
  const statusCode = normalizeStatusCode(raw?.code);

  if (normalized.includes("api_credentials_required") || normalized.includes("phone_number_required")) {
    return {
      shouldReconnect: false,
      status: "authorization_required",
      reason: message,
      loginHint: normalized.includes("phone_number_required") ? "phone_number_required" : "api_credentials_required",
      statusCode,
    };
  }
  if (
    normalized.includes("telegram_package_missing")
    || normalized.includes("cannot find package 'telegram'")
    || normalized.includes("cannot find module 'telegram'")
  ) {
    return {
      shouldReconnect: false,
      status: "authorization_required",
      reason: message,
      loginHint: "telegram_dependency_missing",
      statusCode,
    };
  }
  if (
    normalized.includes("login_code_required")
    || normalized.includes("phone code")
    || normalized.includes("code required")
  ) {
    return {
      shouldReconnect: false,
      status: "code_required",
      reason: message,
      loginHint: "login_code_required",
      statusCode,
    };
  }
  if (normalized.includes("password")) {
    return {
      shouldReconnect: false,
      status: "password_required",
      reason: message,
      loginHint: "password_required",
      statusCode,
    };
  }
  if (
    normalized.includes("session revoked")
    || normalized.includes("auth key unregistered")
    || normalized.includes("logged out")
  ) {
    return {
      shouldReconnect: false,
      status: "logged_out",
      reason: message,
      statusCode,
    };
  }
  return {
    shouldReconnect: true,
    status: "disconnected",
    reason: message,
    statusCode,
  };
}

export function computeTelegramReconnectDelay(
  attempt: number,
  policy: TelegramReconnectPolicy = DEFAULT_TELEGRAM_RECONNECT_POLICY,
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
