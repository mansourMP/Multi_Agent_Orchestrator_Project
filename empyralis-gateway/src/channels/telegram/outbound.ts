import { GatewayStateDb } from "../../state/db";

export interface TelegramOutboundRecord {
  idempotencyKey: string;
  remoteJid: string;
  text: string;
  replyToExternalMessageId?: string;
  status: "pending" | "delivered";
  externalMessageId?: string;
  createdAt: string;
  updatedAt: string;
}

export class TelegramOutboundStore {
  constructor(private readonly db: GatewayStateDb) {}

  async list(): Promise<TelegramOutboundRecord[]> {
    return this.db.readJson<TelegramOutboundRecord[]>("telegram-outbound.json", []);
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
      createdAt: now,
      updatedAt: now,
    };
    items.push(record);
    await this.db.writeJson("telegram-outbound.json", items);
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
