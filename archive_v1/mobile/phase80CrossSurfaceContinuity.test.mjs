import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = "/Users/mansur/Multi_Agent_Orchestrator_Project";

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("web and mobile both use the shared backend thread contract", () => {
  const webSource = read("frontend/app/api/turn/route.ts");
  const webChatSource = read("frontend/app/(shell)/page.api.ts");
  const webPageSource = read("frontend/app/(shell)/page.tsx");
  const mobileApiSource = read("mobile/src/lib/api.ts");
  const chatSource = read("mobile/src/screens/ChatScreen.tsx");

  assert.ok(!webSource.includes("threadId = String(context.thread_id || '').trim();"));
  assert.ok(!webSource.includes("...(threadId ? { thread_id: threadId } : {}),"));
  assert.ok(webChatSource.includes("const clientSessionKey = String(options?.clientSessionKey || options?.threadId || '').trim()"));
  assert.ok(!webChatSource.includes("thread_id: clientSessionKey,"));
  assert.ok(webPageSource.includes("clientSessionKey: sessionId,"));
  assert.ok(mobileApiSource.includes("clientSessionId?: string;"));
  assert.ok(mobileApiSource.includes("client_session_id: payload.clientSessionId || undefined,"));
  assert.ok(chatSource.includes("const outboundThreadId = useMemo(() => {"));
  assert.ok(!chatSource.includes("const resolveTurnThreadId = async (runtimeSession: MobileSession) => {"));
  assert.ok(!chatSource.includes("Empyralis could not sync the shared workspace thread yet. Pull to refresh and try again."));
  assert.ok(chatSource.includes("clientSessionId: activeSession.id,"));
  assert.ok(chatSource.includes("threadId: activeAgent.id === sage.id ? undefined : outboundThreadId,"));
});

test("mobile persists backend thread identity and hydrates shared backend history", () => {
  const storeSource = read("mobile/src/stores/chatStore.ts");
  const dataSource = read("mobile/src/lib/mobile-data.ts");
  const chatSource = read("mobile/src/screens/ChatScreen.tsx");

  assert.ok(storeSource.includes("backendThreadId?: string;"));
  assert.ok(storeSource.includes("setSessionBackendThreadId: (id: string, backendThreadId: string) => void;"));
  assert.ok(dataSource.includes("thread: {"));
  assert.ok(dataSource.includes("const threadTurns = Array.isArray(threadRecord.turns) ? threadRecord.turns : [];"));
  assert.ok(chatSource.includes("normalizeBackendThreadMessages"));
  assert.ok(chatSource.includes("replaceSessionMessages(activeSession.id, messagesFromBackend, {"));
  assert.ok(chatSource.includes("setSessionBackendThreadId(sessionId, responseThreadId);"));
});
