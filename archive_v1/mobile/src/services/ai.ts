import { mobileApi, type EmpyralistChatPriorMessage } from "../lib/api";
import { getSession, sessionHasRuntimeAccess } from "../lib/session";
import type { MobileSession } from "../lib/types";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

type RuntimeChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type GetAIResponseOptions = {
  session?: MobileSession | null;
  threadId?: string;
  provider?: string;
  model?: string;
  onChunk?: (delta: string) => void;
};

function toPriorMessages(history: Message[]): EmpyralistChatPriorMessage[] {
  const messages = history.slice(-20).reduce<RuntimeChatMessage[]>((acc, message) => {
    if (message.role === "user" || message.role === "assistant") {
      acc.push({
        role: message.role,
        content: message.content,
      });
    }
    return acc;
  }, []);

  return messages;
}

function buildRuntimeRequest(history: Message[]) {
  const priorMessages = toPriorMessages(history);
  const lastUserIndex = [...priorMessages].map((message) => message.role).lastIndexOf("user");
  const message =
    lastUserIndex >= 0
      ? priorMessages[lastUserIndex]?.content || ""
      : history[history.length - 1]?.content || "";
  const nextPriorMessages =
    lastUserIndex >= 0 ? priorMessages.slice(0, lastUserIndex) : priorMessages.slice(0, -1);

  return {
    message,
    priorMessages: nextPriorMessages.length > 0 ? nextPriorMessages : undefined,
  };
}

async function resolveRuntimeSession(session?: MobileSession | null): Promise<MobileSession> {
  const resolved = session ?? (await getSession());
  if (!sessionHasRuntimeAccess(resolved)) {
    throw new Error("Empyralis runtime session not configured.");
  }
  return resolved;
}

export async function getAIResponse(
  history: Message[],
  options: GetAIResponseOptions = {},
): Promise<string> {
  if (history.length === 0) {
    return "";
  }

  const session = await resolveRuntimeSession(options.session);
  const request = buildRuntimeRequest(history);
  const response = await mobileApi.respondChat(
    session,
    {
      message: request.message,
      threadId: options.threadId,
      provider: options.provider,
      model: options.model,
      priorMessages: request.priorMessages,
    },
    { onChunk: options.onChunk },
  );

  return response.error ? response.error : response.reply;
}
