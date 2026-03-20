import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";
import { useSessionState } from "@/src/lib/session-context";
import { mobileApi } from "@/src/lib/api";
import { useTransientBanner } from "@/src/lib/useTransientBanner";
import { useAppContextStore } from "@/src/stores/appContextStore";
import { getCatalogApp } from "@/src/lib/appCatalog";
import { BrandedAppIcon } from "@/src/components/apps/BrandedAppIcon";
import { getPreviewAppRecord, mergeAppRecords, normalizeAppRecord } from "@/src/lib/appRegistry";
import type { AppRecord } from "@/src/lib/types";

export default function AppDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const { session } = useSessionState();
  const { banner, showBanner } = useTransientBanner();
  const { activeApp, clearActiveApp } = useAppContextStore();
  const [app, setApp] = React.useState<AppRecord | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    if (!params.id) return;

    setLoading(true);
    try {
      const coreReady = Boolean(session?.runtimeUrl && session?.runtimeKey);
      const platformReady = Boolean(session?.platformUrl);
      const appId = String(params.id);

      const [coreManifest, platformManifest] = await Promise.all([
        coreReady ? mobileApi.getAppManifest(session!, appId).catch(() => ({ item: null })) : Promise.resolve({ item: null }),
        platformReady ? mobileApi.getPlatformAppManifest(session!, appId).catch(() => ({ item: null })) : Promise.resolve({ item: null }),
      ]);

      const normalizedCore = normalizeAppRecord(coreManifest.item, "core");
      const normalizedPlatform = normalizeAppRecord(platformManifest.item, "platform");
      const preview = getPreviewAppRecord(appId);

      setApp(mergeAppRecords(normalizedCore, normalizedPlatform, preview));
    } finally {
      setLoading(false);
    }
  }, [session, params.id]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top + 12, paddingHorizontal: 16 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, justifyContent: "center" }}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={{ color: theme.colors.textSecondary, marginTop: 16 }}>Loading app...</Text>
      </View>
    );
  }

  if (!app) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top + 12, paddingHorizontal: 16 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, justifyContent: "center" }}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={{ color: theme.colors.textSecondary, marginTop: 16 }}>App not found.</Text>
      </View>
    );
  }

  const coreReady = Boolean(session?.runtimeUrl && session?.runtimeKey);
  const needsUpdate = Boolean(app.latestVersion && app.latestVersion !== app.version);
  const status = String(app.status || "available").toLowerCase();
  const iconName = getCatalogApp(app.id)?.icon || app.icon || "apps";
  const canInstallFromManifest = app.source !== "preview";

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top + 12, paddingHorizontal: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, justifyContent: "center" }}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontFamily: "Fraunces_700Bold", color: theme.colors.text }}>{app.name}</Text>
      </View>

      {banner ? (
        <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 8 }}>{banner.message}</Text>
      ) : null}

      <View style={{ marginTop: 16, gap: 10 }}>
        <View style={{ alignItems: "center", marginBottom: 8 }}>
          <BrandedAppIcon appId={app.id} icon={iconName} size={88} />
        </View>
        <Text style={{ fontSize: 22, fontFamily: "Fraunces_700Bold", color: theme.colors.text, textAlign: "center" }}>
          {app.name}
        </Text>
        <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>{app.description}</Text>
        <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
          Status: {status === "installed" ? "Installed" : "Available"}
        </Text>
        <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
          Source: {app.source === "preview" ? "Preview catalog" : status === "installed" ? "Personal core" : "Platform registry"}
        </Text>
        <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>Version: {app.version}</Text>
        <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
          Category: {String(app.category || "App")}
        </Text>
        <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
          Publisher: {String(app.publisher || "unknown")}
        </Text>
        {app.packageId ? (
          <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
            Package: {app.packageId}
          </Text>
        ) : null}
        {app.releaseChannel ? (
          <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
            Channel: {app.releaseChannel}
          </Text>
        ) : null}
        {Array.isArray(app.permissions) && app.permissions.length ? (
          <View style={{ marginTop: 4 }}>
            <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 6 }}>Permissions</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {app.permissions.map((perm: string) => (
                <View
                  key={perm}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                  }}
                >
                  <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>{perm}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        {needsUpdate ? (
          <View
            style={{
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            }}
          >
            <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
              Update required: {app.version} → {app.latestVersion}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ marginTop: 20, gap: 10 }}>
        {status !== "installed" ? (
          <TouchableOpacity
            style={{
              height: 44,
              borderRadius: 12,
              backgroundColor: coreReady ? theme.colors.accent : theme.colors.cardHover,
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={async () => {
              if (!canInstallFromManifest) {
                showBanner("Preview apps are browse-only. Connect a platform registry to install.", "neutral");
                router.push("/session");
                return;
              }
              if (!session?.runtimeUrl || !session?.runtimeKey) {
                showBanner("Connect your Mac Mini to install apps.", "neutral");
                router.push("/session");
                return;
              }
              await mobileApi.installApp(session, app.id, {
                packageId: app.packageId,
                releaseChannel: app.releaseChannel,
                source: app.source,
              });
              showBanner("Installed.", "success");
              await refresh();
            }}
          >
            <Text style={{ color: coreReady ? "#fff" : theme.colors.textSecondary, fontWeight: "700" }}>
              {!canInstallFromManifest ? "Connect platform to install" : coreReady ? "Install" : "Connect Mac Mini to install"}
            </Text>
          </TouchableOpacity>
        ) : needsUpdate ? (
          <TouchableOpacity
            style={{
              height: 44,
              borderRadius: 12,
              backgroundColor: theme.colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={async () => {
              if (!session?.runtimeUrl || !session?.runtimeKey) return;
              await mobileApi.updateApp(session, app.id, {
                packageId: app.packageId,
                releaseChannel: app.releaseChannel,
                source: app.source,
              });
              showBanner("Updated. You can open now.", "success");
              await refresh();
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Update</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={{
              height: 44,
              borderRadius: 12,
              backgroundColor: theme.colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={() => router.push(`/apps/${app.id}/home`)}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Open app</Text>
          </TouchableOpacity>
        )}
        {status === "installed" ? (
          <TouchableOpacity
            style={{
              height: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={async () => {
              if (!session?.runtimeUrl || !session?.runtimeKey) return;
              await mobileApi.uninstallApp(session, app.id);
              showBanner("Uninstalled.", "success");
              if (activeApp?.id === app.id) {
                clearActiveApp();
              }
              router.back();
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "600" }}>Uninstall</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}
