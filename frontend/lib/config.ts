const DEFAULT_API_BASE = 'http://localhost:8001';

function resolveApiBase(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_ORION_API_URL ??
    DEFAULT_API_BASE
  );
}

function resolveWsBase(apiBase: string): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }
  if (apiBase.startsWith('https://')) {
    return `wss://${apiBase.slice('https://'.length)}`;
  }
  if (apiBase.startsWith('http://')) {
    return `ws://${apiBase.slice('http://'.length)}`;
  }
  return 'ws://localhost:8001';
}

export const API_BASE = resolveApiBase();
export const WS_BASE = resolveWsBase(API_BASE);
