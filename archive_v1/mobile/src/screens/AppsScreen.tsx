import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { PrimaryScreenHeader } from "@/src/components/navigation/PrimaryScreenHeader";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";
import { useSessionState } from "@/src/lib/session-context";
import { appRegistryApi } from "@/src/lib/appRegistryApi";
import { getDefaultInstalledApps } from "@/src/lib/appCatalog";
import { BrandedAppIcon } from "@/src/components/apps/BrandedAppIcon";
import { normalizeAppRecord } from "@/src/lib/appRegistry";
import { sessionHasRuntimeAccess } from "@/src/lib/session";
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
            style={{ width: 96 }}
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
                marginTop: 10,
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
  const { session } = useSessionState();
  const [installed, setInstalled] = React.useState<AppRecord[]>([]);
  const [loadedOnce, setLoadedOnce] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!sessionHasRuntimeAccess(session)) {
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
      const runtimeSession = session;
      const [installedRes] = await Promise.all([appRegistryApi.getInstalledApps(runtimeSession)]);
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

  const isConnected = sessionHasRuntimeAccess(session);
  const showEmpty = installed.length === 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
    >
      <PrimaryScreenHeader
        title="Applications"
        subtitle="Focused modules Sage can open when structure helps."
        action={{
          accessibilityLabel: "Open app store",
          label: "Store",
          onPress: () => router.push("/apps/store"),
          variant: "ghost",
        }}
      />

      <Text style={{ marginBottom: 14, fontSize: 14, color: theme.colors.textSecondary, lineHeight: 22 }}>
        Installed apps you can open now.
      </Text>

      {!isConnected ? (
        <View
          style={{
            padding: 16,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
            Pair and connect your core to install and open applications.
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/session")}
            style={{
              marginTop: 10,
              height: 42,
              borderRadius: 14,
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
        <View
          style={{
            borderRadius: 24,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            padding: 16,
          }}
        >
          <AppGrid
            items={installed}
            variant="installed"
            onPress={(app) => {
              if (!sessionHasRuntimeAccess(session)) {
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
        </View>
      )}
    </ScrollView>
  );
}
