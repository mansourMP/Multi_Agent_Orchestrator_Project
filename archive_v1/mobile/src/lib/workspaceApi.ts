import type { MobileSession } from "./types";
import { normalizeServerUrl } from "./api";
import { sessionAuthHeaders } from "./session";

function formatNetworkError(baseUrl: string) {
  const normalized = normalizeServerUrl(baseUrl);
  const target = normalized || "the configured server";
  const isLoopback = /127\.0\.0\.1|localhost/i.test(target);
  const hint = isLoopback
    ? " On a real phone, use your computer's LAN IP instead of 127.0.0.1 or localhost."
    : "";
  return `Network request failed for ${target}.${hint}`;
}

async function requestRuntime<T>(session: MobileSession, path: string, init?: RequestInit): Promise<T> {
  const baseUrl = normalizeServerUrl(session.runtimeUrl);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(sessionAuthHeaders(session) || {}),
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Request failed.");
  }

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const workspaceApi = {
  readFile(session: MobileSession, path: string) {
    return requestRuntime<any>(session, `/files/read?path=${encodeURIComponent(path)}`);
  },
};
