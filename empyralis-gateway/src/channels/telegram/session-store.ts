import { promises as fs } from "fs";
import path from "path";

import { GatewayStateDb } from "../../state/db";

export const TELEGRAM_PERSONAL_CHANNEL_KEY = "telegram_personal";
export const TELEGRAM_PERSONAL_PROVIDER = "telegram_gramjs";

export interface TelegramSessionSnapshot {
  channelKey: string;
  provider: string;
  status:
    | "idle"
    | "authorization_required"
    | "code_required"
    | "password_required"
    | "connecting"
    | "connected"
    | "disconnected"
    | "logged_out";
  loginHint?: string;
  linkedUserId?: string;
  linkedUsername?: string;
  linkedPhone?: string;
  linkedName?: string;
  connectedAt?: string;
  lastDisconnectReason?: string;
  lastDisconnectCode?: number;
  retryable?: boolean;
  updatedAt?: string;
}

const DEFAULT_SNAPSHOT: TelegramSessionSnapshot = {
  channelKey: TELEGRAM_PERSONAL_CHANNEL_KEY,
  provider: TELEGRAM_PERSONAL_PROVIDER,
  status: "idle",
};

export class TelegramSessionStore {
  constructor(private readonly db: GatewayStateDb) {}

  runtimeDir(): string {
    return path.join(this.db.rootDirPath(), "telegram");
  }

  async ensureRuntimeDir(): Promise<string> {
    const target = this.runtimeDir();
    await fs.mkdir(target, { recursive: true });
    return target;
  }

  async load(): Promise<TelegramSessionSnapshot> {
    return this.db.readJson<TelegramSessionSnapshot>("telegram-session.json", DEFAULT_SNAPSHOT);
  }

  async save(snapshot: Partial<TelegramSessionSnapshot>): Promise<TelegramSessionSnapshot> {
    const current = await this.load();
    const next: TelegramSessionSnapshot = {
      ...current,
      ...snapshot,
      channelKey: TELEGRAM_PERSONAL_CHANNEL_KEY,
      provider: TELEGRAM_PERSONAL_PROVIDER,
      updatedAt: new Date().toISOString(),
    };
    return this.db.writeJson("telegram-session.json", next);
  }

  async loadSessionString(): Promise<string | undefined> {
    const payload = await this.db.readJson<{ sessionString?: string }>("telegram-auth.json", {});
    const token = String(payload.sessionString || "").trim();
    return token || undefined;
  }

  async saveSessionString(sessionString?: string): Promise<void> {
    const token = String(sessionString || "").trim();
    await this.db.writeJson("telegram-auth.json", {
      sessionString: token || undefined,
      updatedAt: new Date().toISOString(),
    });
  }

  async clearSessionString(): Promise<void> {
    await this.saveSessionString(undefined);
  }

  toGatewayStatePayload(snapshot: TelegramSessionSnapshot): Record<string, unknown> {
    return {
      personal_channels: {
        [TELEGRAM_PERSONAL_CHANNEL_KEY]: {
          channel_key: TELEGRAM_PERSONAL_CHANNEL_KEY,
          provider: TELEGRAM_PERSONAL_PROVIDER,
          status: snapshot.status,
          login_hint: snapshot.loginHint,
          linked_user_id: snapshot.linkedUserId,
          linked_username: snapshot.linkedUsername,
          linked_phone: snapshot.linkedPhone,
          linked_name: snapshot.linkedName,
          connected_at: snapshot.connectedAt,
          retryable: snapshot.retryable,
          last_disconnect_reason: snapshot.lastDisconnectReason,
          last_disconnect_code: snapshot.lastDisconnectCode,
          updated_at: snapshot.updatedAt,
        },
      },
    };
  }
}
