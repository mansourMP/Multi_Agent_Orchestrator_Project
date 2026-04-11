import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const mobileRoot = "/Users/mansur/Multi_Agent_Orchestrator_Project/mobile";
const appJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, "app.json"), "utf8"));
const apiSource = fs.readFileSync(path.join(mobileRoot, "src/lib/api.ts"), "utf8");
const sessionSource = fs.readFileSync(path.join(mobileRoot, "app/session.tsx"), "utf8");

test("app config no longer hardcodes a loopback runtime URL", () => {
  assert.equal(appJson.expo?.extra?.runtimeUrl, undefined);
});

test("native runtime defaults prefer explicit config or Expo host derivation over loopback", () => {
  assert.match(apiSource, /Constants\.expoConfig\?\.hostUri/);
  assert.match(apiSource, /Platform\.OS === "web"/);
  assert.match(apiSource, /return "http:\/\/127\.0\.0\.1:8001";/);
});

test("session copy makes pairing primary and manual LAN entry fallback", () => {
  assert.match(sessionSource, /Desktop pairing is the primary path/);
  assert.match(sessionSource, /Manual LAN URL entry is the fallback/);
  assert.match(sessionSource, /Filled by pairing or enter http:\/\/192\.168\.x\.x:8001/);
});
