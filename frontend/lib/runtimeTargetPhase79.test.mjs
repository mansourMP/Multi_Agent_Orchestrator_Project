import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const apiSource = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../app/(shell)/page.tsx", import.meta.url), "utf8");

test("frontend master context parser preserves runtime target projection", () => {
  assert.match(apiSource, /runtime_targets/);
  assert.match(apiSource, /default_target_id/);
  assert.match(apiSource, /routing_contract/);
});

test("web shell runtime topology copy reflects cloud-first runtime target model", () => {
  assert.match(shellSource, /Default target/);
  assert.match(shellSource, /Workspace targets/);
  assert.match(shellSource, /Mobile enters through the platform first/);
});
