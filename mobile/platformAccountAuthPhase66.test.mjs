import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const mobileRoot = "/Users/mansur/Multi_Agent_Orchestrator_Project/mobile";
const sessionScreenSource = fs.readFileSync(path.join(mobileRoot, "app/session.tsx"), "utf8");
const apiSource = fs.readFileSync(path.join(mobileRoot, "src/lib/api.ts"), "utf8");
const sessionSource = fs.readFileSync(path.join(mobileRoot, "src/lib/session.ts"), "utf8");

test("mobile session screen makes platform account sign-in the primary path", () => {
  assert.match(sessionScreenSource, /Platform account sign-in is the primary path/);
  assert.match(sessionScreenSource, /Local runtime pairing/);
  assert.match(sessionScreenSource, /Runtime-key fallback/);
});

test("mobile runtime api exposes account-first login and register helpers", () => {
  assert.match(apiSource, /async loginAccount\(/);
  assert.match(apiSource, /async registerAccount\(/);
  assert.match(apiSource, /channel: "mobile"/);
});

test("mobile session persistence distinguishes platform account auth from runtime-key fallback", () => {
  assert.match(sessionSource, /authMode: authToken \? "platform_account" : "runtime_key"/);
  assert.match(sessionSource, /return \{ Authorization: `Bearer \$\{authToken\}` \};/);
  assert.match(sessionSource, /"X-API-Key": runtimeKey/);
});
