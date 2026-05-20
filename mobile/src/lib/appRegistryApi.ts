import type { MobileSession } from "./types";
import { buildSessionAuthHeaders, normalizeServerUrl } from "./api";

type AppInstallMetadata = {
  packageId?: string;
  releaseChannel?: string;
  source?: "core" | "platform" | "preview";
};

type MiniAppInvokeRequest = {
  input: string;
  provider?: string;
  model?: string;
};

export type MiniAppContract = {
  app_id: string;
  label?: string | null;
  description?: string | null;
  delivery_mode?: "structured" | "hosted" | string;
  visibility?: "workspace_private" | "unlisted_link" | string;
  install_status?: "installed" | "pending" | "removed" | string;
  memory_scope?: string | null;
  permissions?: string[];
  hosted_url?: string | null;
  hosted_app?: {
    hosted_url?: string | null;
    allowed_origins?: string[];
  } | null;
  public_distribution?: {
    mode?: string;
    install_path?: string;
    preview_path?: string;
    requires_permission_review?: boolean;
  } | null;
  updated_at?: string | null;
};

export type MiniAppShareLink = {
  workspace_id: string;
  app_id: string;
  visibility: "unlisted_link" | string;
  token: string;
  expires_at: number;
  preview_path: string;
  install_path: string;
};

export type MiniAppSharePreview = {
  source_workspace_id: string;
  share: {
    mode: "unlisted_link" | string;
    expires_at: number;
  };
  app: MiniAppContract & {
    allowed_origins?: string[];
    hosted_url?: string | null;
    expires_at?: number | null;
  };
};

type RegisterMiniAppRequest = {
  label: string;
  description?: string;
  hosted_url: string;
  allowed_origins?: string[];
  permissions?: string[];
  bridge_contracts?: Record<string, string[]>;
  visibility?: "workspace_private" | "unlisted_link";
};

type CalorieEventRequest = {
  meal_label?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  notes?: string;
};

type CalorieGoalsRequest = {
  calorie_goal?: number | null;
  protein_goal_g?: number | null;
  carbs_goal_g?: number | null;
  fat_goal_g?: number | null;
};

type FlashcardCreateRequest = {
  deck: string;
  topic?: string;
  front: string;
  back: string;
  difficulty?: string;
};

type FlashcardDeckRequest = {
  deck: string;
  topic_focus?: string;
  language?: string;
  target_new_per_day?: number | null;
  target_reviews_per_day?: number | null;
};

type FlashcardReviewRequest = {
  card_id?: string;
  deck: string;
  topic?: string;
  correct?: boolean;
  quality?: number;
  response_ms?: number;
};

type FlashcardGenerateRequest = {
  deck: string;
  source_text: string;
  topic?: string;
  language?: string;
  count?: number;
  provider?: string;
  model?: string;
};

function formatNetworkError(baseUrl: string) {
  const normalized = normalizeServerUrl(baseUrl);
  const target = normalized || "the configured server";
  return `Network request failed for ${target}.`;
}

async function parseApiError(response: Response, fallback: string) {
  const retryAfter = String(response.headers.get("Retry-After") || "").trim();
  const suffix = retryAfter ? ` Try again in ${retryAfter}s.` : "";
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => null) as
      | { detail?: unknown; error?: unknown; message?: unknown }
      | null;
    const detail =
      (typeof payload?.detail === "string" && payload.detail.trim()) ||
      (typeof payload?.error === "string" && payload.error.trim()) ||
      (typeof payload?.message === "string" && payload.message.trim()) ||
      "";
    if (detail) {
      return `${detail}${suffix}`;
    }
  } else {
    const text = (await response.text().catch(() => "")).trim();
    if (text) {
      return `${text}${suffix}`;
    }
  }

  if (response.status === 401 || response.status === 403) {
    return `This app is not authorized for this session.${suffix}`;
  }
  if (response.status === 404) {
    return `This app route is not available right now.${suffix}`;
  }
  if (response.status === 429) {
    return `This app is busy right now.${suffix}`;
  }
  if (response.status >= 500) {
    return `This app service is unavailable right now.${suffix}`;
  }

  return `${fallback}${suffix}`;
}

async function requestRuntime<T>(session: MobileSession, path: string, init?: RequestInit): Promise<T> {
  const baseUrl = normalizeServerUrl(session.runtimeUrl);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(buildSessionAuthHeaders(session) || {}),
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    throw new Error(error instanceof TypeError ? formatNetworkError(baseUrl) : "Request failed.");
  }

  if (!response.ok) {
    throw new Error(await parseApiError(response, `This app request failed (${response.status}).`));
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
    throw new Error(await parseApiError(response, `This app request failed (${response.status}).`));
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
  listMiniApps(session: MobileSession) {
    const workspaceId = String(session.workspaceId || "").trim();
    if (!workspaceId) {
      throw new Error("Mini apps are not ready for this session yet.");
    }
    return requestRuntime<{ items?: MiniAppContract[] }>(
      session,
      `/api/workspaces/${encodeURIComponent(workspaceId)}/mini-apps`,
    );
  },
  getMiniAppContract(session: MobileSession, appId: string) {
    const workspaceId = String(session.workspaceId || "").trim();
    if (!workspaceId) {
      throw new Error("Mini apps are not ready for this session yet.");
    }
    return requestRuntime<MiniAppContract>(
      session,
      `/api/workspaces/${encodeURIComponent(workspaceId)}/mini-apps/${encodeURIComponent(appId)}`,
    );
  },
  registerMiniAppContract(session: MobileSession, appId: string, body: RegisterMiniAppRequest) {
    const workspaceId = String(session.workspaceId || "").trim();
    if (!workspaceId) {
      throw new Error("Mini apps are not ready for this session yet.");
    }
    return requestRuntime<MiniAppContract>(
      session,
      `/api/workspaces/${encodeURIComponent(workspaceId)}/mini-apps/${encodeURIComponent(appId)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          label: body.label,
          description: body.description,
          delivery_mode: "hosted",
          hosted_url: body.hosted_url,
          embed_kind: "webview",
          allowed_origins: body.allowed_origins,
          permissions: body.permissions || [],
          bridge_contracts: body.bridge_contracts || {},
          visibility: body.visibility || "workspace_private",
          install_status: "installed",
        }),
      },
    );
  },
  generateMiniAppShareLink(session: MobileSession, appId: string) {
    const workspaceId = String(session.workspaceId || "").trim();
    if (!workspaceId) {
      throw new Error("Mini apps are not ready for this session yet.");
    }
    return requestRuntime<MiniAppShareLink>(
      session,
      `/api/workspaces/${encodeURIComponent(workspaceId)}/mini-apps/${encodeURIComponent(appId)}/share-link`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
  },
  previewSharedMiniApp(session: MobileSession, token: string) {
    return requestRuntime<MiniAppSharePreview>(
      session,
      `/api/mini-apps/share/${encodeURIComponent(token)}`,
    );
  },
  installSharedMiniApp(session: MobileSession, token: string) {
    const workspaceId = String(session.workspaceId || "").trim();
    if (!workspaceId) {
      throw new Error("Mini apps are not ready for this session yet.");
    }
    return requestRuntime<MiniAppContract>(
      session,
      `/api/workspaces/${encodeURIComponent(workspaceId)}/mini-apps/install-shared`,
      {
        method: "POST",
        body: JSON.stringify({ token }),
      },
    );
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
  invokeMiniApp(session: MobileSession, appId: string, body: MiniAppInvokeRequest) {
    const workspaceId = String(session.workspaceId || "").trim();
    if (!workspaceId) {
      throw new Error("Mini apps are not ready for this session yet.");
    }
    return requestRuntime<{
      app_id: string;
      mode: "invoke";
      memory_scope: "none";
      reply: string;
      provider?: string | null;
      model?: string | null;
      attempted_providers?: string[];
      usage?: Record<string, any> | null;
    }>(session, `/api/workspaces/${encodeURIComponent(workspaceId)}/mini-apps/${encodeURIComponent(appId)}/invoke`, {
      method: "POST",
      body: JSON.stringify({
        input: body.input,
        provider: body.provider,
        model: body.model,
      }),
    });
  },
  getCalorieOverview(session: MobileSession, date?: string) {
    const workspaceId = String(session.workspaceId || "").trim();
    if (!workspaceId) {
      throw new Error("Calories is not ready for this session yet.");
    }
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    return requestRuntime<{
      daily_summary?: {
        date?: string;
        totals?: {
          calories?: number;
          protein_g?: number;
          carbs_g?: number;
          fat_g?: number;
        };
      };
      goals?: {
        calories?: number | null;
        protein_g?: number | null;
        carbs_g?: number | null;
        fat_g?: number | null;
      };
      records?: Record<string, any>[];
    }>(session, `/api/workspaces/${encodeURIComponent(workspaceId)}/mini-apps/calorie_tracking/overview${query}`);
  },
  logCalorieEvent(session: MobileSession, body: CalorieEventRequest) {
    const workspaceId = String(session.workspaceId || "").trim();
    if (!workspaceId) {
      throw new Error("Calories is not ready for this session yet.");
    }
    return requestRuntime<Record<string, any>>(
      session,
      `/api/workspaces/${encodeURIComponent(workspaceId)}/mini-apps/calorie_tracking/events`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },
  updateCalorieGoals(session: MobileSession, body: CalorieGoalsRequest) {
    const workspaceId = String(session.workspaceId || "").trim();
    if (!workspaceId) {
      throw new Error("Calories is not ready for this session yet.");
    }
    return requestRuntime<Record<string, any>>(
      session,
      `/api/workspaces/${encodeURIComponent(workspaceId)}/mini-apps/calorie_tracking/goals`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    );
  },
  getFlashcardsOverview(session: MobileSession, date?: string) {
    const workspaceId = String(session.workspaceId || "").trim();
    if (!workspaceId) {
      throw new Error("Flashcards is not ready for this session yet.");
    }
    const query = date ? `?date=${encodeURIComponent(date)}` : "";
    return requestRuntime<Record<string, any>>(
      session,
      `/api/workspaces/${encodeURIComponent(workspaceId)}/mini-apps/flashcards/overview${query}`,
    );
  },
  createFlashcard(session: MobileSession, body: FlashcardCreateRequest) {
    const workspaceId = String(session.workspaceId || "").trim();
    if (!workspaceId) {
      throw new Error("Flashcards is not ready for this session yet.");
    }
    return requestRuntime<Record<string, any>>(
      session,
      `/api/workspaces/${encodeURIComponent(workspaceId)}/mini-apps/flashcards/cards`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },
  updateFlashcardDeck(session: MobileSession, body: FlashcardDeckRequest) {
    const workspaceId = String(session.workspaceId || "").trim();
    if (!workspaceId) {
      throw new Error("Flashcards is not ready for this session yet.");
    }
    return requestRuntime<Record<string, any>>(
      session,
      `/api/workspaces/${encodeURIComponent(workspaceId)}/mini-apps/flashcards/decks`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    );
  },
  logFlashcardReview(session: MobileSession, body: FlashcardReviewRequest) {
    const workspaceId = String(session.workspaceId || "").trim();
    if (!workspaceId) {
      throw new Error("Flashcards is not ready for this session yet.");
    }
    return requestRuntime<Record<string, any>>(
      session,
      `/api/workspaces/${encodeURIComponent(workspaceId)}/mini-apps/flashcards/reviews`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },
  retrieveFlashcardRecords(session: MobileSession, body: Record<string, any>) {
    const workspaceId = String(session.workspaceId || "").trim();
    if (!workspaceId) {
      throw new Error("Flashcards is not ready for this session yet.");
    }
    return requestRuntime<Record<string, any>>(
      session,
      `/api/workspaces/${encodeURIComponent(workspaceId)}/mini-apps/flashcards/records`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },
  generateFlashcards(session: MobileSession, body: FlashcardGenerateRequest) {
    const workspaceId = String(session.workspaceId || "").trim();
    if (!workspaceId) {
      throw new Error("Flashcards is not ready for this session yet.");
    }
    return requestRuntime<Record<string, any>>(
      session,
      `/api/workspaces/${encodeURIComponent(workspaceId)}/mini-apps/flashcards/generate`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },
};
