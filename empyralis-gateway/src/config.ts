import fs from "fs";
import os from "os";
import path from "path";

export interface GatewayConfig {
  apiBaseUrl: string;
  stateDir: string;
  heartbeatIntervalMs: number;
  reconnectMinDelayMs: number;
  reconnectMaxDelayMs: number;
  supervisorUrl: string;
  supervisorSecret?: string;
  supervisorTimeoutMs: number;
  pairingToken?: string;
  gatewayId?: string;
  deviceId?: string;
  gatewayToken?: string;
  displayName?: string;
  browserPythonExecutable: string;
  browserProjectRoot: string;
}

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  const token = String(value ?? "").trim();
  return (token || fallback).replace(/\/+$/, "");
}

function normalizePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveBrowserPythonExecutable(projectRoot: string, explicitValue: string | undefined): string {
  const token = String(explicitValue || "").trim();
  if (token) {
    return token;
  }
  const candidates = [
    path.join(projectRoot, "venv", "bin", "python3"),
    path.join(projectRoot, "venv", "bin", "python"),
    path.join(projectRoot, ".venv", "bin", "python3"),
    path.join(projectRoot, ".venv", "bin", "python"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "python3";
}

export function loadGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const homeDir = env.HOME || os.homedir();
  const browserProjectRoot = path.resolve(env.EMPYRALIS_GATEWAY_BROWSER_PROJECT_ROOT || process.cwd());
  return {
    apiBaseUrl: normalizeBaseUrl(env.EMPYRALIS_GATEWAY_API_URL, "http://127.0.0.1:8001/api"),
    stateDir: path.resolve(
      env.EMPYRALIS_GATEWAY_STATE_DIR || path.join(homeDir, ".empyralis", "gateway"),
    ),
    heartbeatIntervalMs: normalizePositiveInt(env.EMPYRALIS_GATEWAY_HEARTBEAT_MS, 20_000),
    reconnectMinDelayMs: normalizePositiveInt(env.EMPYRALIS_GATEWAY_RECONNECT_MIN_MS, 1_000),
    reconnectMaxDelayMs: normalizePositiveInt(env.EMPYRALIS_GATEWAY_RECONNECT_MAX_MS, 30_000),
    supervisorUrl: normalizeBaseUrl(env.EMPYRALIS_SUPERVISOR_URL, "http://127.0.0.1:7788"),
    supervisorSecret: String(env.EMPYRALIS_SUPERVISOR_SECRET || "").trim() || undefined,
    supervisorTimeoutMs: normalizePositiveInt(env.EMPYRALIS_SUPERVISOR_TIMEOUT_MS, 10_000),
    pairingToken: String(env.EMPYRALIS_GATEWAY_PAIRING_TOKEN || "").trim() || undefined,
    gatewayId: String(env.EMPYRALIS_GATEWAY_ID || "").trim() || undefined,
    deviceId: String(env.EMPYRALIS_GATEWAY_DEVICE_ID || "").trim() || undefined,
    gatewayToken: String(env.EMPYRALIS_GATEWAY_TOKEN || "").trim() || undefined,
    displayName: String(env.EMPYRALIS_GATEWAY_DISPLAY_NAME || "").trim() || os.hostname(),
    browserPythonExecutable: resolveBrowserPythonExecutable(
      browserProjectRoot,
      env.EMPYRALIS_GATEWAY_BROWSER_PYTHON,
    ),
    browserProjectRoot,
  };
}
