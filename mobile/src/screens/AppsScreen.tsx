import React, { useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { MobileScreen } from "@/src/components/MobileScreen";
import { SectionCard } from "@/src/components/SectionCard";
import { PrimaryScreenHeader } from "@/src/components/navigation/PrimaryScreenHeader";
import { ActionButton } from "@/src/components/system/ActionButton";
import { MotionPressable } from "@/src/components/system/MotionPressable";
import { appRegistryApi, type MiniAppContract } from "@/src/lib/appRegistryApi";
import { useSessionState } from "@/src/lib/session-context";
import { useTheme } from "@/src/theme";

type AppRecord = MiniAppContract & {
  id?: string;
  app_id?: string;
  package_id?: string;
  name?: string;
  title?: string;
  summary?: string;
  status?: string;
};

function readString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function appId(record: AppRecord) {
  return readString(record.app_id, readString(record.id, readString(record.package_id)));
}

function appLabel(record: AppRecord) {
  return readString(record.label, readString(record.name, readString(record.title, appId(record) || "Untitled app")));
}

function appDescription(record: AppRecord) {
  return readString(record.description, readString(record.summary, "Workspace tool"));
}

function normalizeItems(payload: unknown): AppRecord[] {
  const root = payload && typeof payload === "object" ? payload as { items?: unknown } : {};
  return Array.isArray(root.items) ? root.items.filter((item): item is AppRecord => Boolean(item && typeof item === "object")) : [];
}

export default function AppsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSessionState();
  const [installingId, setInstallingId] = useState<string | null>(null);
  const connected = Boolean(session?.runtimeUrl && session.runtimeKey && session.workspaceId);

  const miniAppsQuery = useQuery({
    queryKey: ["mobile", "mini-apps", session?.runtimeUrl, session?.workspaceId],
    enabled: connected,
    queryFn: () => appRegistryApi.listMiniApps(session!),
  });
  const installedAppsQuery = useQuery({
    queryKey: ["mobile", "installed-apps", session?.runtimeUrl, session?.workspaceId],
    enabled: connected,
    queryFn: () => appRegistryApi.getInstalledApps(session!),
  });
  const storeAppsQuery = useQuery({
    queryKey: ["mobile", "store-apps", session?.platformUrl],
    enabled: Boolean(session?.platformUrl && session?.runtimeUrl && session?.runtimeKey),
    queryFn: () => appRegistryApi.getPlatformStoreApps(session!),
  });
  const updatesQuery = useQuery({
    queryKey: ["mobile", "app-updates", session?.runtimeUrl, session?.workspaceId],
    enabled: connected,
    queryFn: () => appRegistryApi.getAppUpdates(session!),
  });

  const miniApps = useMemo(() => normalizeItems(miniAppsQuery.data), [miniAppsQuery.data]);
  const installedApps = useMemo(() => normalizeItems(installedAppsQuery.data), [installedAppsQuery.data]);
  const storeApps = useMemo(() => normalizeItems(storeAppsQuery.data), [storeAppsQuery.data]);
  const updateCount = useMemo(() => normalizeItems(updatesQuery.data).length, [updatesQuery.data]);
  const installedIds = useMemo(() => new Set([...miniApps, ...installedApps].map(appId).filter(Boolean)), [installedApps, miniApps]);
  const availableStoreApps = storeApps.filter((record) => {
    const id = appId(record);
    return id && !installedIds.has(id);
  });
  const loadError =
    (miniAppsQuery.error instanceof Error && miniAppsQuery.error.message)
    || (installedAppsQuery.error instanceof Error && installedAppsQuery.error.message)
    || null;

  async function installStoreApp(record: AppRecord) {
    if (!session) return;
    const id = appId(record);
    if (!id) return;
    setInstallingId(id);
    try {
      await appRegistryApi.installApp(session, id, {
        packageId: readString(record.package_id) || undefined,
        source: "platform",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile", "installed-apps"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "mini-apps"] }),
        queryClient.invalidateQueries({ queryKey: ["mobile", "store-apps"] }),
      ]);
    } finally {
      setInstallingId(null);
    }
  }

  return (
    <MobileScreen>
      <PrimaryScreenHeader
        title="Apps"
        subtitle="Workspace tools, hosted mini apps, and installable surfaces."
        action={{
          accessibilityLabel: "Register app",
          icon: "add",
          onPress: () => router.push("/apps/register"),
          variant: "primary",
        }}
      />

      {!connected ? (
        <SectionCard title="Connect workspace" subtitle="Apps need a paired runtime before they can load.">
          <ActionButton label="Pair phone" icon="link-outline" variant="primary" onPress={() => router.push("/session")} />
        </SectionCard>
      ) : null}

      {loadError ? (
        <View
          style={{
            borderRadius: theme.radii.lg,
            borderWidth: 1,
            borderColor: theme.colors.errorMuted,
            backgroundColor: theme.colors.errorMuted,
            padding: theme.spacing.md,
          }}
        >
          <Text style={{ color: theme.colors.error, fontSize: theme.typography.meta, fontFamily: "DMSans_700Bold" }}>
            {loadError}
          </Text>
        </View>
      ) : null}

      <SectionCard
        title="Installed"
        subtitle={
          miniAppsQuery.isLoading || installedAppsQuery.isLoading
            ? "Loading workspace apps..."
            : `${miniApps.length + installedApps.length} app${miniApps.length + installedApps.length === 1 ? "" : "s"} available`
        }
      >
        {[...miniApps, ...installedApps].length ? (
          [...miniApps, ...installedApps].map((record) => (
            <AppRow
              key={`${appId(record)}:${appLabel(record)}`}
              record={record}
              actionLabel="Open"
              icon="open-outline"
              onPress={() => router.push(`/apps/${encodeURIComponent(appId(record))}/home`)}
            />
          ))
        ) : (
          <EmptyState
            icon="cube-outline"
            title={connected ? "No apps installed" : "Apps unavailable"}
            detail={connected ? "Register a private app or install one from the workspace store." : "Pair this phone to load workspace apps."}
          />
        )}
      </SectionCard>

      <SectionCard
        title="Store"
        subtitle={
          storeAppsQuery.isLoading
            ? "Loading available apps..."
            : session?.platformUrl
              ? `${availableStoreApps.length} app${availableStoreApps.length === 1 ? "" : "s"} ready to install`
              : "Platform registry is not configured for this session."
        }
      >
        {availableStoreApps.length ? (
          availableStoreApps.map((record) => {
            const id = appId(record);
            return (
              <AppRow
                key={`${id}:store`}
                record={record}
                actionLabel={installingId === id ? "Installing..." : "Install"}
                icon="download-outline"
                disabled={Boolean(installingId)}
                onPress={() => void installStoreApp(record)}
              />
            );
          })
        ) : (
          <EmptyState
            icon="storefront-outline"
            title={session?.platformUrl ? "No new apps" : "Store offline"}
            detail={session?.platformUrl ? "Installed apps are up to date." : "Connect through hosted auth or add a platform URL to use the store."}
          />
        )}
      </SectionCard>

      <SectionCard title="Maintenance" subtitle={updateCount ? `${updateCount} update${updateCount === 1 ? "" : "s"} available` : "No app updates waiting."}>
        <ActionButton
          label="Register private app"
          icon="add-circle-outline"
          onPress={() => router.push("/apps/register")}
        />
      </SectionCard>
    </MobileScreen>
  );
}

function AppRow({
  record,
  actionLabel,
  icon,
  disabled,
  onPress,
}: {
  record: AppRecord;
  actionLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const id = appId(record);
  const trust = readString(record.trust_tier, readString(record.status, "workspace"));

  return (
    <MotionPressable
      onPress={onPress}
      disabled={disabled}
      style={{
        borderRadius: theme.radii.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.app,
        padding: theme.spacing.md,
        gap: theme.spacing.sm,
        opacity: disabled ? 0.58 : 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.md }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: theme.radii.md,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.panelMuted,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="cube-outline" size={20} color={theme.colors.text} />
        </View>
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <Text style={{ color: theme.colors.text, fontSize: theme.typography.body, fontFamily: "DMSans_700Bold" }}>
            {appLabel(record)}
          </Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta, lineHeight: 19 }}>
            {appDescription(record)}
          </Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.caption }}>
            {id || "unregistered"} · {trust.replace(/_/g, " ")}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.xs }}>
          <Ionicons name={icon} size={15} color={theme.colors.text} />
          <Text style={{ color: theme.colors.text, fontSize: theme.typography.caption, fontFamily: "DMSans_700Bold" }}>
            {actionLabel}
          </Text>
        </View>
      </View>
    </MotionPressable>
  );
}

function EmptyState({ icon, title, detail }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        borderRadius: theme.radii.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.app,
        padding: theme.spacing.lg,
        gap: theme.spacing.sm,
      }}
    >
      <Ionicons name={icon} size={22} color={theme.colors.textMuted} />
      <Text style={{ color: theme.colors.text, fontSize: theme.typography.body, fontFamily: "DMSans_700Bold" }}>
        {title}
      </Text>
      <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta, lineHeight: 20 }}>
        {detail}
      </Text>
    </View>
  );
}
