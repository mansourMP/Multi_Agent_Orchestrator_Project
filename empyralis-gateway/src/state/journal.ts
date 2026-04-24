import { promises as fs } from "fs";

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

  private async durableLastCursor(): Promise<number> {
    const meta = await this.db.readJson<GatewayJournalMeta>("journal-meta.json", { lastCursor: 0 });
    let lastCursorFromFile = 0;
    try {
      const raw = await fs.readFile(this.db.filePath("journal.ndjson"), "utf8");
      const lines = raw.split("\n");
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const token = lines[index]?.trim();
        if (!token) {
          continue;
        }
        try {
          const entry = JSON.parse(token) as Partial<GatewayJournalEntry>;
          const cursor = Number(entry.cursor || 0);
          if (cursor > 0) {
            lastCursorFromFile = cursor;
            break;
          }
        } catch {
          continue;
        }
      }
    } catch {
      lastCursorFromFile = 0;
    }
    return Math.max(intOr(meta.lastCursor, 0), lastCursorFromFile);
  }

  async append(
    direction: GatewayJournalEntry["direction"],
    messageType: string,
    payload: Record<string, unknown>,
  ): Promise<GatewayJournalEntry> {
    const lastCursor = await this.durableLastCursor();
    const entry: GatewayJournalEntry = {
      cursor: lastCursor + 1,
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
    return this.durableLastCursor();
  }
}

function intOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}
