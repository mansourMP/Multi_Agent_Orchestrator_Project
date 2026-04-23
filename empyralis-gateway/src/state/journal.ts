import { GatewayStateDb } from "./db";

export interface GatewayJournalEntry {
  cursor: number;
  direction: "inbound" | "outbound" | "system";
  messageType: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

interface GatewayJournalMeta {
  lastCursor: number;
}

export class GatewayJournal {
  constructor(private readonly db: GatewayStateDb) {}

  async append(
    direction: GatewayJournalEntry["direction"],
    messageType: string,
    payload: Record<string, unknown>,
  ): Promise<GatewayJournalEntry> {
    const meta = await this.db.readJson<GatewayJournalMeta>("journal-meta.json", { lastCursor: 0 });
    const entry: GatewayJournalEntry = {
      cursor: meta.lastCursor + 1,
      direction,
      messageType,
      createdAt: new Date().toISOString(),
      payload,
    };
    await this.db.appendNdjson("journal.ndjson", entry);
    await this.db.writeJson("journal-meta.json", { lastCursor: entry.cursor });
    return entry;
  }

  async lastCursor(): Promise<number> {
    const meta = await this.db.readJson<GatewayJournalMeta>("journal-meta.json", { lastCursor: 0 });
    return meta.lastCursor;
  }
}
