import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const mobileRoot = "/Users/mansur/Multi_Agent_Orchestrator_Project/mobile";
const sessionContextSource = fs.readFileSync(path.join(mobileRoot, "src/lib/session-context.tsx"), "utf8");
const sessionSource = fs.readFileSync(path.join(mobileRoot, "src/lib/session.ts"), "utf8");
const sessionScreenSource = fs.readFileSync(path.join(mobileRoot, "app/session.tsx"), "utf8");
const apiSource = fs.readFileSync(path.join(mobileRoot, "src/lib/api.ts"), "utf8");

test("mobile session layer includes refresh-based persistence instead of recurring pairing", () => {
  assert.match(sessionSource, /sessionNeedsPlatformRefresh/);
  assert.match(sessionContextSource, /async \(options\?: \{ force\?: boolean \}\)/);
  assert.match(sessionContextSource, /refreshAccountSession/);
  assert.match(sessionContextSource, /needsReauth: true/);
});

test("mobile session screen exposes trusted device management and recovery messaging", () => {
  assert.match(sessionScreenSource, /Session recovery required/);
  assert.match(sessionScreenSource, /Trusted devices/);
  assert.match(sessionScreenSource, /Revoke/);
  assert.match(sessionScreenSource, /Re-pairing is not required/);
});

test("mobile auth api exposes refresh and trusted-device routes", () => {
  assert.match(apiSource, /async refreshAccountSession/);
  assert.match(apiSource, /async listTrustedDevices/);
  assert.match(apiSource, /async revokeTrustedDevice/);
  assert.match(apiSource, /\/auth\/refresh/);
  assert.match(apiSource, /\/auth\/devices/);
});
