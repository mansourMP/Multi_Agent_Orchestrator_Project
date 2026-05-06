import { GatewayStateDb, GatewayStateSnapshot } from "./db";

export type GatewayHealthState = "online" | "offline" | "reconnecting" | "degraded";

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

  async saveHealthState(
    healthState: GatewayHealthState,
    snapshot: Omit<GatewayStateSnapshot, "healthState"> = {},
  ): Promise<GatewayStateSnapshot> {
    return this.save({
      ...snapshot,
      healthState,
    });
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
