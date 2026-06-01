import React, { useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { MobileScreen } from "@/src/components/MobileScreen";
import { SectionCard } from "@/src/components/SectionCard";
import { BrandedAppIcon } from "@/src/components/apps/BrandedAppIcon";
import { PrimaryScreenHeader } from "@/src/components/navigation/PrimaryScreenHeader";
import { ActionButton } from "@/src/components/system/ActionButton";
import { MotionPressable } from "@/src/components/system/MotionPressable";
import { appRegistryApi, type MiniAppContract } from "@/src/lib/appRegistryApi";
import { useSessionState } from "@/src/lib/session-context";
import { useTheme } from "@/src/theme";

type LauncherApp = MiniAppContract & {
  id?: string;
  app_id?: string;
  name?: string;
  title?: string;
};

function readString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function appId(record: LauncherApp) {
  return readString(record.app_id, readString(record.id));
}

function appLabel(record: LauncherApp) {
  return readString(record.label, readString(record.name, readString(record.title, appId(record) || "Untitled")));
}

function normalizeWorkspaceApps(payload: unknown): LauncherApp[] {
  const root = payload && typeof payload === "object" ? payload as { items?: unknown } : {};
  if (!Array.isArray(root.items)) return [];

  return root.items
    .filter((item): item is LauncherApp => Boolean(item && typeof item === "object"))
    .filter((item) => {
      const id = appId(item);
      const status = readString(item.install_status, "installed").toLowerCase();
      return Boolean(id) && status !== "removed";
    })
    .sort((a, b) => appLabel(a).localeCompare(appLabel(b)));
}

export default function AppsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSessionState();
  const connected = Boolean(session?.runtimeUrl && session.runtimeKey && session.workspaceId);

  const workspaceAppsQuery = useQuery({
    queryKey: ["mobile", "workspace-launcher-apps", session?.runtimeUrl, session?.workspaceId],
    enabled: connected,
    queryFn: () => appRegistryApi.listMiniApps(session!),
  });

  const apps = useMemo(() => normalizeWorkspaceApps(workspaceAppsQuery.data), [workspaceAppsQuery.data]);
  const loadError = workspaceAppsQuery.error instanceof Error ? workspaceAppsQuery.error.message : null;

  return (
    <MobileScreen>
      <PrimaryScreenHeader
        title="Apps"
        subtitle="Open the apps added to this workspace."
      />

      {!connected ? (
        <SectionCard title="Connect workspace" subtitle="Pair this phone to show the same apps as desktop.">
          <ActionButton label="Pair phone" icon="link-outline" variant="primary" onPress={() => router.push("/session")} />
        </SectionCard>
      ) : null}

      {loadError ? (
        <View
          style={{
            borderRadius: theme.radii.lg,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            padding: theme.spacing.md,
          }}
        >
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta, lineHeight: 20 }}>
            Apps are not available on this phone yet. Desktop and mobile will use the same workspace launcher once this workspace is connected.
          </Text>
        </View>
      ) : null}

      {workspaceAppsQuery.isLoading ? (
        <LauncherEmptyState title="Loading apps" detail="Checking this workspace." icon="ellipsis-horizontal" />
      ) : apps.length ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            columnGap: 18,
            rowGap: 22,
            paddingTop: 4,
          }}
        >
          {apps.map((app) => (
            <LauncherTile
              key={appId(app)}
              app={app}
              onPress={() => router.push(`/apps/${encodeURIComponent(appId(app))}/home`)}
            />
          ))}
        </View>
      ) : (
        <LauncherEmptyState
          title="No apps yet"
          detail="Apps added from the desktop workspace will appear here."
          icon="cube-outline"
        />
      )}
    </MobileScreen>
  );
}

function LauncherTile({ app, onPress }: { app: LauncherApp; onPress: () => void }) {
  const theme = useTheme();
  const id = appId(app);
  const label = appLabel(app);

  return (
    <MotionPressable
      onPress={onPress}
      style={{
        width: 86,
        alignItems: "center",
        gap: 9,
      }}
    >
      <View
        style={{
          width: 68,
          height: 68,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          shadowColor: "#000000",
          shadowOpacity: 0.08,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 2,
        }}
      >
        <BrandedAppIcon appId={id} icon="apps-outline" size={44} />
      </View>
      <Text
        numberOfLines={2}
        style={{
          color: theme.colors.text,
          fontSize: 12.5,
          lineHeight: 16,
          textAlign: "center",
          fontFamily: "DMSans_700Bold",
        }}
      >
        {label}
      </Text>
    </MotionPressable>
  );
}

function LauncherEmptyState({ title, detail, icon }: { title: string; detail: string; icon: keyof typeof Ionicons.glyphMap }) {
  const theme = useTheme();

  return (
    <View
      style={{
        marginTop: 4,
        padding: 18,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        gap: 12,
      }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.card,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <Ionicons name={icon} size={23} color={theme.colors.text} />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 20, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
          {title}
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 21, color: theme.colors.textMuted }}>
          {detail}
        </Text>
      </View>
    </View>
  );
}
