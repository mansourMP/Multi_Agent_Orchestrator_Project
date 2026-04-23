import os from "os";

export interface GatewayRuntimeMetadata {
  gatewayVersion: string;
  hostname: string;
  platform: string;
  pid: number;
  startedAt: string;
  requestedCapabilities: string[];
  deviceMetadata: Record<string, unknown>;
}

export function buildRuntimeMetadata(
  gatewayVersion: string,
  requestedCapabilities: string[] = [],
): GatewayRuntimeMetadata {
  return {
    gatewayVersion,
    hostname: os.hostname(),
    platform: `${process.platform}-${process.arch}`,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    requestedCapabilities,
    deviceMetadata: {
      hostname: os.hostname(),
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
    },
  };
}
