import { GatewayStateDb, GatewayStateSnapshot } from "./db";

export class GatewayCheckpoints {
  constructor(private readonly db: GatewayStateDb) {}

  async load(): Promise<GatewayStateSnapshot> {
    return this.db.readJson<GatewayStateSnapshot>("checkpoints.json", {});
  }

  async save(snapshot: GatewayStateSnapshot): Promise<GatewayStateSnapshot> {
    const current = await this.load();
    const merged: GatewayStateSnapshot = {
      ...current,
      ...snapshot,
      updatedAt: new Date().toISOString(),
    };
    return this.db.writeJson("checkpoints.json", merged);
  }

  async markRecovered(snapshot: GatewayStateSnapshot = {}): Promise<GatewayStateSnapshot> {
    return this.save({
      ...snapshot,
      resumeReady: true,
      lastRecoveryAt: new Date().toISOString(),
      lastDisconnectReason: undefined,
    });
  }
}
