import React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { BrandedAppIcon } from "@/src/components/apps/BrandedAppIcon";
import { PrimaryScreenHeader } from "@/src/components/navigation/PrimaryScreenHeader";
import { ActionButton } from "@/src/components/system/ActionButton";
import { MotionPressable } from "@/src/components/system/MotionPressable";
import { getPreviewAppRecord, normalizeAppRecord } from "@/src/lib/appRegistry";
import { appRegistryApi } from "@/src/lib/appRegistryApi";
import { APP_CATALOG } from "@/src/lib/appCatalog";
import { useSessionState } from "@/src/lib/session-context";
import type { AppRecord } from "@/src/lib/types";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

const CURATED_ORDER = ["calorie_tracking", "flashcards"] as const;

function sortApps(items: typeof APP_CATALOG) {
  const order = new Map<string, number>(CURATED_ORDER.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const orderA = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const orderB = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });
}

function sortAppRecords(items: AppRecord[]) {
  const order = new Map<string, number>(CURATED_ORDER.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const orderA = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const orderB = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });
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
  const fallbackDiscoverApps = React.useMemo(
    () =>
      sortApps(APP_CATALOG)
        .map((app) => normalizeAppRecord(app, "preview"))
        .filter((item): item is AppRecord => Boolean(item)),
    [],
  );
  const [installedApps, setInstalledApps] = React.useState<AppRecord[]>([]);
  const [discoverApps, setDiscoverApps] = React.useState<AppRecord[]>(fallbackDiscoverApps);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    async function loadApps() {
      if (!connected || !session?.runtimeUrl || !session?.runtimeKey) {
        if (active) {
          setInstalledApps([]);
          setDiscoverApps(fallbackDiscoverApps);
        }
        return;
      }

      setLoading(true);
      try {
        const [installedResult, platformResult] = await Promise.allSettled([
          appRegistryApi.getInstalledApps(session),
          session.platformUrl ? appRegistryApi.getPlatformStoreApps(session) : Promise.resolve({ items: [] }),
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

        if (!active) return;

        const installedById = new Map(installedRecords.map((app) => [app.id, app] as const));
        const platformById = new Map(platformRecords.map((app) => [app.id, app] as const));
        const previewById = new Map(
          fallbackDiscoverApps
            .map((app) => [app.id, app] as const),
        );
        const discoverIds = new Set<string>([
          ...CURATED_ORDER,
          ...fallbackDiscoverApps.map((app) => app.id),
          ...platformRecords.map((app) => app.id),
        ]);

        setInstalledApps(sortAppRecords(installedRecords));
        setDiscoverApps(
          sortAppRecords(
            Array.from(discoverIds)
              .map((id) => platformById.get(id) || previewById.get(id) || getPreviewAppRecord(id))
              .filter((item): item is AppRecord => Boolean(item))
              .filter((item) => !installedById.has(item.id)),
          ),
        );
      } catch {
        if (active) {
          setInstalledApps([]);
          setDiscoverApps(fallbackDiscoverApps);
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
  }, [connected, fallbackDiscoverApps, session]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <PrimaryScreenHeader
        title="Discover"
        subtitle="Installed tools and new things to try."
        action={{
          accessibilityLabel: "Open Discover Store",
          label: "Store",
          icon: "bag-handle-outline",
          onPress: () => router.push("/apps/store"),
          variant: "secondary",
        }}
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
              <AppShelfCard key={app.id} app={app} onPress={(next) => router.push(`/apps/${next.id}`)} />
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
              Open the store to install your first tool.
            </Text>
            <ActionButton
              label="Open Store"
              variant="primary"
              onPress={() => router.push("/apps/store")}
              style={{ alignSelf: "flex-start", marginTop: 6 }}
            />
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
          Explore tools, builds, and marketplace installs from the same place.
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
              router.push(`/apps/${next.id}`);
              return;
            }
            router.push("/apps/store");
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
            Your installed shelf stays here. Open the store to check again or install from the broader marketplace.
          </Text>
          <ActionButton
            label="Open Store"
            variant="secondary"
            onPress={() => router.push("/apps/store")}
            style={{ alignSelf: "flex-start", marginTop: 6 }}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}
