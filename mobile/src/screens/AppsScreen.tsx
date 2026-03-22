import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HeaderSearchButton } from "@/src/components/HeaderSearchButton";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";
import { useSessionState } from "@/src/lib/session-context";
import { mobileApi } from "@/src/lib/api";
import { getDefaultInstalledApps } from "@/src/lib/appCatalog";
import { BrandedAppIcon } from "@/src/components/apps/BrandedAppIcon";
import { normalizeAppRecord } from "@/src/lib/appRegistry";
import type { AppRecord } from "@/src/lib/types";

const GRID_GAP = 14;

function AppGrid({
  items,
  variant,
  onPress,
  showVersion,
}: {
  items: AppRecord[];
  variant: "installed" | "store" | "updates";
  onPress?: (app: AppRecord) => void;
  showVersion?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP }}>
      {items.map((app) => {
        const needsUpdate = Boolean(app.latestVersion && app.latestVersion !== app.version);
        const badgeLabel = needsUpdate ? "Update" : variant === "store" ? "Get" : null;
        const badgeColor = needsUpdate ? theme.colors.warning : theme.colors.accent;
        return (
          <TouchableOpacity
            key={app.id}
            activeOpacity={0.85}
            onPress={() => onPress && onPress(app)}
            style={{ width: 92 }}
          >
            <View>
              <BrandedAppIcon appId={app.id} icon={app.icon ?? "apps-outline"} size={58} />
              {badgeLabel ? (
                <View
                  style={{
                    position: "absolute",
                    top: -8,
                    right: -8,
                    paddingHorizontal: 8,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: badgeColor,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 9, color: "#fff", fontWeight: "700" }}>{badgeLabel}</Text>
                </View>
              ) : null}
            </View>
            <Text
              style={{
                marginTop: 8,
                fontSize: 12,
                color: theme.colors.text,
                textAlign: "center",
              }}
              numberOfLines={1}
            >
              {app.name}
            </Text>
            {showVersion && app.latestVersion ? (
              <Text style={{ fontSize: 10, color: theme.colors.textSecondary, textAlign: "center", marginTop: 2 }}>
                {app.version} → {app.latestVersion}
              </Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function AppsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSessionState();
  const [installed, setInstalled] = React.useState<AppRecord[]>([]);
  const [loadedOnce, setLoadedOnce] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!session?.runtimeUrl || !session?.runtimeKey) {
      if (!loadedOnce) {
        setInstalled(
          getDefaultInstalledApps()
            .map((app) => normalizeAppRecord(app, "preview"))
            .filter((item): item is AppRecord => Boolean(item)),
        );
        setLoadedOnce(true);
      }
      return;
    }
    try {
      const [installedRes] = await Promise.all([mobileApi.getInstalledApps(session)]);
      setInstalled(
        (installedRes.items ?? [])
          .map((app: any) => normalizeAppRecord(app, "core"))
          .filter((item): item is AppRecord => Boolean(item)),
      );
      setLoadedOnce(true);
    } catch (err) {
      if (!loadedOnce) {
        setInstalled(
          getDefaultInstalledApps()
            .map((app) => normalizeAppRecord(app, "preview"))
            .filter((item): item is AppRecord => Boolean(item)),
        );
        setLoadedOnce(true);
      }
    }
  }, [loadedOnce, session]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const isConnected = Boolean(session?.runtimeUrl && session?.runtimeKey);
  const showEmpty = installed.length === 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 40 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <Text style={{ fontSize: 22, fontFamily: "Fraunces_700Bold", color: theme.colors.text }}>Apps</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TouchableOpacity onPress={() => router.push("/apps/store")}>
            <Text style={{ fontSize: 16, color: theme.colors.accent, fontWeight: "800" }}>Get more</Text>
          </TouchableOpacity>
          <HeaderSearchButton />
        </View>
      </View>

      <Text style={{ marginBottom: 16, fontSize: 14, color: theme.colors.textSecondary, lineHeight: 22 }}>
        Installed apps you can open now.
      </Text>

      {!isConnected ? (
        <View
          style={{
            padding: 14,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
            Connect your Mac Mini to install and open apps.
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/session")}
            style={{
              marginTop: 10,
              height: 40,
              borderRadius: 12,
              backgroundColor: theme.colors.accent,
              alignItems: "center",
              justifyContent: "center",
              alignSelf: "flex-start",
              paddingHorizontal: 14,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>Connect</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {showEmpty ? (
        <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
          No apps installed yet. Tap “Get more” to add one.
        </Text>
      ) : (
        <AppGrid
          items={installed}
          variant="installed"
          onPress={(app) => {
            if (!session?.runtimeUrl || !session?.runtimeKey) {
              router.push("/session");
              return;
            }
            if (app.latestVersion && app.latestVersion !== app.version) {
              router.push(`/apps/${app.id}`);
              return;
            }
            router.push(`/apps/${app.id}/home`);
          }}
        />
      )}
    </ScrollView>
  );
}
