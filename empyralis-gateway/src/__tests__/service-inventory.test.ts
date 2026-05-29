import test from "node:test";
import assert from "node:assert/strict";

import { collectPassiveInventorySnapshot } from "../health/service-inventory";

test("passive service inventory detects services without enabling execution", async () => {
  const snapshot = await collectPassiveInventorySnapshot({
    requestedCapabilities: ["shell.execute", "screenshot.capture"],
    deps: {
      platform: "linux",
      arch: "x64",
      release: "6.0-test",
      hostname: "agent-box",
      now: () => new Date("2026-05-29T00:00:00Z"),
      commandExists: (command) => {
        if (command === "pg_isready") return "/usr/bin/pg_isready";
        if (command === "docker") return "/usr/bin/docker";
        return null;
      },
      runCommand: async (command) => {
        if (command.endsWith("pg_isready")) return { exitCode: 0, stdout: "", stderr: "" };
        if (command.endsWith("docker")) return { exitCode: 1, stdout: "", stderr: "daemon unavailable" };
        return { exitCode: 1, stdout: "", stderr: "unexpected" };
      },
      httpGetJson: async () => ({ ok: true, status: 200, body: { models: [{ name: "llama" }] } }),
    },
  });

  const byId = Object.fromEntries(snapshot.service_inventory.map((item) => [item.id, item]));
  assert.equal(snapshot.native_runtime.desktop_session, "user_session");
  assert.equal(snapshot.native_runtime.system_service_mode, false);
  assert.equal(byId.postgres.status, "ready");
  assert.equal(byId.docker.status, "offline");
  assert.equal(byId.ollama.status, "ready");
  assert.equal(byId.codex_cli.status, "missing");
  assert.equal(byId.gpu.status, "unknown");
  for (const item of snapshot.service_inventory) {
    assert.equal(item.passive, true);
    assert.equal(item.execution_enabled, false);
  }
  assert.deepEqual(snapshot.capability_readiness.requested, ["shell.execute", "screenshot.capture"]);
  assert.deepEqual(snapshot.capability_readiness.ready, ["shell.execute", "screenshot.capture"]);
  assert.equal(snapshot.capability_readiness.service_statuses.postgres, "ready");
});
