import { GatewayStateDb } from "../state/db";

export interface GatewayTokenState {
  pairingToken?: string;
  gatewayToken?: string;
  sessionToken?: string;
  sessionId?: string;
  updatedAt?: string;
}

export class GatewayTokenStore {
  constructor(private readonly db: GatewayStateDb) {}

  async load(): Promise<GatewayTokenState> {
    return this.db.readJson<GatewayTokenState>("tokens.json", {});
  }

  async save(next: GatewayTokenState): Promise<GatewayTokenState> {
    const current = await this.load();
    const merged: GatewayTokenState = {
      ...current,
      ...next,
      updatedAt: new Date().toISOString(),
    };
    await this.db.writeJson("tokens.json", merged);
    return merged;
  }

  async clearSession(): Promise<void> {
    const current = await this.load();
    await this.db.writeJson("tokens.json", {
      ...current,
      sessionToken: undefined,
      sessionId: undefined,
      updatedAt: new Date().toISOString(),
    });
  }
}
