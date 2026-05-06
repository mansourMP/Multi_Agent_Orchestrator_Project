import { GatewayStateDb } from "../../state/db";

export const TELEGRAM_TYPING_KEEPALIVE_MS = 3_000;
export const TELEGRAM_TYPING_MAX_TTL_MS = 60_000;

export type TelegramChatAction = "typing";
export type TelegramChatActionSender = (action: TelegramChatAction) => Promise<void> | void;

export class TelegramTypingKeepalive {
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private ttlTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly sender?: TelegramChatActionSender,
    private readonly keepaliveMs = TELEGRAM_TYPING_KEEPALIVE_MS,
    private readonly maxTtlMs = TELEGRAM_TYPING_MAX_TTL_MS,
  ) {}

  async start(): Promise<void> {
    if (!this.sender || this.stopped) {
      return;
    }
    try {
      await Promise.resolve(this.sender("typing"));
    } catch {
      return;
    }
    this.keepaliveTimer = setInterval(() => {
      void Promise.resolve(this.sender?.("typing")).catch(() => undefined);
    }, this.keepaliveMs);
    this.ttlTimer = setTimeout(() => {
      void this.stop().catch(() => undefined);
    }, this.maxTtlMs);
  }

  async stop(): Promise<void> {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    if (this.ttlTimer) {
      clearTimeout(this.ttlTimer);
      this.ttlTimer = null;
    }
  }
}

export interface TelegramOutboundRecord {
  idempotencyKey: string;
  remoteJid: string;
  text: string;
  replyToExternalMessageId?: string;
  status: "pending" | "delivered";
  externalMessageId?: string;
  attemptCount: number;
  lastAttemptAt?: string;
  createdAt: string;
  updatedAt: string;
}

export class TelegramOutboundStore {
  constructor(private readonly db: GatewayStateDb) {}

  private normalizeRecord(record: Partial<TelegramOutboundRecord>): TelegramOutboundRecord {
    return {
      idempotencyKey: String(record.idempotencyKey || "").trim(),
      remoteJid: String(record.remoteJid || "").trim(),
      text: String(record.text || ""),
      replyToExternalMessageId: String(record.replyToExternalMessageId || "").trim() || undefined,
      status: record.status === "delivered" ? "delivered" : "pending",
      externalMessageId: String(record.externalMessageId || "").trim() || undefined,
      attemptCount: Math.max(Number(record.attemptCount || 0), 0),
      lastAttemptAt: String(record.lastAttemptAt || "").trim() || undefined,
      createdAt: String(record.createdAt || "").trim() || new Date().toISOString(),
      updatedAt: String(record.updatedAt || "").trim() || new Date().toISOString(),
    };
  }

  async list(): Promise<TelegramOutboundRecord[]> {
    const records = await this.db.readJson<Partial<TelegramOutboundRecord>[]>("telegram-outbound.json", []);
    return records.map((record) => this.normalizeRecord(record));
  }

  async get(idempotencyKey: string): Promise<TelegramOutboundRecord | undefined> {
    const items = await this.list();
    return items.find((item) => item.idempotencyKey === idempotencyKey);
  }

  async beginSend(
    idempotencyKey: string,
    payload: {
      remoteJid: string;
      text: string;
      replyToExternalMessageId?: string;
    },
  ): Promise<TelegramOutboundRecord> {
    const existing = await this.get(idempotencyKey);
    if (existing) {
      return existing;
    }
    const items = await this.list();
    const now = new Date().toISOString();
    const record: TelegramOutboundRecord = {
      idempotencyKey,
      remoteJid: payload.remoteJid,
      text: payload.text,
      replyToExternalMessageId: payload.replyToExternalMessageId,
      status: "pending",
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    items.push(record);
    await this.db.writeJson("telegram-outbound.json", items);
    return record;
  }

  async markAttemptStarted(idempotencyKey: string): Promise<TelegramOutboundRecord> {
    const items = await this.list();
    const now = new Date().toISOString();
    const next = items.map((item) =>
      item.idempotencyKey === idempotencyKey
        ? {
            ...item,
            attemptCount: Math.max(Number(item.attemptCount || 0), 0) + 1,
            lastAttemptAt: now,
            updatedAt: now,
          }
        : item,
    );
    await this.db.writeJson("telegram-outbound.json", next);
    const record = next.find((item) => item.idempotencyKey === idempotencyKey);
    if (!record) {
      throw new Error("Telegram outbound record was not found when starting a delivery attempt.");
    }
    return record;
  }

  async markDelivered(idempotencyKey: string, externalMessageId?: string): Promise<TelegramOutboundRecord> {
    const items = await this.list();
    const now = new Date().toISOString();
    const next = items.map((item) =>
      item.idempotencyKey === idempotencyKey
        ? {
            ...item,
            status: "delivered" as const,
            externalMessageId: String(externalMessageId ?? item.externalMessageId ?? "").trim() || undefined,
            updatedAt: now,
          }
        : item,
    );
    await this.db.writeJson("telegram-outbound.json", next);
    const record = next.find((item) => item.idempotencyKey === idempotencyKey);
    if (!record) {
      throw new Error("Telegram outbound record was not found after delivery update.");
    }
    return record;
  }
}
