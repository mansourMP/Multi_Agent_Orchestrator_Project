import React, { useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { MobileScreen } from "@/src/components/MobileScreen";
import { PrimaryScreenHeader } from "@/src/components/navigation/PrimaryScreenHeader";
import { ActionButton } from "@/src/components/system/ActionButton";
import { MotionPressable } from "@/src/components/system/MotionPressable";
import { appRegistryApi, type DiscoveryFeedItem } from "@/src/lib/appRegistryApi";
import { useSessionState } from "@/src/lib/session-context";
import { useTheme } from "@/src/theme";

type DiscoveryFilter = "apps" | "agents" | "tools" | "mcp" | "skills" | "bundles";

const FILTERS: { key: DiscoveryFilter; label: string }[] = [
  { key: "apps", label: "Apps" },
  { key: "agents", label: "Agent templates" },
  { key: "tools", label: "Tools" },
  { key: "mcp", label: "MCP" },
  { key: "skills", label: "Skills" },
  { key: "bundles", label: "Bundles" },
];

function readItems(payload: unknown): DiscoveryFeedItem[] {
  const root = payload && typeof payload === "object" ? payload as { items?: unknown } : {};
  return Array.isArray(root.items)
    ? root.items.filter((item): item is DiscoveryFeedItem => Boolean(item && typeof item === "object"))
    : [];
}

function itemSummary(item: DiscoveryFeedItem) {
  return String(item.summary || item.description || "Cloneable workspace capability.").trim();
}

function itemByline(item: DiscoveryFeedItem) {
  return String(item.provenance?.label || item.actor?.byline || item.actor?.label || "Empyralis").trim();
}

function statusLabel(item: DiscoveryFeedItem) {
  const raw = String(item.blueprint?.status || "").trim();
  if (!raw || raw === "public_discoverable") return "";
  return raw.replace(/[._-]+/g, " ");
}

function actionLabel(item: DiscoveryFeedItem) {
  if (item.type === "public_app") {
    return item.installed ? "Open" : "Clone app blueprint";
  }
  if (item.type === "agent_template") {
    return "Copy to Studio";
  }
  return item.installed ? "Open" : "Install";
}

export default function DiscoverScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSessionState();
  const [filter, setFilter] = useState<DiscoveryFilter>("apps");
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const connected = Boolean(session?.runtimeUrl && session.runtimeKey && session.workspaceId);

  const discoveryQuery = useQuery({
    queryKey: ["mobile", "discovery", session?.runtimeUrl, session?.workspaceId, filter],
    enabled: connected,
    queryFn: () => appRegistryApi.listDiscoveryFeed(session!, filter),
  });

  const items = useMemo(() => readItems(discoveryQuery.data), [discoveryQuery.data]);
  const loadError = discoveryQuery.error instanceof Error ? discoveryQuery.error.message : null;

  const adoptItem = async (item: DiscoveryFeedItem) => {
    if (!session || item.action?.enabled === false) return;
    setBusyItemId(item.id);
    setActionError(null);
    try {
      const payload = await appRegistryApi.adoptDiscoveryItem(session, item.id);
      await queryClient.invalidateQueries({ queryKey: ["mobile", "workspace-launcher-apps"] });
      const openUrl = String(payload?.open_url || "").trim();
      const openUrlAppId = openUrl.match(/\/applications\/([^/?#]+)/)?.[1] || "";
      const appId = String(payload?.app_id || openUrlAppId || "").trim();
      if (appId) {
        router.push(`/apps/${encodeURIComponent(appId)}/home`);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Discovery action failed.");
    } finally {
      setBusyItemId(null);
    }
  };

  return (
    <MobileScreen>
      <PrimaryScreenHeader
        title="Discover"
        subtitle="Clone approved app blueprints and workspace capabilities."
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingBottom: 2 }}
      >
        {FILTERS.map((entry) => {
          const active = entry.key === filter;
          return (
            <MotionPressable
              key={entry.key}
              onPress={() => setFilter(entry.key)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? theme.colors.text : theme.colors.border,
                backgroundColor: active ? theme.colors.text : theme.colors.surface,
              }}
            >
              <Text
                style={{
                  color: active ? theme.colors.app : theme.colors.textMuted,
                  fontFamily: "DMSans_700Bold",
                  fontSize: 13,
                }}
              >
                {entry.label}
              </Text>
            </MotionPressable>
          );
        })}
      </ScrollView>

      {!connected ? (
        <DiscoveryNotice
          icon="link-outline"
          title="Connect workspace"
          detail="Pair this phone to use the same Discovery source as desktop."
          action={<ActionButton label="Pair phone" icon="link-outline" variant="primary" onPress={() => router.push("/session")} />}
        />
      ) : null}

      {loadError || actionError ? (
        <DiscoveryNotice
          icon="warning-outline"
          title="Discovery is unavailable"
          detail={actionError || loadError || "Try again after the workspace is reachable."}
        />
      ) : null}

      {discoveryQuery.isLoading ? (
        <DiscoveryNotice icon="ellipsis-horizontal" title="Loading Discovery" detail="Checking approved public blueprints." />
      ) : items.length ? (
        <View style={{ gap: 12 }}>
          {items.map((item) => (
            <DiscoveryCard
              key={item.id}
              item={item}
              busy={busyItemId === item.id}
              onPress={() => adoptItem(item)}
            />
          ))}
        </View>
      ) : (
        <DiscoveryNotice
          icon="compass-outline"
          title="Nothing approved yet"
          detail="Discovery only shows public blueprints after review."
        />
      )}
    </MobileScreen>
  );
}

function DiscoveryCard({ item, busy, onPress }: { item: DiscoveryFeedItem; busy: boolean; onPress: () => void }) {
  const theme = useTheme();
  const status = statusLabel(item);

  return (
    <View
      style={{
        borderRadius: 22,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: 16,
        gap: 14,
      }}
    >
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 15,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.colors.panelMuted,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Ionicons name={item.type === "public_app" ? "apps-outline" : "sparkles-outline"} size={22} color={theme.colors.text} />
        </View>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={{ color: theme.colors.text, fontFamily: "DMSans_700Bold", fontSize: 18, lineHeight: 23 }}>
            {item.title}
          </Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 18 }}>
            {itemByline(item)}
          </Text>
        </View>
      </View>
      <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 21 }}>
        {itemSummary(item)}
      </Text>
      {status || item.permission_summary?.length ? (
        <Text style={{ color: theme.colors.textMuted, fontSize: 12, lineHeight: 18, fontFamily: "DMSans_700Bold" }}>
          {[status, ...(item.permission_summary || [])].filter(Boolean).join(" · ")}
        </Text>
      ) : null}
      <MotionPressable
        disabled={busy || item.action?.enabled === false}
        onPress={onPress}
        style={{
          minHeight: 48,
          borderRadius: 15,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.text,
          opacity: busy || item.action?.enabled === false ? 0.55 : 1,
        }}
      >
        {busy ? (
          <ActivityIndicator color={theme.colors.app} />
        ) : (
          <Text style={{ color: theme.colors.app, fontFamily: "DMSans_700Bold", fontSize: 15 }}>
            {actionLabel(item)}
          </Text>
        )}
      </MotionPressable>
    </View>
  );
}

function DiscoveryNotice({
  icon,
  title,
  detail,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
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
          backgroundColor: theme.colors.panelMuted,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <Ionicons name={icon} size={23} color={theme.colors.text} />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={{ color: theme.colors.text, fontFamily: "DMSans_700Bold", fontSize: 20 }}>
          {title}
        </Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 21 }}>
          {detail}
        </Text>
      </View>
      {action}
    </View>
  );
}
