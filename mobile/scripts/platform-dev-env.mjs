#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";

const mode = process.argv[2] || "go";
const forwardedArgs = process.argv.slice(3);
const root = resolve(new URL("..", import.meta.url).pathname);
const envPath = resolve(root, ".env.local");
const metroPort = "8082";

function detectLanIp() {
  const nets = networkInterfaces();
  for (const names of [["en0"], ["en1"], Object.keys(nets)]) {
    for (const name of names.flat()) {
      for (const entry of nets[name] || []) {
        if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) {
          return entry.address;
        }
      }
    }
  }
  return "127.0.0.1";
}

function readEnvFile() {
  const result = new Map();
  if (!existsSync(envPath)) return result;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) result.set(match[1], match[2]);
  }
  return result;
}

function writeEnvFile() {
  const ip = detectLanIp();
  const env = readEnvFile();
  env.set("EXPO_PUBLIC_RUNTIME_URL", `http://${ip}:8001`);
  env.set("EXPO_PUBLIC_EMPYRALIST_API_URL", `http://${ip}:8001`);
  env.set("EXPO_PUBLIC_PLATFORM_URL", `http://${ip}:3000`);
  env.set("EXPO_PUBLIC_WORKSPACE_ID", env.get("EXPO_PUBLIC_WORKSPACE_ID") || "ws-1");
  const keys = [
    "EXPO_PUBLIC_RUNTIME_URL",
    "EXPO_PUBLIC_EMPYRALIST_API_URL",
    "EXPO_PUBLIC_PLATFORM_URL",
    "EXPO_PUBLIC_WORKSPACE_ID",
  ];
  for (const key of [...env.keys()].sort()) {
    if (!keys.includes(key)) keys.push(key);
  }
  writeFileSync(envPath, `${keys.map((key) => `${key}=${env.get(key) || ""}`).join("\n")}\n`);
  console.log(`Updated .env.local for LAN IP ${ip}`);
}

function killMetroPort() {
  let output = "";
  try {
    output = execFileSync("lsof", ["-ti", `tcp:${metroPort}`], { encoding: "utf8" }).trim();
  } catch {
    return;
  }
  const pids = output.split(/\s+/).filter(Boolean);
  for (const pid of pids) {
    try {
      process.kill(Number(pid), "SIGTERM");
      console.log(`Stopped existing process on port ${metroPort}: ${pid}`);
    } catch {
      // Ignore stale process ids.
    }
  }
}

function run(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: "inherit" });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
}

writeEnvFile();

if (mode === "go") {
  killMetroPort();
  run("npx", ["expo", "start", "--host", "lan", "--port", metroPort, ...forwardedArgs]);
} else if (mode === "dev") {
  killMetroPort();
  run("npx", ["expo", "start", "--dev-client", "--host", "lan", "--port", metroPort, ...forwardedArgs]);
} else if (mode === "ios") {
  run("npx", ["expo", "run:ios", "--port", metroPort, ...forwardedArgs]);
} else {
  console.error(`Unknown mode: ${mode}. Use go, dev, or ios.`);
  process.exit(1);
}
