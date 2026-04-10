import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { BrandedAppIcon } from "@/src/components/apps/BrandedAppIcon";
import { PrimaryScreenHeader } from "@/src/components/navigation/PrimaryScreenHeader";
import { getPrimaryAgent } from "@/src/lib/agents";
import { getPreviewAppRecord, normalizeAppRecord } from "@/src/lib/appRegistry";
import { appRegistryApi } from "@/src/lib/appRegistryApi";
import { useKinPreferences } from "@/src/lib/kin-preferences";
import {
  formatRelativeTime,
  formatRunStatus,
  inferKinCapability,
  isActiveRunStatus,
  isCompletedRunStatus,
} from "@/src/lib/kin-surface";
import { useMobileChatContext, useMobileOverviewData } from "@/src/lib/mobile-data";
import { useSessionState } from "@/src/lib/session-context";
import type { ActivitySummary, AppRecord, RuntimeAttachmentSummary, UnifiedMemorySummary } from "@/src/lib/types";
import { useChatStore } from "@/src/stores/chatStore";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

const DEFAULT_ACTIVE_APP_IDS = ["study", "health", "finance", "travel"];

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSessionState();
  const { preferences } = useKinPreferences();
  const { runs, approvals, artifacts, loading } = useMobileOverviewData();
  const chatContextQuery = useMobileChatContext();
  const ensureSessionForAgent = useChatStore((state) => state.ensureSessionForAgent);
  const [featuredApps, setFeaturedApps] = React.useState<AppRecord[]>([]);
  const connected = Boolean(session?.runtimeUrl && session?.runtimeKey);
  const kin = getPrimaryAgent();
  const runtimeAttachments = chatContextQuery.data?.runtimeAttachments;
  const recentActivity = chatContextQuery.data?.recentActivity;
  const unifiedMemory = chatContextQuery.data?.unifiedMemory;
  const scheduler = chatContextQuery.data?.scheduler;
  const selectedAppIds = React.useMemo(
    () => (preferences.activeAppIds.length ? preferences.activeAppIds : DEFAULT_ACTIVE_APP_IDS),
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
        const installedRes = await appRegistryApi.getInstalledApps(session);
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
  const continuity = React.useMemo(
    () => summarizeRuntimeContinuity(connected, runtimeAttachments),
    [connected, runtimeAttachments],
  );
  const recentCaptainActivity = React.useMemo(
    () => (recentActivity?.items ?? []).slice(0, 3),
    [recentActivity?.items],
  );
  const privacySummary = React.useMemo(
    () => summarizeMemoryBoundary(unifiedMemory),
    [unifiedMemory],
  );
  const queuedWakeups = React.useMemo(() => {
    const value = Number(scheduler?.wakeQueue?.pending_count ?? 0);
    return Number.isFinite(value) ? value : 0;
  }, [scheduler?.wakeQueue?.pending_count]);

  const openKin = React.useCallback(() => {
    const sessionId = ensureSessionForAgent(kin);
    router.push(`/chats/${sessionId}`);
  }, [ensureSessionForAgent, kin, router]);

  const briefTitle = connected ? continuity.title : "Connect your private core";
  const briefText = connected
    ? `${continuity.detail} Sage has ${approvalQueue.length} approvals waiting, ${activeRuns.length} live runs, and ${recentCaptainActivity.length} recent captain updates${queuedWakeups > 0 ? ` with ${queuedWakeups} background wake${queuedWakeups === 1 ? "" : "s"} queued.` : "."}`
    : "Connect your runtime to populate Home with live approvals, active work, and saved outputs.";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 36 }}
      showsVerticalScrollIndicator={false}
    >
      <PrimaryScreenHeader title="Home" subtitle={dateLabel} />

      <View style={{ flexDirection: "row", gap: 10 }}>
        <SummaryStat label="Approvals" value={approvalQueue.length} />
        <SummaryStat label="Running" value={activeRuns.length} />
        <SummaryStat label="Outputs" value={recentOutputs.length} />
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
        <QuickLink label="Approvals" onPress={() => router.push("/approvals" as never)} />
        <QuickLink label="Artifacts" onPress={() => router.push("/artifacts" as never)} />
        <QuickLink label="Machines" onPress={() => router.push("/machines" as never)} />
        <QuickLink label="Connectors" onPress={() => router.push("/connectors" as never)} />
      </View>

      <View
        style={{
          marginTop: 12,
          padding: 16,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          gap: 8,
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
          Daily Brief
        </Text>
        <Text style={{ fontSize: 22, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>{briefTitle}</Text>
        <Text style={{ fontSize: 14, lineHeight: 21, color: theme.colors.textSecondary }}>{briefText}</Text>
        {connected ? (
          <Text style={{ fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary }}>
            {privacySummary}
          </Text>
        ) : null}
      </View>

      {!connected ? (
        <View
          style={{
            marginTop: 12,
            padding: 16,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            gap: 10,
          }}
        >
          <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
            Live data is offline
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
            Pair and connect your core to turn Home into a real operations view.
          </Text>
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={() => router.push("/session")}
            style={{
              height: 42,
              alignSelf: "flex-start",
              paddingHorizontal: 16,
              borderRadius: 999,
              backgroundColor: theme.colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>Pair &amp; Connect</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {connected ? (
        <>
          <SectionTitle title="Continuity" />
          <View style={{ marginTop: 10, gap: 10 }}>
            <View
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                padding: 16,
                gap: 10,
              }}
            >
              <CapabilityBadge
                label={continuity.modeLabel}
                icon={continuity.icon}
                color={continuity.color}
              />
              <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                {continuity.title}
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
                {continuity.detail}
              </Text>
              <Text style={{ fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary }}>
                {continuity.attachmentSummary}
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={() => router.push("/status")}
                  style={{
                    height: 38,
                    paddingHorizontal: 14,
                    borderRadius: 999,
                    backgroundColor: theme.colors.accent,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>Open Status</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={() => router.push("/notifications")}
                  style={{
                    height: 38,
                    paddingHorizontal: 14,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: "700" }}>Review Feed</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <SectionTitle title="Recent Captain Activity" />
          <View style={{ marginTop: 10, gap: 10 }}>
            {recentCaptainActivity.map((item) => (
              <View
                key={item.id}
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  padding: 16,
                  gap: 10,
                }}
              >
                <CapabilityBadge
                  label={formatActivityActor(item)}
                  icon={activityIcon(item)}
                  color={activityColor(item)}
                />
                <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                  {item.title || item.summary || "Captain activity"}
                </Text>
                <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
                  {item.summary || "A new bounded activity summary is ready."}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <Text style={{ flex: 1, fontSize: 12, color: theme.colors.textSecondary }}>
                    {item.created_at ? formatRelativeTime(item.created_at) : "Just now"}
                  </Text>
                  <Text style={{ fontSize: 12, color: item.review_required ? theme.colors.warning : theme.colors.textSecondary }}>
                    {item.review_required ? "Review needed" : `${item.artifacts.length} artifact${item.artifacts.length === 1 ? "" : "s"}`}
                  </Text>
                </View>
              </View>
            ))}
            {!chatContextQuery.isLoading && recentCaptainActivity.length === 0 ? (
              <EmptyCard label="Captain activity summaries will appear here once Sage or a specialist finishes work." />
            ) : null}
          </View>

          <SectionTitle title="Needs Attention" />
          <View style={{ marginTop: 10, gap: 10 }}>
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
                    {approval.summary || "Sage is waiting for approval before it continues."}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <Text style={{ flex: 1, fontSize: 12, color: theme.colors.textSecondary }}>
                      {formatRelativeTime(approval.requested_at)}
                    </Text>
                    <TouchableOpacity
                      activeOpacity={0.86}
                      onPress={openKin}
                      style={{
                        height: 40,
                        paddingHorizontal: 16,
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

          <SectionTitle title="Running Now" />
          <View style={{ marginTop: 10, gap: 10 }}>
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
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <CapabilityBadge label={capability.label} icon={capability.icon} color={capability.color} />
                    <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{formatRunStatus(run.status)}</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                    {run.summary || "Sage is working on a request."}
                  </Text>
                  <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
                    Started {formatRelativeTime(run.started_at)}
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.86}
                    onPress={openKin}
                    style={{
                      height: 40,
                      paddingHorizontal: 16,
                      alignSelf: "flex-start",
                      borderRadius: 999,
                      backgroundColor: theme.colors.accent,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    >
                    <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>Open Sage</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            {!loading && activeRuns.length === 0 ? <EmptyCard label="Nothing is running right now." /> : null}
          </View>

          <SectionTitle title="Recent Outputs" />
          <View style={{ marginTop: 10, gap: 10 }}>
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
            {!loading && recentOutputs.length === 0 ? <EmptyCard label="Saved outputs will appear here." /> : null}
          </View>

          <SectionTitle title="Important Changes" />
          <View style={{ marginTop: 10, gap: 10 }}>
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
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <CapabilityBadge label={capability.label} icon={capability.icon} color={capability.color} />
                    <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{formatRunStatus(run.status)}</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                    {run.summary || "Sage finished a run."}
                  </Text>
                  <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
                    {formatRelativeTime(run.started_at)}
                  </Text>
                </View>
              );
            })}
            {!loading && importantChanges.length === 0 ? <EmptyCard label="Important changes will land here once Sage finishes work." /> : null}
          </View>
        </>
      ) : null}

      <SectionTitle title="Pinned Apps" />
      <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
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
                padding: 14,
              }}
            >
              <BrandedAppIcon appId={app.id} icon={app.icon ?? "apps-outline"} size={54} />
              <Text style={{ marginTop: 14, fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                {app.name}
              </Text>
              <Text style={{ marginTop: 4, fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary }}>
                {app.status === "installed" && !needsUpdate
                  ? "Ready in Sage"
                  : needsUpdate
                    ? "Update available"
                    : "Available to activate"}
              </Text>
            </TouchableOpacity>
          );
        })}
        {!featuredApps.length ? <EmptyCard label="Pick active apps in Profile to pin them here." /> : null}
      </View>
    </ScrollView>
  );
}

function QuickLink({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={onPress}
      style={{
        height: 38,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: "700" }}>{label}</Text>
    </TouchableOpacity>
  );
}

function SectionTitle({ title }: { title: string }) {
  const theme = useTheme();

  return (
    <Text
      style={{
        marginTop: 22,
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

function SummaryStat({ label, value }: { label: string; value: number }) {
  const theme = useTheme();

  return (
    <View
      style={{
        flex: 1,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontSize: 11,
          color: theme.colors.textSecondary,
          textTransform: "uppercase",
          letterSpacing: 1.1,
          fontFamily: "DMSans_700Bold",
        }}
      >
        {label}
      </Text>
      <Text style={{ marginTop: 8, fontSize: 24, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
        {value}
      </Text>
    </View>
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

function humanizeToken(value: string | undefined): string {
  return String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase()) || "Unknown";
}

function formatDeploymentMode(value: string | undefined): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "cloud_only") return "Cloud + Phone";
  if (normalized === "local_only") return "Local Core";
  if (normalized === "hybrid") return "Hybrid Core";
  if (normalized === "self_hosted_business") return "Self-Hosted";
  return "Connected Core";
}

function summarizeRuntimeContinuity(
  connected: boolean,
  runtimeAttachments:
    | {
        deploymentMode?: string;
        attachments: RuntimeAttachmentSummary[];
      }
    | undefined,
) {
  if (!connected) {
    return {
      title: "Connect your private core",
      detail: "Mobile stays the same captain surface, but it needs a paired runtime before live work, activity, and memory continuity can appear.",
      modeLabel: "Offline",
      attachmentSummary: "No runtime is attached to this phone yet.",
      icon: "cloud-offline-outline",
      color: "#F59E0B",
    };
  }

  const attachments = runtimeAttachments?.attachments ?? [];
  const deploymentMode = runtimeAttachments?.deploymentMode;
  const localAttachments = attachments.filter((item) => item.attachment_kind === "local_companion");
  const healthyLocalCount = localAttachments.filter((item) => item.healthy !== false && item.online !== false).length;
  const healthyAttachmentCount = attachments.filter((item) => item.healthy !== false).length;
  const degradedLocal = localAttachments.length > 0 && healthyLocalCount === 0;
  const modeLabel = formatDeploymentMode(deploymentMode);

  if (degradedLocal) {
    return {
      title: "Hybrid continuity is degraded",
      detail: "Sage stays the same across phone and desktop, but local-private execution is currently unavailable until your paired companion comes back online.",
      modeLabel,
      attachmentSummary: `${healthyAttachmentCount}/${Math.max(attachments.length, 1)} attachments are healthy. ${localAttachments.length} local attachment${localAttachments.length === 1 ? "" : "s"} detected.`,
      icon: "warning-outline",
      color: "#F59E0B",
    };
  }

  return {
    title: `${modeLabel} is ready`,
    detail: "Requests from mobile keep the same runtime and policy semantics as desktop. Capability comes from the attached runtimes, not from the phone surface.",
    modeLabel,
    attachmentSummary: `${healthyAttachmentCount}/${Math.max(attachments.length, 1)} attachments are healthy${localAttachments.length > 0 ? `, with ${healthyLocalCount} local companion${healthyLocalCount === 1 ? "" : "s"} online.` : "."}`,
    icon: "sync-outline",
    color: "#10B981",
  };
}

function summarizeMemoryBoundary(unifiedMemory: UnifiedMemorySummary | undefined): string {
  if (!unifiedMemory) {
    return "Memory boundaries will appear after Sage syncs the shared captain context.";
  }
  const localOnly = unifiedMemory.boundaryMap.neverSyncByDefault.length;
  const cloudSynced = unifiedMemory.boundaryMap.cloudSyncedByDefault.length;
  const optIn = unifiedMemory.boundaryMap.explicitOptIn.length;
  return `${localOnly} memory layer${localOnly === 1 ? "" : "s"} stay local by default, ${cloudSynced} cloud-safe layer${cloudSynced === 1 ? "" : "s"} sync by default, and ${optIn} layer${optIn === 1 ? "" : "s"} still require explicit opt-in.`;
}

function formatActivityActor(item: ActivitySummary): string {
  if (item.actor_type === "sage") return "Sage";
  if (item.actor_type === "specialist") return item.actor_id ? `Specialist · ${humanizeToken(item.actor_id)}` : "Specialist";
  if (item.actor_type === "application") return item.actor_id ? `App · ${humanizeToken(item.actor_id)}` : "Application";
  return humanizeToken(item.actor_type || item.event_class || "activity");
}

function activityIcon(item: ActivitySummary): string {
  if (item.review_required) return "alert-circle-outline";
  if ((item.artifacts || []).length > 0) return "document-text-outline";
  if (item.event_class === "delegation") return "git-branch-outline";
  if (item.event_class === "memory_update") return "albums-outline";
  return "sparkles-outline";
}

function activityColor(item: ActivitySummary): string {
  if (item.review_required) return "#F59E0B";
  if ((item.artifacts || []).length > 0) return "#14B8A6";
  return "#10B981";
}
