import type { TelegramSessionSnapshot } from "./session-store";

export interface TelegramLoginConfig {
  apiId?: number;
  apiHash?: string;
  phoneNumber?: string;
  loginCode?: string;
  password?: string;
  sessionString?: string;
}

export interface TelegramLinkedAccount {
  userId?: string;
  username?: string;
  phone?: string;
  name?: string;
}

function normalizePositiveInt(value: string | undefined): number | undefined {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function maskPhoneNumber(phoneNumber: string | undefined): string | undefined {
  const digits = String(phoneNumber || "").replace(/\D+/g, "");
  if (!digits) {
    return undefined;
  }
  if (digits.length <= 4) {
    return digits;
  }
  return `${"*".repeat(Math.max(digits.length - 4, 1))}${digits.slice(-4)}`;
}

export function loadTelegramLoginConfig(env: NodeJS.ProcessEnv = process.env): TelegramLoginConfig {
  return {
    apiId: normalizePositiveInt(env.EMPYRALIS_TELEGRAM_API_ID),
    apiHash: String(env.EMPYRALIS_TELEGRAM_API_HASH || "").trim() || undefined,
    phoneNumber: String(env.EMPYRALIS_TELEGRAM_PHONE_NUMBER || "").trim() || undefined,
    loginCode: String(env.EMPYRALIS_TELEGRAM_LOGIN_CODE || "").trim() || undefined,
    password: String(env.EMPYRALIS_TELEGRAM_PASSWORD || "").trim() || undefined,
    sessionString: String(env.EMPYRALIS_TELEGRAM_SESSION || "").trim() || undefined,
  };
}

export function buildTelegramPreflightState(config: TelegramLoginConfig): Partial<TelegramSessionSnapshot> | null {
  if (!config.apiId || !config.apiHash) {
    return {
      status: "authorization_required",
      loginHint: "api_credentials_required",
      retryable: false,
    };
  }
  if (!config.sessionString && !config.phoneNumber) {
    return {
      status: "authorization_required",
      loginHint: "phone_number_required",
      retryable: false,
    };
  }
  if (!config.sessionString && !config.loginCode) {
    return {
      status: "code_required",
      loginHint: maskPhoneNumber(config.phoneNumber) || "login_code_required",
      retryable: false,
    };
  }
  return null;
}

export function buildTelegramConnectedState(account: TelegramLinkedAccount): Partial<TelegramSessionSnapshot> {
  return {
    status: "connected",
    loginHint: undefined,
    linkedUserId: String(account.userId || "").trim() || undefined,
    linkedUsername: String(account.username || "").trim() || undefined,
    linkedPhone: String(account.phone || "").trim() || undefined,
    linkedName: String(account.name || "").trim() || undefined,
    connectedAt: new Date().toISOString(),
    retryable: true,
    lastDisconnectReason: undefined,
    lastDisconnectCode: undefined,
  };
}
