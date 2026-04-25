import type { ExpoConfig } from "expo/config";

import appJson from "./app.json";

const baseConfig = appJson.expo as ExpoConfig;
const updatesUrl = String(process.env.EXPO_PUBLIC_UPDATES_URL || "").trim();
const easProjectId = String(process.env.EXPO_PUBLIC_EAS_PROJECT_ID || process.env.EAS_PROJECT_ID || "").trim();
const existingExtra = typeof baseConfig.extra === "object" && baseConfig.extra !== null
  ? baseConfig.extra
  : {};
const existingEas =
  typeof existingExtra.eas === "object" && existingExtra.eas !== null
    ? existingExtra.eas
    : {};

const config: ExpoConfig = {
  ...baseConfig,
  runtimeVersion: {
    policy: "appVersion",
  },
  updates: {
    enabled: true,
    checkAutomatically: "ON_LOAD",
    fallbackToCacheTimeout: 0,
    ...(updatesUrl ? { url: updatesUrl } : {}),
  },
  extra: {
    ...existingExtra,
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
