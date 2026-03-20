import React from "react";
import { ActivityIndicator, Dimensions, Pressable, Text, TouchableOpacity, View } from "react-native";
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

export default function AppHomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const { session } = useSessionState();
  const { banner, showBanner } = useTransientBanner();
  const { setActiveApp, clearActiveApp } = useAppContextStore();
  const [app, setApp] = React.useState<AppRecord | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    if (!params.id) return;
    try {
      setLoading(true);
      const coreReady = Boolean(session?.runtimeUrl && session?.runtimeKey);
      const platformReady = Boolean(session?.platformUrl);
      const appId = String(params.id);
      const [coreManifest, platformManifest] = await Promise.all([
        coreReady ? mobileApi.getAppManifest(session!, appId).catch(() => ({ item: null })) : Promise.resolve({ item: null }),
        platformReady ? mobileApi.getPlatformAppManifest(session!, appId).catch(() => ({ item: null })) : Promise.resolve({ item: null }),
      ]);
      const item = mergeAppRecords(
        normalizeAppRecord(coreManifest.item, "core"),
        normalizeAppRecord(platformManifest.item, "platform"),
        getPreviewAppRecord(appId),
      );
      setApp(item);
      if (item && item.status === "installed" && !(item.latestVersion && item.latestVersion !== item.version)) {
        setActiveApp({ id: item.id, name: item.name });
      }
    } finally {
      setLoading(false);
    }
  }, [session, params.id, setActiveApp]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const windowHeight = Dimensions.get("window").height;
  const headerGap = insets.top + 92;
  const sheetHeight = Math.max(280, windowHeight - headerGap);

  if (!session?.runtimeUrl || !session?.runtimeKey) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top + 12, paddingHorizontal: 16 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, justifyContent: "center" }}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={{ color: theme.colors.textSecondary, marginTop: 16 }}>Connect your Mac Mini to open apps.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top + 12, paddingHorizontal: 16 }}>
        <ActivityIndicator color={theme.colors.accent} />
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

  const needsUpdate = Boolean(app.latestVersion && app.latestVersion !== app.version);
  const status = String(app.status || "available").toLowerCase();
  const iconName = getCatalogApp(app.id)?.icon || app.icon || "apps";
  const canInstallFromManifest = app.source !== "preview";

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.14)",
            backgroundColor: "rgba(255,255,255,0.06)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontSize: 18, color: "#fff", fontWeight: "600" }}>{app.name}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={() => router.back()} />
        <View
          style={{
            height: sheetHeight,
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingBottom: insets.bottom + 12,
          }}
        >
          {banner ? (
            <Text style={{ fontSize: 12, color: theme.colors.textSecondary, paddingHorizontal: 16, marginTop: 10 }}>
              {banner.message}
            </Text>
          ) : null}

          {status !== "installed" ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
              <Text style={{ color: theme.colors.textSecondary, marginBottom: 12 }}>
                This app is not installed in your personal core yet.
              </Text>
              <TouchableOpacity
                style={{
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: theme.colors.accent,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onPress={async () => {
                  if (!canInstallFromManifest) {
                    showBanner("Preview apps are browse-only. Connect a platform registry to install.", "neutral");
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
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  {canInstallFromManifest ? "Install to Mac Mini" : "Connect platform to install"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : needsUpdate ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
              <View
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                  Update required: {app.version} → {app.latestVersion}
                </Text>
              </View>
              <TouchableOpacity
                style={{
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: theme.colors.accent,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onPress={async () => {
                  await mobileApi.updateApp(session, app.id, {
                    packageId: app.packageId,
                    releaseChannel: app.releaseChannel,
                    source: app.source,
                  });
                  showBanner("Updated.", "success");
                  await refresh();
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Update</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 18 }}>
              <View style={{ alignItems: "center", marginBottom: 18 }}>
                <BrandedAppIcon appId={app.id} icon={iconName} size={84} />
              </View>

              <Text
                style={{
                  fontSize: 24,
                  fontFamily: "Fraunces_700Bold",
                  color: theme.colors.text,
                  textAlign: "center",
                }}
              >
                {app.name}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: theme.colors.textSecondary,
                  textAlign: "center",
                  marginTop: 8,
                  lineHeight: 20,
                }}
              >
                {app.description || "Installed app"}
              </Text>

              <View
                style={{
                  marginTop: 20,
                  padding: 16,
                  borderRadius: 18,
                  backgroundColor: theme.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                  gap: 8,
                }}
              >
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                  Version {app.version}
                </Text>
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                  Ready to use in assistant chat.
                </Text>
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                  Updates must be installed before launch.
                </Text>
              </View>

              <TouchableOpacity
                style={{
                  marginTop: 18,
                  height: 48,
                  borderRadius: 14,
                  backgroundColor: theme.colors.accent,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onPress={() => {
                  setActiveApp({ id: app.id, name: app.name });
                  router.replace("/");
                }}
              >
                <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Use in chat</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  marginTop: 10,
                  height: 44,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onPress={() => {
                  clearActiveApp();
                  router.push(`/apps/${app.id}`);
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "600" }}>Manage app</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
