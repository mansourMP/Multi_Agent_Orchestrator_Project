import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getPrimaryAgent } from "@/src/lib/agents";
import { mobileApi } from "@/src/lib/api";
import { useKinPreferences } from "@/src/lib/kin-preferences";
import {
  formatRelativeTime,
  formatRunStatus,
  inferKinCapability,
  isActiveRunStatus,
  isCompletedRunStatus,
} from "@/src/lib/kin-surface";
import { useMobileOverviewData } from "@/src/lib/mobile-data";
import { getPreviewAppRecord, normalizeAppRecord } from "@/src/lib/appRegistry";
import { useSessionState } from "@/src/lib/session-context";
import type { AppRecord } from "@/src/lib/types";
import { useChatStore } from "@/src/stores/chatStore";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";
import { BrandedAppIcon } from "@/src/components/apps/BrandedAppIcon";

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSessionState();
  const { preferences } = useKinPreferences();
  const { runs, approvals, artifacts, loading } = useMobileOverviewData();
  const ensureSessionForAgent = useChatStore((state) => state.ensureSessionForAgent);
  const [featuredApps, setFeaturedApps] = React.useState<AppRecord[]>([]);
  const connected = Boolean(session?.runtimeUrl && session?.runtimeKey);
  const kin = getPrimaryAgent();
  const selectedAppIds = React.useMemo(
    () => (preferences.activeAppIds.length ? preferences.activeAppIds : ["study", "health", "finance", "travel"]),
    [preferences.activeAppIds],
  );

  const dateLabel = React.useMemo(
    () =>
      new Date().toLocaleDateString([], {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [],
  );

  React.useEffect(() => {
    let active = true;

    async function loadApps() {
      const fallbackApps = selectedAppIds
        .map((id) => getPreviewAppRecord(id))
        .filter((item): item is AppRecord => Boolean(item));

      if (!connected || !session?.runtimeUrl || !session?.runtimeKey) {
        if (active) {
          setFeaturedApps(fallbackApps);
        }
        return;
      }

      try {
        const installedRes = await mobileApi.getInstalledApps(session);
        const installedById = new Map(
          (installedRes.items ?? [])
            .map((app: any) => normalizeAppRecord(app, "core"))
            .filter((item): item is AppRecord => Boolean(item))
            .map((app) => [app.id, app] as const),
        );

        if (active) {
          setFeaturedApps(
            selectedAppIds
              .map((id) => installedById.get(id) || getPreviewAppRecord(id))
              .filter((item): item is AppRecord => Boolean(item)),
          );
        }
      } catch {
        if (active) {
          setFeaturedApps(fallbackApps);
        }
      }
    }

    void loadApps();

    return () => {
      active = false;
    };
  }, [connected, selectedAppIds, session]);

  const approvalQueue = React.useMemo(
    () =>
      [...approvals]
        .sort((a, b) => new Date(b.requested_at || 0).getTime() - new Date(a.requested_at || 0).getTime())
        .slice(0, 3),
    [approvals],
  );

  const activeRuns = React.useMemo(
    () =>
      [...runs]
        .filter((run) => isActiveRunStatus(run.status))
        .sort((a, b) => new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime())
        .slice(0, 4),
    [runs],
  );

  const importantChanges = React.useMemo(
    () =>
      [...runs]
        .filter((run) => isCompletedRunStatus(run.status))
        .sort((a, b) => new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime())
        .slice(0, 3),
    [runs],
  );

  const recentOutputs = React.useMemo(() => artifacts.slice(0, 4), [artifacts]);

  const openKin = React.useCallback(() => {
    const sessionId = ensureSessionForAgent(kin);
    router.push(`/kin/${sessionId}`);
  }, [ensureSessionForAgent, kin, router]);

  const heroText = connected
    ? `KIN has ${approvalQueue.length} approvals waiting, ${activeRuns.length} active runs, and ${featuredApps.length} active apps configured.`
    : "Connect your private core to turn Home into a live brief with approvals, active work, and saved outputs.";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 36 }}
      showsVerticalScrollIndicator={false}
    >
      <View>
        <Text style={{ fontSize: 30, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>Home</Text>
        <Text style={{ marginTop: 4, fontSize: 15, color: theme.colors.textSecondary }}>{dateLabel}</Text>
      </View>

      <View
        style={{
          marginTop: 20,
          padding: 20,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontFamily: "DMSans_700Bold",
            color: theme.colors.textSecondary,
            textTransform: "uppercase",
            letterSpacing: 1.1,
          }}
        >
          Daily brief
        </Text>
        <Text style={{ marginTop: 10, fontSize: 36, fontFamily: "DMSans_700Bold", color: theme.colors.text, lineHeight: 40 }}>
          KIN keeps the system calm.
        </Text>
        <Text style={{ marginTop: 10, fontSize: 14, color: theme.colors.textSecondary, lineHeight: 22 }}>{heroText}</Text>

        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 18 }}>
          <View
            style={{
              width: "31%",
              borderRadius: 16,
              padding: 14,
              backgroundColor: theme.colors.background,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ fontSize: 11, color: theme.colors.textSecondary, textTransform: "uppercase", letterSpacing: 1.1 }}
            >
              Approvals
            </Text>
            <Text style={{ marginTop: 8, fontSize: 24, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
              {approvalQueue.length}
            </Text>
          </View>
          <View
            style={{
              width: "31%",
              borderRadius: 16,
              padding: 14,
              backgroundColor: theme.colors.background,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ fontSize: 11, color: theme.colors.textSecondary, textTransform: "uppercase", letterSpacing: 1.1 }}
            >
              Running
            </Text>
            <Text style={{ marginTop: 8, fontSize: 24, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
              {activeRuns.length}
            </Text>
          </View>
          <View
            style={{
              width: "31%",
              borderRadius: 16,
              padding: 14,
              backgroundColor: theme.colors.background,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ fontSize: 11, color: theme.colors.textSecondary, textTransform: "uppercase", letterSpacing: 1.1 }}
            >
              Outputs
            </Text>
            <Text style={{ marginTop: 8, fontSize: 24, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
              {recentOutputs.length}
            </Text>
          </View>
        </View>
      </View>

      <SectionTitle title="Work In Progress" />
      <View style={{ marginTop: 12, gap: 10 }}>
        {loading && !activeRuns.length ? <EmptyCard label="Loading live runs..." /> : null}
        {activeRuns.map((run) => {
          const capability = inferKinCapability(run.agent_role, run.summary);
          return (
            <View
              key={run.run_id}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                padding: 16,
                gap: 10,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <CapabilityBadge label={capability.label} icon={capability.icon} color={capability.color} />
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{formatRunStatus(run.status)}</Text>
              </View>
              <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                {run.summary || "KIN is working on a request."}
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
                Started {formatRelativeTime(run.started_at)}
              </Text>
              <TouchableOpacity
                activeOpacity={0.86}
                onPress={openKin}
                style={{
                  height: 44,
                  paddingHorizontal: 18,
                  alignSelf: "flex-start",
                  borderRadius: 999,
                  backgroundColor: theme.colors.accent,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>View in KIN</Text>
              </TouchableOpacity>
            </View>
          );
        })}
        {!loading && connected && activeRuns.length === 0 ? <EmptyCard label="Nothing is running right now." /> : null}
      </View>

      <SectionTitle title="Approval Queue" />
      <View style={{ marginTop: 12, gap: 10 }}>
        {approvalQueue.map((approval) => {
          const capability = inferKinCapability(approval.action, approval.summary);
          return (
            <View
              key={approval.approval_id}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                padding: 16,
                gap: 10,
              }}
            >
              <CapabilityBadge label={capability.label} icon={capability.icon} color={capability.color} />
              <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                {approval.action}
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
                {approval.summary || "KIN is waiting for approval before it continues."}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{formatRelativeTime(approval.requested_at)}</Text>
                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={openKin}
                  style={{
                    height: 44,
                    paddingHorizontal: 18,
                    borderRadius: 999,
                    backgroundColor: theme.colors.accent,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>Review</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
        {!loading && approvalQueue.length === 0 ? <EmptyCard label="No approvals are waiting." /> : null}
      </View>

      <SectionTitle title="Important Changes" />
      <View style={{ marginTop: 12, gap: 10 }}>
        {importantChanges.map((run) => {
          const capability = inferKinCapability(run.agent_role, run.summary);
          return (
            <View
              key={run.run_id}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                padding: 16,
                gap: 10,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <CapabilityBadge label={capability.label} icon={capability.icon} color={capability.color} />
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{formatRunStatus(run.status)}</Text>
              </View>
              <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                {run.summary || "KIN finished a run."}
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
                {formatRelativeTime(run.started_at)}
              </Text>
            </View>
          );
        })}
        {!loading && connected && importantChanges.length === 0 ? <EmptyCard label="Important changes will land here once KIN finishes work." /> : null}
      </View>

      <SectionTitle title="App Shortcuts" />
      <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {featuredApps.map((app) => {
          const needsUpdate = Boolean(app.latestVersion && app.latestVersion !== app.version);
          return (
            <TouchableOpacity
              key={app.id}
              activeOpacity={0.86}
              onPress={() => {
                if (connected && app.status === "installed" && !needsUpdate) {
                  router.push(`/apps/${app.id}/home`);
                  return;
                }
                router.push(`/apps/${app.id}`);
              }}
              style={{
                width: "47%",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                padding: 16,
              }}
            >
              <BrandedAppIcon appId={app.id} icon={app.icon ?? "apps-outline"} size={54} />
              <Text style={{ marginTop: 16, fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                {app.name}
              </Text>
              <Text style={{ marginTop: 4, fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary }}>
                {app.status === "installed" && !needsUpdate ? "Ready in KIN" : needsUpdate ? "Update available" : "Available to activate"}
              </Text>
            </TouchableOpacity>
          );
        })}
        {!featuredApps.length ? <EmptyCard label="Pick active apps in Profile to pin them here." /> : null}
      </View>

      <SectionTitle title="Recent Outputs" />
      <View style={{ marginTop: 12, gap: 10 }}>
        {recentOutputs.map((artifact) => {
          const capability = inferKinCapability(artifact.kind, artifact.label);
          return (
            <View
              key={artifact.id}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                padding: 16,
                gap: 10,
              }}
            >
              <CapabilityBadge label={capability.label} icon={capability.icon} color={capability.color} />
              <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                {artifact.label}
              </Text>
              <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                {artifact.kind ? `Saved as ${artifact.kind}` : "Saved output"}
              </Text>
            </View>
          );
        })}
        {!loading && connected && recentOutputs.length === 0 ? <EmptyCard label="Saved outputs will appear here." /> : null}
      </View>
    </ScrollView>
  );
}

function SectionTitle({ title }: { title: string }) {
  const theme = useTheme();

  return (
    <Text
      style={{
        marginTop: 28,
        fontSize: 11,
        fontFamily: "DMSans_700Bold",
        color: theme.colors.textSecondary,
        textTransform: "uppercase",
        letterSpacing: 1.1,
      }}
    >
      {title}
    </Text>
  );
}

function CapabilityBadge({
  label,
  icon,
  color,
}: {
  label: string;
  icon: string;
  color: string;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.cardHover,
      }}
    >
      <Ionicons name={icon as any} size={14} color={color} />
      <Text style={{ fontSize: 12, color: theme.colors.text, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

function EmptyCard({ label }: { label: string }) {
  const theme = useTheme();

  return (
    <View
      style={{
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <Text style={{ fontSize: 14, color: theme.colors.textSecondary }}>{label}</Text>
    </View>
  );
}
