import type { ExpoConfig } from "expo/config";

import appJson from "./app.json";

const baseConfig = appJson.expo as ExpoConfig;
const updatesUrl = String(process.env.EXPO_PUBLIC_UPDATES_URL || "").trim();
const easProjectId = String(process.env.EXPO_PUBLIC_EAS_PROJECT_ID || process.env.EAS_PROJECT_ID || "").trim();
const deployEnv = String(
  process.env.EXPO_PUBLIC_EMPYRALIS_DEPLOY_ENV ||
    process.env.EXPO_PUBLIC_APP_ENV ||
    process.env.EAS_BUILD_PROFILE ||
    process.env.NODE_ENV ||
    "",
).trim().toLowerCase();
const cloudEnvironments = new Set(["production", "prod", "staging"]);
const loopbackHosts = new Set(["127.0.0.1", "localhost", "0.0.0.0", "::1"]);
const existingExtra = typeof baseConfig.extra === "object" && baseConfig.extra !== null
  ? baseConfig.extra
  : {};
const existingEas =
  typeof existingExtra.eas === "object" && existingExtra.eas !== null
    ? existingExtra.eas
    : {};
const runtimeUrl = String(
  process.env.EXPO_PUBLIC_RUNTIME_URL ||
    process.env.EXPO_PUBLIC_EMPYRALIST_API_URL ||
    process.env.EXPO_PUBLIC_API_URL ||
    "",
).trim();

function assertCloudRuntimeUrl(value: string) {
  if (!cloudEnvironments.has(deployEnv)) {
    return;
  }
  if (!value) {
    throw new Error("Production mobile builds require EXPO_PUBLIC_RUNTIME_URL or EXPO_PUBLIC_EMPYRALIST_API_URL.");
  }
  const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (parsed.protocol !== "https:") {
    throw new Error("Production mobile runtime URL must use HTTPS.");
  }
  if (loopbackHosts.has(parsed.hostname)) {
    throw new Error("Production mobile runtime URL cannot point at localhost.");
  }
}

assertCloudRuntimeUrl(runtimeUrl);

const config: ExpoConfig = {
  ...baseConfig,
  runtimeVersion: "0.1.0",
  updates: {
    enabled: true,
    checkAutomatically: "ON_LOAD",
    fallbackToCacheTimeout: 0,
    ...(updatesUrl ? { url: updatesUrl } : {}),
  },
  extra: {
    ...existingExtra,
    ...(runtimeUrl ? { runtimeUrl, empyralistApiUrl: runtimeUrl } : {}),
    ...(easProjectId
      ? {
          eas: {
            ...existingEas,
            projectId: easProjectId,
          },
        }
      : {}),
  },
};

export default config;
