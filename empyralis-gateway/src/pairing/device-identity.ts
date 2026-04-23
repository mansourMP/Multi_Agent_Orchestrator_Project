import crypto from "crypto";

import { GatewayStateDb } from "../state/db";

export interface GatewayDeviceIdentity {
  gatewayId: string;
  deviceId: string;
  createdAt: string;
  updatedAt: string;
}

export async function resolveDeviceIdentity(
  db: GatewayStateDb,
  hints: Partial<GatewayDeviceIdentity> = {},
): Promise<GatewayDeviceIdentity> {
  const current = await db.readJson<GatewayDeviceIdentity | null>("identity.json", null);
  const now = new Date().toISOString();
  const next: GatewayDeviceIdentity = {
    gatewayId: String(hints.gatewayId || current?.gatewayId || `gateway_${crypto.randomUUID()}`).trim(),
    deviceId: String(hints.deviceId || current?.deviceId || `device_${crypto.randomUUID()}`).trim(),
    createdAt: current?.createdAt || now,
    updatedAt: now,
  };
  await db.writeJson("identity.json", next);
  return next;
}
