import Constants from "expo-constants";

import type { AgentSummary, ApprovalSummary, ArtifactSummary, MobileSession, RunSummary } from "./types";

const extra = (Constants.expoConfig?.extra ?? {}) as {
  runtimeUrl?: string;
  workspaceId?: string;
  platformUrl?: string;
};

export function getDefaultRuntimeUrl() {
  return process.env.EXPO_PUBLIC_RUNTIME_URL || extra.runtimeUrl || "http://127.0.0.1:8001";
}

export function getDefaultWorkspaceId() {
  return process.env.EXPO_PUBLIC_WORKSPACE_ID || extra.workspaceId || "default";
}

export function getDefaultPlatformUrl() {
  return process.env.EXPO_PUBLIC_PLATFORM_URL || extra.platformUrl || "";
}

type AppInstallMetadata = {
  packageId?: string;
  releaseChannel?: string;
  source?: "core" | "platform" | "preview";
};

async function request<T>(session: MobileSession, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${session.runtimeUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": session.runtimeKey,
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function requestBase<T>(baseUrl: string, apiKey: string | undefined, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "X-API-Key": apiKey } : {}),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const mobileApi = {
  getRun(session: MobileSession, runId: string) {
    return request<any>(session, `/runs/${encodeURIComponent(runId)}`);
  },
  listFiles(session: MobileSession, path?: string) {
    const query = path ? `?path=${encodeURIComponent(path)}` : "";
    return request<any>(session, `/files/list${query}`);
  },
  readFile(session: MobileSession, path: string) {
    return request<any>(session, `/files/read?path=${encodeURIComponent(path)}`);
  },
  writeFile(
    session: MobileSession,
    payload: { path: string; content: string; overwrite?: boolean },
  ) {
    return request<any>(session, "/files/write", {
      method: "POST",
      body: JSON.stringify({ ...payload, workspace_id: session.workspaceId }),
    });
  },
  deleteFileRequest(session: MobileSession, path: string) {
    return request<any>(session, "/files/delete_request", {
      method: "POST",
      body: JSON.stringify({ path, workspace_id: session.workspaceId }),
    });
  },
  executeDeviceAction(session: MobileSession, payload: { action: string; args?: Record<string, any> }) {
    return request<any>(session, "/device/execute", {
      method: "POST",
      body: JSON.stringify({ ...payload, workspace_id: session.workspaceId }),
    });
  },
  getAudit(session: MobileSession, limit = 100) {
    return request<any>(session, `/audit?limit=${encodeURIComponent(String(limit))}`);
  },
  getAgentSnapshot(session: MobileSession) {
    return request<{ agents?: AgentSummary[] }>(
      session,
      `/agents/workspace/snapshot?workspace_id=${encodeURIComponent(session.workspaceId)}`,
    );
  },
  getCoreStatus(session: MobileSession) {
    return request<any>(
      session,
      `/agents/workspace/snapshot?workspace_id=${encodeURIComponent(session.workspaceId)}&history_limit=1&audit_limit=1`,
    );
  },
  getRuns(session: MobileSession) {
    return request<{ items?: RunSummary[] }>(
      session,
      `/history/runs?workspace_id=${encodeURIComponent(session.workspaceId)}`,
    );
  },
  getApprovals(session: MobileSession) {
    return request<{ pending?: ApprovalSummary[]; items?: ApprovalSummary[] }>(
      session,
      `/approvals?workspace_id=${encodeURIComponent(session.workspaceId)}`,
    );
  },
  getArtifacts(session: MobileSession) {
    return request<{ items?: ArtifactSummary[] }>(
      session,
      `/artifacts?workspace_id=${encodeURIComponent(session.workspaceId)}`,
    );
  },
  getAppsRegistry(session: MobileSession) {
    return request<{ items?: any[] }>(session, "/apps/registry");
  },
  getInstalledApps(session: MobileSession) {
    return request<{ items?: any[] }>(session, "/apps/installed");
  },
  getStoreApps(session: MobileSession) {
    return request<{ items?: any[] }>(session, "/apps/store");
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
    return request<{ items?: any[] }>(session, "/apps/updates");
  },
  getAppManifest(session: MobileSession, appId: string) {
    return request<{ item?: any }>(session, `/apps/manifest/${encodeURIComponent(appId)}`);
  },
  installApp(session: MobileSession, appId: string, metadata?: AppInstallMetadata) {
    return request<any>(session, "/apps/install", {
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
    return request<any>(session, "/apps/uninstall", {
      method: "POST",
      body: JSON.stringify({ app_id: appId }),
    });
  },
  updateApp(session: MobileSession, appId: string, metadata?: AppInstallMetadata) {
    return request<any>(session, "/apps/update", {
      method: "POST",
      body: JSON.stringify({
        app_id: appId,
        package_id: metadata?.packageId,
        release_channel: metadata?.releaseChannel,
        install_source: metadata?.source,
      }),
    });
  },
  createRun(
    session: MobileSession,
    goal: string,
    agentRole?: string,
    options?: { appId?: string },
  ) {
    const metadata: Record<string, any> = agentRole ? { agent_role: agentRole } : {};
    if (options?.appId) {
      metadata.app_id = options.appId;
    }
    return request<{ run_id: string; status: string }>(session, "/runs/start", {
      method: "POST",
      body: JSON.stringify({
        engine: "empyralis",
        workspace_id: session.workspaceId,
        user_goal: goal,
        metadata,
      }),
    });
  },
  resolveApproval(
    session: MobileSession,
    runId: string,
    approvalId: string,
    decision: "approved" | "held" | "rejected",
  ) {
    const mapped = decision === "approved" ? "proceed" : decision === "held" ? "hold" : "reject";
    return request(session, `/runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(approvalId)}/resolve`, {
      method: "POST",
      body: JSON.stringify({ decision: mapped }),
    });
  },
};
