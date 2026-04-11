import {
  getDefaultRuntimeUrl,
  getDefaultWorkspaceId,
  mobileApi,
  type EmpyralistChatAction,
  type EmpyralistChatPriorMessage,
  type EmpyralistDirectChatResponse,
} from "../lib/api";
import { sessionHasRuntimeAccess } from "../lib/session";
import type { MobileSession } from "../lib/types";

export type ServerBridgeResponse = {
  intent: "chat" | "run" | "approval_required" | "error" | "offline";
  speech: string;
  ui?: {
    actions?: EmpyralistChatAction[];
    mode?: string;
    context_used?: Record<string, unknown> | null;
  };
  error?: string;
};

export type ServerBridgeOptions = {
  session?: Partial<MobileSession> | null;
  threadId?: string;
  provider?: string;
  model?: string;
  priorMessages?: EmpyralistChatPriorMessage[];
  approvedAction?: {
    connector: string;
    action: string;
    input: string;
  };
  onChunk?: (delta: string) => void;
};

function buildSharedRuntimeSession(session?: Partial<MobileSession> | null): MobileSession | null {
  if (!sessionHasRuntimeAccess(session)) {
    return null;
  }

  return {
    runtimeUrl: session?.runtimeUrl?.trim() || getDefaultRuntimeUrl(),
    runtimeKey: session?.runtimeKey?.trim() || "",
    workspaceId: session?.workspaceId?.trim() || getDefaultWorkspaceId(),
    authMode: session?.authMode,
    authToken: session?.authToken?.trim() || undefined,
    user: session?.user,
    workspaceAccess: session?.workspaceAccess,
    tenantAccess: session?.tenantAccess,
    authSession: session?.authSession,
    deviceLink: session?.deviceLink,
    identityBoundary: session?.identityBoundary,
    enterpriseSecurity: session?.enterpriseSecurity,
    platformUrl: session?.platformUrl?.trim() || undefined,
    platformKey: session?.platformKey?.trim() || undefined,
    pairingMethod: session?.pairingMethod,
    pairedAt: session?.pairedAt,
    pairingId: session?.pairingId,
    pairingExpiresAt: session?.pairingExpiresAt,
    pairingLabel: session?.pairingLabel,
    deviceId: session?.deviceId,
    sessionLinkedAt: session?.sessionLinkedAt,
  };
}

function toBridgeResponse(payload: EmpyralistDirectChatResponse): ServerBridgeResponse {
  const intent = payload.error
    ? "error"
    : payload.actions.some((action) => action.kind === "approval_required")
      ? "approval_required"
      : payload.actions.some((action) => action.kind === "run" || action.kind === "workflow")
        ? "run"
        : "chat";

  return {
    intent,
    speech: payload.error ? payload.error : payload.reply,
    ui: {
      actions: payload.actions,
      mode: payload.mode,
      context_used: payload.context_used,
    },
    error: payload.error,
  };
}

function toOfflineResponse(message?: string): ServerBridgeResponse {
  return {
    intent: "offline",
    speech: "",
    ...(message ? { error: message } : {}),
  };
}

// Compatibility export kept for older mobile callers. Context now belongs to the shared runtime.
export async function getLocalVectorDBContext(_userInput: string) {
  return { context: null, source: "runtime" as const };
}

export async function handleRequest(
  userInput: string,
  options: ServerBridgeOptions = {},
): Promise<ServerBridgeResponse> {
  const session = buildSharedRuntimeSession(options.session);
  if (!session) {
    return toOfflineResponse("Runtime session not configured");
  }

  try {
    const payload = await mobileApi.respondChat(
      session,
      {
        message: userInput,
        threadId: options.threadId,
        provider: options.provider,
        model: options.model,
        priorMessages: options.priorMessages,
        approvedAction: options.approvedAction,
      },
      { onChunk: options.onChunk },
    );

    return toBridgeResponse(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    if (/network request failed/i.test(message)) {
      return toOfflineResponse(message);
    }
    return {
      intent: "error",
      speech: message,
      error: message,
    };
  }
}
