import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = "/Users/mansur/Multi_Agent_Orchestrator_Project";

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("mobile chat-context parser includes workspace runtime targets", () => {
  const source = read("mobile/src/lib/mobile-data.ts");
  assert.match(source, /runtimeTargets/);
  assert.match(source, /normalizeRuntimeTargets/);
  assert.match(source, /defaultTargetId/);
  assert.match(source, /routingContract/);
});

test("status surface explains cloud-first runtime targets", () => {
  const source = read("mobile/app/status.tsx");
  assert.match(source, /Default target/);
  assert.match(source, /Available targets/);
  assert.match(source, /Mobile enters through the platform first/);
  assert.match(source, /Cloud Default/);
});

test("advanced mobile session copy keeps local and self-host paths secondary to account-first cloud access", () => {
  const source = read("mobile/app/session.tsx");
  assert.match(source, /phone enters through the cloud platform first/i);
  assert.match(source, /local companion or self-host runtime/i);
  assert.match(source, /does not replace the workspace account model/i);
});
