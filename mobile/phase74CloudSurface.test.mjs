import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = "/Users/mansur/Multi_Agent_Orchestrator_Project";

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("session screen keeps local runtime controls behind advanced settings", () => {
  const source = read("mobile/app/session.tsx");
  assert.match(source, /Advanced local runtime and developer settings/);
  assert.match(source, /Show advanced settings/);
  assert.doesNotMatch(source, /label="Runtime URL"[\s\S]{0,600}title="Platform account"/);
});

test("chat store and composer preserve drafts for mobile threads", () => {
  const storeSource = read("mobile/src/stores/chatStore.ts");
  const chatSource = read("mobile/src/screens/ChatScreen.tsx");
  const inputBarSource = read("mobile/src/components/InputBar.tsx");

  assert.match(storeSource, /draft\?: string/);
  assert.match(storeSource, /setSessionDraft/);
  assert.match(chatSource, /const draft = activeSession\?\.draft \|\| ""/);
  assert.match(chatSource, /onChangeText=\{\(next\) => setSessionDraft\(sessionId, next\)\}/);
  assert.match(inputBarSource, /value\?: string/);
  assert.match(inputBarSource, /onChangeText\?: \(value: string\) => void/);
});

test("mobile data hooks cache last synced backend state and expose degraded messaging", () => {
  const source = read("mobile/src/lib/mobile-data.ts");
  assert.match(source, /SURFACE_CACHE_PREFIX/);
  assert.match(source, /buildDegradedMessage/);
  assert.match(source, /usePersistedMobileQuery/);
  assert.match(source, /statusMessage: degraded \? buildDegradedMessage/);
});
