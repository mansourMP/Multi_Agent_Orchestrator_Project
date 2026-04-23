import type { GatewayFrame } from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function encodeFrame(frame: GatewayFrame): string {
  return JSON.stringify(frame);
}

export function decodeFrame(raw: string): GatewayFrame {
  const parsed = JSON.parse(raw) as unknown;
  if (!isObject(parsed)) {
    throw new Error("Gateway frame must be an object.");
  }
  const kind = String(parsed.kind ?? "").trim();
  if (kind !== "request" && kind !== "response" && kind !== "event") {
    throw new Error(`Unsupported gateway frame kind: ${kind}`);
  }
  return parsed as unknown as GatewayFrame;
}
