import { GatewayStateDb } from "../../state/db";

export interface WhatsAppOutboundRecord {
  idempotencyKey: string;
  remoteJid: string;
  text: string;
  clientMessageId?: string;
  replyToExternalMessageId?: string;
  status: "pending" | "delivered";
  externalMessageId?: string;
  attemptCount: number;
  lastAttemptAt?: string;
  createdAt: string;
  updatedAt: string;
}

export class WhatsAppOutboundStore {
  constructor(private readonly db: GatewayStateDb) {}

  private normalizeRecord(record: Partial<WhatsAppOutboundRecord>): WhatsAppOutboundRecord {
    return {
      idempotencyKey: String(record.idempotencyKey || "").trim(),
      remoteJid: String(record.remoteJid || "").trim(),
      text: String(record.text || ""),
      clientMessageId: String(record.clientMessageId || "").trim() || undefined,
      replyToExternalMessageId: String(record.replyToExternalMessageId || "").trim() || undefined,
      status: record.status === "delivered" ? "delivered" : "pending",
      externalMessageId: String(record.externalMessageId || "").trim() || undefined,
      attemptCount: Math.max(Number(record.attemptCount || 0), 0),
      lastAttemptAt: String(record.lastAttemptAt || "").trim() || undefined,
      createdAt: String(record.createdAt || "").trim() || new Date().toISOString(),
      updatedAt: String(record.updatedAt || "").trim() || new Date().toISOString(),
    };
  }

  async list(): Promise<WhatsAppOutboundRecord[]> {
    const records = await this.db.readJson<Partial<WhatsAppOutboundRecord>[]>("whatsapp-outbound.json", []);
    return records.map((record) => this.normalizeRecord(record));
  }

  async get(idempotencyKey: string): Promise<WhatsAppOutboundRecord | undefined> {
    const items = await this.list();
    return items.find((item) => item.idempotencyKey === idempotencyKey);
  }

  async beginSend(
    idempotencyKey: string,
    payload: {
      remoteJid: string;
      text: string;
      clientMessageId?: string;
      replyToExternalMessageId?: string;
    },
  ): Promise<WhatsAppOutboundRecord> {
    const existing = await this.get(idempotencyKey);
    if (existing) {
      if (!existing.clientMessageId && payload.clientMessageId) {
        const items = await this.list();
        const next = items.map((item) =>
          item.idempotencyKey === idempotencyKey
            ? {
                ...item,
                clientMessageId: String(payload.clientMessageId || "").trim() || undefined,
                updatedAt: new Date().toISOString(),
              }
            : item,
        );
        await this.db.writeJson("whatsapp-outbound.json", next);
        return this.normalizeRecord(
          next.find((item) => item.idempotencyKey === idempotencyKey) ?? existing,
        );
      }
      return existing;
    }
    const items = await this.list();
    const now = new Date().toISOString();
    const record: WhatsAppOutboundRecord = {
      idempotencyKey,
      remoteJid: payload.remoteJid,
      text: payload.text,
      clientMessageId: String(payload.clientMessageId || "").trim() || undefined,
      replyToExternalMessageId: payload.replyToExternalMessageId,
      status: "pending",
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    items.push(record);
    await this.db.writeJson("whatsapp-outbound.json", items);
    return record;
  }

  async markAttemptStarted(idempotencyKey: string): Promise<WhatsAppOutboundRecord> {
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
    await this.db.writeJson("whatsapp-outbound.json", next);
    const record = next.find((item) => item.idempotencyKey === idempotencyKey);
    if (!record) {
      throw new Error("WhatsApp outbound record was not found when starting a delivery attempt.");
    }
    return record;
  }

  async markDelivered(idempotencyKey: string, externalMessageId?: string): Promise<WhatsAppOutboundRecord> {
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
    await this.db.writeJson("whatsapp-outbound.json", next);
    const record = next.find((item) => item.idempotencyKey === idempotencyKey);
    if (!record) {
      throw new Error("WhatsApp outbound record was not found after delivery update.");
    }
    return record;
  }
}
