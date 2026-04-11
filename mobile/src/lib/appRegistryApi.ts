import type { MobileSession } from "./types";
import { normalizeServerUrl } from "./api";
import { sessionAuthHeaders } from "./session";

type AppInstallMetadata = {
  packageId?: string;
  releaseChannel?: string;
  source?: "core" | "platform" | "preview";
};

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

async function requestBase<T>(baseUrl: string, apiKey: string | undefined, path: string, init?: RequestInit): Promise<T> {
  const normalizedBaseUrl = normalizeServerUrl(baseUrl);
  let response: Response;
  try {
    response = await fetch(`${normalizedBaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    throw new Error(error instanceof TypeError ? formatNetworkError(normalizedBaseUrl) : "Request failed.");
  }

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const appRegistryApi = {
  getInstalledApps(session: MobileSession) {
    return requestRuntime<{ items?: any[] }>(session, "/apps/installed");
  },
  getPlatformStoreApps(session: MobileSession) {
    if (!session.platformUrl) {
      throw new Error("Platform registry not configured");
    }
    return requestBase<{ items?: any[] }>(session.platformUrl, session.platformKey, "/apps/store");
  },
  getPlatformAppManifest(session: MobileSession, appId: string) {
    if (!session.platformUrl) {
      throw new Error("Platform registry not configured");
    }
    return requestBase<{ item?: any }>(
      session.platformUrl,
      session.platformKey,
      `/apps/manifest/${encodeURIComponent(appId)}`,
    );
  },
  getAppUpdates(session: MobileSession) {
    return requestRuntime<{ items?: any[] }>(session, "/apps/updates");
  },
  getAppManifest(session: MobileSession, appId: string) {
    return requestRuntime<{ item?: any }>(session, `/apps/manifest/${encodeURIComponent(appId)}`);
  },
  installApp(session: MobileSession, appId: string, metadata?: AppInstallMetadata) {
    return requestRuntime<any>(session, "/apps/install", {
      method: "POST",
      body: JSON.stringify({
        app_id: appId,
        package_id: metadata?.packageId,
        release_channel: metadata?.releaseChannel,
        install_source: metadata?.source,
      }),
    });
  },
  uninstallApp(session: MobileSession, appId: string) {
    return requestRuntime<any>(session, "/apps/uninstall", {
      method: "POST",
      body: JSON.stringify({ app_id: appId }),
    });
  },
  updateApp(session: MobileSession, appId: string, metadata?: AppInstallMetadata) {
    return requestRuntime<any>(session, "/apps/update", {
      method: "POST",
      body: JSON.stringify({
        app_id: appId,
        package_id: metadata?.packageId,
        release_channel: metadata?.releaseChannel,
        install_source: metadata?.source,
      }),
    });
  },
};
