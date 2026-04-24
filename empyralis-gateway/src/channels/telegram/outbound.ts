import { GatewayStateDb } from "../../state/db";

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
