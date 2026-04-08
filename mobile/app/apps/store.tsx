import React from "react";
import { Dimensions, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appRegistryApi } from "@/src/lib/appRegistryApi";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";
import { useSessionState } from "@/src/lib/session-context";
import { useTransientBanner } from "@/src/lib/useTransientBanner";
import { getCatalogApp, getDefaultInstalledApps, getDefaultStoreApps } from "@/src/lib/appCatalog";
import { BrandedAppIcon } from "@/src/components/apps/BrandedAppIcon";
import { normalizeAppRecord } from "@/src/lib/appRegistry";
import type { AppRecord } from "@/src/lib/types";

function PrimaryPill({
  label,
  tone,
  onPress,
}: {
  label: string;
  tone: "primary" | "neutral" | "warning";
  onPress?: () => void;
}) {
  const theme = useTheme();
  const bg =
    tone === "primary"
      ? theme.colors.accent
      : tone === "warning"
        ? theme.colors.warning
        : theme.isDark
          ? "rgba(255,255,255,0.10)"
          : "rgba(0,0,0,0.06)";
  const fg = tone === "neutral" ? theme.colors.text : "#fff";
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={{
        height: 30,
        paddingHorizontal: 14,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "800", color: fg }}>{label}</Text>
    </TouchableOpacity>
  );
}

function AppIcon({
  app,
  size = 46,
}: {
  app: AppRecord;
  size?: number;
}) {
  return <BrandedAppIcon appId={app.id} icon={app.icon || "apps"} size={size} />;
}

function getInstallMetadata(app: AppRecord) {
  return {
    packageId: app.packageId,
    releaseChannel: app.releaseChannel,
    source: app.source,
  } as const;
}

function canInstallOrUpdate(app: AppRecord) {
  return app.source !== "preview";
}

export default function AppStoreScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSessionState();
  const { banner, showBanner } = useTransientBanner();
  const [store, setStore] = React.useState<AppRecord[]>([]);
  const [updates, setUpdates] = React.useState<AppRecord[]>([]);
  const [installedIds, setInstalledIds] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [offlineMode, setOfflineMode] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState<"featured" | "installed" | "discover">("featured");
  const [query, setQuery] = React.useState("");

  const refresh = React.useCallback(async () => {
    const fallbackStore = getDefaultStoreApps()
      .map((a) => normalizeAppRecord(a, "preview"))
      .filter((item): item is AppRecord => Boolean(item));
    const fallbackInstalled = new Set(getDefaultInstalledApps().map((a) => a.id));
    const hasCore = Boolean(session?.runtimeUrl && session?.runtimeKey);
    const hasPlatform = Boolean(session?.platformUrl);

    setLoading(true);
    setError(null);

    if (!hasCore && !hasPlatform) {
      setStore(fallbackStore);
      setUpdates([]);
      setInstalledIds(fallbackInstalled);
      setOfflineMode(true);
      setLoading(false);
      return;
    }

    setStore([]);
    setUpdates([]);
    setInstalledIds(new Set());
    setOfflineMode(!hasCore);

    try {
      const [storeRes, updatesRes, installedRes] = await Promise.all([
        hasPlatform ? appRegistryApi.getPlatformStoreApps(session!) : Promise.resolve({ items: [] }),
        hasCore ? appRegistryApi.getAppUpdates(session!) : Promise.resolve({ items: [] }),
        hasCore ? appRegistryApi.getInstalledApps(session!) : Promise.resolve({ items: [] }),
      ]);
      const nextStore = (storeRes.items ?? [])
        .map((item: any) => normalizeAppRecord(item, "platform"))
        .filter((item): item is AppRecord => Boolean(item));
      const nextUpdates = (updatesRes.items ?? [])
        .map((item: any) => normalizeAppRecord(item, "core"))
        .filter((item): item is AppRecord => Boolean(item));
      const nextInstalledIds = new Set((installedRes.items ?? []).map((a: any) => String(a.id ?? a.app_id ?? "")));

      if (!hasPlatform) {
        setStore(fallbackStore);
      } else {
        setStore(nextStore);
      }
      setUpdates(nextUpdates);
      setInstalledIds(nextInstalledIds);
      setOfflineMode(!hasCore);
    } catch (err) {
      const runtimeUrl = String(session?.runtimeUrl || "");
      const platformUrl = String(session?.platformUrl || "");
      const loopbackTarget = hasPlatform ? platformUrl : runtimeUrl;
      const isLoopback = loopbackTarget.includes("127.0.0.1") || loopbackTarget.toLowerCase().includes("localhost");
      const message = err instanceof Error ? err.message : "";
      const statusMatch = message.match(/API request failed: (\\d{3})/);
      const status = statusMatch?.at(1);
      if (status) {
        if (status === "401" || status === "403") {
          setError(hasPlatform ? "Invalid platform key. Open Settings → Configure Session." : "Invalid runtime key. Open Settings → Configure Session.");
        } else {
          setError(hasPlatform ? `Platform registry returned an error (${status}).` : `Core returned an error (${status}). Restart the core and try again.`);
        }
      } else if (isLoopback) {
        setError(hasPlatform ? "Platform registry unreachable. Check your connection settings." : "Core unreachable. Check your connection settings.");
      } else {
        setError(hasPlatform ? "Platform registry unreachable. Check Settings and try again." : "Core unreachable. Check Settings and try again.");
      }
      setStore(fallbackStore);
      setUpdates([]);
      setInstalledIds(fallbackInstalled);
      setOfflineMode(!hasCore);
    } finally {
      setLoading(false);
    }
  }, [session]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const windowHeight = Dimensions.get("window").height;
  const headerGap = insets.top + 92;
  const sheetHeight = Math.max(280, windowHeight - headerGap);

  const updateMap = React.useMemo(() => {
    const map = new Map<string, AppRecord>();
    updates.forEach((app) => {
      if (app.id) map.set(app.id, app);
    });
    return map;
  }, [updates]);

  const storeApps = React.useMemo(() => store.filter((a) => a.id), [store]);
  const featuredApp = storeApps[0];
  const featuredMeta = featuredApp ? getCatalogApp(featuredApp.id) : undefined;
  const baseList = storeApps.slice(0, 8);

  const filteredList = React.useMemo(() => {
    let list = tab === "featured" ? baseList : tab === "installed" ? storeApps.filter((app) => installedIds.has(app.id)) : storeApps;
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((a) => a.name.toLowerCase().includes(q) || (a.description || "").toLowerCase().includes(q));
  }, [baseList, installedIds, query, storeApps, tab]);

  const handleAppAction = React.useCallback(
    async (app: AppRecord, installed: boolean, needsUpdate: boolean) => {
      if ((needsUpdate || !installed) && !canInstallOrUpdate(app)) {
        showBanner("Connect a platform registry to install this app.", "neutral");
        router.push(`/apps/${app.id}`);
        return;
      }

      if (!session?.runtimeUrl || !session?.runtimeKey) {
        showBanner("Connect your Mac Mini to manage apps.", "neutral");
        router.push("/session");
        return;
      }

      if (needsUpdate) {
        await appRegistryApi.updateApp(session, app.id, getInstallMetadata(app));
        showBanner(`Updated ${app.name}.`, "success");
        await refresh();
        return;
      }

      if (installed) {
        router.push(`/apps/${app.id}/home`);
        return;
      }

      await appRegistryApi.installApp(session, app.id, getInstallMetadata(app));
      showBanner(`Installed ${app.name}.`, "success");
      await refresh();
    },
    [refresh, router, session, showBanner],
  );

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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 10,
                backgroundColor: "rgba(255,255,255,0.10)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="apps" size={16} color="#fff" />
            </View>
            <Text style={{ fontSize: 18, color: "#fff", fontWeight: "700" }}>Apps</Text>
          </View>
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
            paddingBottom: insets.bottom + 20,
          }}
        >
          {/* Header inside the sheet (like an App Store surface) */}
          <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 26, fontFamily: "Fraunces_700Bold", color: theme.colors.text }}>Apps</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => showBanner("Installable mini apps. Updates are enforced before opening.", "neutral")}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: theme.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="information-circle-outline" size={18} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {banner ? (
              <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 8 }}>{banner.message}</Text>
            ) : null}
            <View
              style={{
                marginTop: 12,
                height: 42,
                borderRadius: 14,
                backgroundColor: theme.isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
                paddingHorizontal: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ionicons name="search" size={16} color={theme.colors.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search apps"
                placeholderTextColor={theme.colors.textSecondary}
                style={{ flex: 1, color: theme.colors.text, fontSize: 14 }}
              />
            </View>
          </View>

          {/* Content */}
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 92 }}>
            {offlineMode ? (
              <View
                style={{
                  marginBottom: 14,
                  padding: 12,
                  borderRadius: 16,
                  backgroundColor: theme.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                }}
              >
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                  Browse apps. Connect your Mac Mini to install and keep them updated.
                </Text>
                {error ? (
                  <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 8 }}>{error}</Text>
                ) : null}
                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <PrimaryPill label="Connect" tone="primary" onPress={() => router.push("/session")} />
                  <PrimaryPill label="Retry" tone="neutral" onPress={() => refresh()} />
                </View>
              </View>
            ) : null}

            {loading ? (
              <Text style={{ fontSize: 12, color: theme.colors.textSecondary, paddingVertical: 14 }}>
                Loading apps...
              </Text>
            ) : null}

            {error && !offlineMode ? (
              <View
                style={{
                  marginBottom: 14,
                  padding: 12,
                  borderRadius: 16,
                  backgroundColor: theme.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                }}
              >
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{error}</Text>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <PrimaryPill label="Settings" tone="neutral" onPress={() => router.push("/settings")} />
                  <PrimaryPill label="Retry" tone="primary" onPress={() => refresh()} />
                </View>
              </View>
            ) : null}

            {/* Featured */}
            {!loading && featuredApp && tab === "featured" ? (
              <View style={{ marginBottom: 16 }}>
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={async () => {
                    const needsUpdate = updateMap.has(featuredApp.id);
                    const installed = installedIds.has(featuredApp.id);
                    await handleAppAction(featuredApp, installed, needsUpdate);
                  }}
                  style={{
                    height: 170,
                    borderRadius: 18,
                    overflow: "hidden",
                    backgroundColor: "#0B0D12",
                  }}
                >
                  {/* decorative shapes */}
                  <View
                    style={{
                      position: "absolute",
                      width: 220,
                      height: 220,
                      borderRadius: 120,
                      backgroundColor: featuredMeta?.iconBackground ?? "#6D28D9",
                      opacity: 0.18,
                      top: -90,
                      right: -70,
                    }}
                  />
                  <View
                    style={{
                      position: "absolute",
                      width: 160,
                      height: 160,
                      borderRadius: 90,
                      backgroundColor: "#22C55E",
                      opacity: 0.08,
                      bottom: -70,
                      left: -40,
                    }}
                  />

                  <View style={{ flex: 1, justifyContent: "flex-end", padding: 16 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                        <AppIcon app={featuredApp} size={44} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 16, fontWeight: "800", color: "#fff" }} numberOfLines={1}>
                            {featuredApp.name}
                          </Text>
                          <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", marginTop: 2 }} numberOfLines={1}>
                            {featuredApp.description || "Installable mini app"}
                          </Text>
                        </View>
                      </View>

                      {(() => {
                        const needsUpdate = updateMap.has(featuredApp.id);
                        const installed = installedIds.has(featuredApp.id);
                        const label =
                          !canInstallOrUpdate(featuredApp) && !installed
                            ? "View"
                            : needsUpdate
                              ? "Update"
                              : installed
                                ? "Open"
                                : "Get";
                        return (
                          <View
                            style={{
                              height: 30,
                              paddingHorizontal: 14,
                              borderRadius: 999,
                              backgroundColor: "rgba(255,255,255,0.14)",
                              alignItems: "center",
                              justifyContent: "center",
                              marginLeft: 10,
                            }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: "800", color: "#fff" }}>{label}</Text>
                          </View>
                        );
                      })()}
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Top Apps */}
            {!loading ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: theme.colors.text }}>Top Apps</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => showBanner("Showing top apps in this category.", "neutral")}
                  >
                    <Text style={{ fontSize: 12, color: theme.colors.textSecondary, fontWeight: "700" }}>See all</Text>
                  </TouchableOpacity>
                </View>

                {filteredList.length === 0 ? (
                  <Text style={{ fontSize: 12, color: theme.colors.textSecondary, paddingVertical: 14 }}>No apps found.</Text>
                ) : (
                  <View style={{ gap: 12 }}>
                    {filteredList.slice(0, 5).map((app, idx) => {
                      const update = updateMap.get(app.id);
                      const needsUpdate = Boolean(update?.latestVersion && update.latestVersion !== update.version);
                      const installed = installedIds.has(app.id);
                      const actionLabel =
                        !canInstallOrUpdate(app) && !installed
                          ? "View"
                          : needsUpdate
                            ? "Update"
                            : installed
                              ? "Open"
                              : "Get";
                      const actionTone: "primary" | "neutral" | "warning" = needsUpdate ? "warning" : installed ? "neutral" : "neutral";
                      return (
                        <TouchableOpacity
                          key={app.id}
                          activeOpacity={0.92}
                          onPress={async () => {
                            await handleAppAction(app, installed, needsUpdate);
                          }}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 12,
                          }}
                        >
                          <AppIcon app={app} size={48} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: "800", color: theme.colors.text }} numberOfLines={1}>
                              {idx + 1}. {app.name}
                            </Text>
                            <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
                              {app.description || "Installable mini app"}
                            </Text>
                          </View>
                          <PrimaryPill
                            label={actionLabel}
                            tone={actionTone}
                            onPress={async () => {
                              await handleAppAction(app, installed, needsUpdate);
                            }}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            ) : null}
          </ScrollView>

          {/* Bottom nav (inside the store sheet, App Store style) */}
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              paddingBottom: insets.bottom,
              paddingTop: 8,
              backgroundColor: theme.colors.surface,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              flexDirection: "row",
              justifyContent: "space-around",
            }}
          >
            {[
              { key: "featured", label: "Featured", icon: "star-outline" },
              { key: "installed", label: "My Apps", icon: "grid-outline" },
              { key: "discover", label: "Discover", icon: "compass-outline" },
            ].map((item) => {
              const selected = tab === (item.key as any);
              const color = selected ? theme.colors.text : theme.colors.textSecondary;
              return (
                <TouchableOpacity
                  key={item.key}
                  activeOpacity={0.85}
                  onPress={() => setTab(item.key as any)}
                  style={{ alignItems: "center", justifyContent: "center", paddingVertical: 8, width: 72 }}
                >
                  <Ionicons name={item.icon as any} size={20} color={color} />
                  <Text style={{ marginTop: 4, fontSize: 10, fontWeight: selected ? "800" : "600", color }}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}
