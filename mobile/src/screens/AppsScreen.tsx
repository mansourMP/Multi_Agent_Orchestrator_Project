import React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { BrandedAppIcon } from "@/src/components/apps/BrandedAppIcon";
import { PrimaryScreenHeader } from "@/src/components/navigation/PrimaryScreenHeader";
import { MotionPressable } from "@/src/components/system/MotionPressable";
import { normalizeAppRecord } from "@/src/lib/appRegistry";
import { appRegistryApi } from "@/src/lib/appRegistryApi";
import { useSessionState } from "@/src/lib/session-context";
import type { AppRecord } from "@/src/lib/types";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

const CURATED_ORDER = ["calorie_tracking", "flashcards"] as const;
const HIDDEN_DEMO_APP_IDS = new Set<string>(CURATED_ORDER);

function sortAppRecords(items: AppRecord[]) {
  const order = new Map<string, number>(CURATED_ORDER.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const orderA = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const orderB = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });
}

function normalizeMiniAppContract(raw: any): AppRecord | null {
  const id = String(raw?.app_id || raw?.id || "").trim();
  if (!id || String(raw?.install_status || "installed").toLowerCase() === "removed") {
    return null;
  }
  return {
    id,
    name: String(raw?.label || raw?.name || id),
    description: raw?.description ? String(raw.description) : undefined,
    icon: raw?.icon ? String(raw.icon) : "apps-outline",
    category: raw?.delivery_mode === "hosted" ? "Hosted mini app" : "Mini app",
    publisher: "Workspace",
    status: "installed",
    version: "1.0.0",
    permissions: Array.isArray(raw?.permissions) ? raw.permissions.map((item: unknown) => String(item)) : [],
    source: "core",
  };
}

function AppShelfCard({
  app,
  onPress,
}: {
  app: AppRecord;
  onPress: (app: AppRecord) => void;
}) {
  const theme = useTheme();

  return (
    <MotionPressable
      onPress={() => onPress(app)}
      style={{
        width: 176,
        minHeight: 116,
        padding: 14,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <BrandedAppIcon appId={app.id} icon={app.icon ?? "apps-outline"} size={52} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{
              fontSize: 15,
              lineHeight: 18,
              fontFamily: "DMSans_700Bold",
              color: theme.colors.text,
            }}
            numberOfLines={1}
          >
            {app.name}
          </Text>
          <Text
            style={{
              fontSize: 12,
              lineHeight: 16,
              color: theme.colors.textSecondary,
            }}
            numberOfLines={2}
          >
            {app.description || "Open your installed tool."}
          </Text>
        </View>
      </View>
      <View style={{ alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.colors.cardHover }}>
        <Text style={{ fontSize: 11.5, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>Open</Text>
      </View>
    </MotionPressable>
  );
}

function DiscoverCard({
  app,
  onPress,
}: {
  app: AppRecord;
  onPress: (app: AppRecord) => void;
}) {
  const theme = useTheme();

  return (
    <MotionPressable
      onPress={() => onPress(app)}
      style={{
        width: "48.5%",
        minWidth: 148,
        padding: 14,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        gap: 12,
      }}
    >
      <BrandedAppIcon appId={app.id} icon={app.icon ?? "apps-outline"} size={56} />
      <View style={{ gap: 5 }}>
        <Text
          style={{
            fontSize: 14,
            lineHeight: 17,
            fontFamily: "DMSans_700Bold",
            color: theme.colors.text,
          }}
          numberOfLines={1}
        >
          {app.name}
        </Text>
        <Text
          style={{
            fontSize: 12,
            lineHeight: 17,
            color: theme.colors.textSecondary,
          }}
          numberOfLines={3}
        >
          {app.description || "Open Discover to install this tool."}
        </Text>
      </View>
      <Text style={{ fontSize: 11.5, fontFamily: "DMSans_700Bold", color: theme.colors.textSecondary }}>
        {app.category || "Tool"}
      </Text>
    </MotionPressable>
  );
}

export default function AppsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSessionState();
  const connected = Boolean(session?.runtimeUrl && session?.runtimeKey);
  const [installedApps, setInstalledApps] = React.useState<AppRecord[]>([]);
  const [discoverApps, setDiscoverApps] = React.useState<AppRecord[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    async function loadApps() {
      if (!connected || !session?.runtimeUrl || !session?.runtimeKey) {
        if (active) {
          setInstalledApps([]);
          setDiscoverApps([]);
        }
        return;
      }

      setLoading(true);
      try {
        const [installedResult, platformResult, miniAppsResult] = await Promise.allSettled([
          appRegistryApi.getInstalledApps(session),
          session.platformUrl ? appRegistryApi.getPlatformStoreApps(session) : Promise.resolve({ items: [] }),
          appRegistryApi.listMiniApps(session),
        ]);

        const installedRecords =
          installedResult.status === "fulfilled"
            ? (installedResult.value.items ?? [])
                .map((item: any) => normalizeAppRecord(item, "core"))
                .filter((item): item is AppRecord => Boolean(item))
            : [];

        const platformRecords =
          platformResult.status === "fulfilled"
            ? (platformResult.value.items ?? [])
                .map((item: any) => normalizeAppRecord(item, "platform"))
                .filter((item): item is AppRecord => Boolean(item))
            : [];
        const miniAppRecords =
          miniAppsResult.status === "fulfilled"
            ? (miniAppsResult.value.items ?? [])
                .map((item: any) => normalizeMiniAppContract(item))
                .filter((item): item is AppRecord => Boolean(item))
            : [];

        if (!active) return;

        const installedById = new Map([...installedRecords, ...miniAppRecords].map((app) => [app.id, app] as const));

        setInstalledApps(sortAppRecords([...installedRecords, ...miniAppRecords]));
        setDiscoverApps(
          sortAppRecords(
            platformRecords
              .filter((item) => !installedById.has(item.id))
              .filter((item) => !HIDDEN_DEMO_APP_IDS.has(item.id)),
          ),
        );
      } catch {
        if (active) {
          setInstalledApps([]);
          setDiscoverApps([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadApps();

    return () => {
      active = false;
    };
  }, [connected, session]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <PrimaryScreenHeader
        title="Discover"
        subtitle="Installed mini apps and shareable tools."
      />

      <View style={{ gap: 10 }}>
        <Text
          style={{
            fontSize: 11,
            fontFamily: "DMSans_700Bold",
            color: theme.colors.textSecondary,
            textTransform: "uppercase",
            letterSpacing: 1.1,
          }}
        >
          Installed
        </Text>

        {loading ? (
          <View
            style={{
              minHeight: 116,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ActivityIndicator color={theme.colors.textSecondary} />
          </View>
        ) : installedApps.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingRight: 4 }}
          >
            {installedApps.map((app) => (
              <AppShelfCard key={app.id} app={app} onPress={(next) => router.push(`/apps/${next.id}/home`)} />
            ))}
          </ScrollView>
        ) : (
          <View
            style={{
              minHeight: 116,
              paddingHorizontal: 18,
              paddingVertical: 20,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
              Nothing installed yet
            </Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary }}>
              Open a mini app from Discover, an agent message, or a shared app link.
            </Text>
            <TouchableMiniLink label="Register hosted app" onPress={() => router.push("/apps/register")} />
          </View>
        )}
      </View>

      <View style={{ marginTop: 26, gap: 10 }}>
        <Text
          style={{
            fontSize: 11,
            fontFamily: "DMSans_700Bold",
            color: theme.colors.textSecondary,
            textTransform: "uppercase",
            letterSpacing: 1.1,
          }}
        >
          Discover
        </Text>
        <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
          Public mini apps will appear here when they are shared with this workspace.
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          rowGap: 24,
          columnGap: 10,
          paddingTop: 14,
        }}
      >
        {discoverApps.map((app) => (
          <DiscoverCard key={app.id} app={app} onPress={(next) => {
            if (next.status === "installed") {
              router.push(`/apps/${next.id}/home`);
              return;
            }
            router.push(`/apps/${next.id}/home`);
          }} />
        ))}
      </View>

      {!discoverApps.length && !loading ? (
        <View
          style={{
            marginTop: 18,
            minHeight: 96,
            paddingHorizontal: 18,
            paddingVertical: 20,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            justifyContent: "center",
            gap: 6,
          }}
        >
          <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
            Nothing else is available right now
          </Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary }}>
              Discover stays lightweight for now. Register a hosted app or open one from an agent message.
            </Text>
          <TouchableMiniLink label="Register hosted app" onPress={() => router.push("/apps/register")} />
        </View>
      ) : null}
    </ScrollView>
  );
}

function TouchableMiniLink({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <MotionPressable
      onPress={onPress}
      style={{
        alignSelf: "flex-start",
        marginTop: 8,
        paddingHorizontal: 13,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
      }}
    >
      <Text style={{ color: theme.colors.text, fontFamily: "DMSans_700Bold", fontSize: 12 }}>
        {label}
      </Text>
    </MotionPressable>
  );
}
