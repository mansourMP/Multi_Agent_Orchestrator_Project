import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { PrimaryScreenHeader } from "@/src/components/navigation/PrimaryScreenHeader";
import { getPrimaryAgent } from "@/src/lib/agents";
import {
  formatRelativeTime,
  formatRunStatus,
  inferKinCapability,
  isActiveRunStatus,
  isCompletedRunStatus,
} from "@/src/lib/kin-surface";
import { useMobileOverviewData } from "@/src/lib/mobile-data";
import { useSessionState } from "@/src/lib/session-context";
import { useChatStore } from "@/src/stores/chatStore";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export default function InboxScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSessionState();
  const ensureSessionForAgent = useChatStore((state) => state.ensureSessionForAgent);
  const { approvals, runs, artifacts, loading } = useMobileOverviewData();
  const connected = Boolean(session?.runtimeUrl && session?.runtimeKey);
  const kin = getPrimaryAgent();

  const approvalQueue = React.useMemo(
    () =>
      [...approvals].sort((a, b) => new Date(b.requested_at || 0).getTime() - new Date(a.requested_at || 0).getTime()),
    [approvals],
  );

  const liveRuns = React.useMemo(
    () =>
      [...runs]
        .filter((run) => isActiveRunStatus(run.status))
        .sort((a, b) => new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime()),
    [runs],
  );

  const completedRuns = React.useMemo(
    () =>
      [...runs]
        .filter((run) => isCompletedRunStatus(run.status))
        .sort((a, b) => new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime()),
    [runs],
  );

  const openKin = React.useCallback(() => {
    const sessionId = ensureSessionForAgent(kin);
    router.push(`/kin/${sessionId}`);
  }, [ensureSessionForAgent, kin, router]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 36 }}
      showsVerticalScrollIndicator={false}
    >
      <PrimaryScreenHeader
        title="Inbox"
        subtitle="Approvals, completed work, and saved outputs in one trust layer."
      />

      {!connected ? (
        <View
          style={{
            marginTop: 4,
            padding: 18,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Text style={{ fontSize: 16, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>Connect your core first</Text>
          <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 22, color: theme.colors.textSecondary }}>
            Inbox becomes your trust layer once KIN can sync runs, approvals, and outputs from your private runtime.
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/session")}
            style={{
              marginTop: 14,
              height: 44,
              alignSelf: "flex-start",
              paddingHorizontal: 18,
              borderRadius: 999,
              backgroundColor: theme.colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>Connected Accounts</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <SectionTitle title="Approvals" />
      <View style={{ marginTop: 12, gap: 10 }}>
        {approvalQueue.slice(0, 6).map((approval) => {
          const capability = inferKinCapability(approval.action, approval.summary);
          return (
            <ActivityCard
              key={approval.approval_id}
              title={approval.action}
              subtitle={approval.summary || "KIN is waiting for approval before it continues."}
              meta={formatRelativeTime(approval.requested_at)}
              status="Needs approval"
              capability={capability}
              actionLabel="Review in KIN"
              onPress={openKin}
            />
          );
        })}
        {!loading && approvalQueue.length === 0 ? <EmptyCard label="No approvals are waiting." /> : null}
      </View>

      <SectionTitle title="Running Now" />
      <View style={{ marginTop: 12, gap: 10 }}>
        {liveRuns.slice(0, 6).map((run) => {
          const capability = inferKinCapability(run.agent_role, run.summary);
          return (
            <ActivityCard
              key={run.run_id}
              title={run.summary || "KIN is working on a request."}
              subtitle={`Status: ${formatRunStatus(run.status)}`}
              meta={formatRelativeTime(run.started_at)}
              status={formatRunStatus(run.status)}
              capability={capability}
              actionLabel="Open KIN"
              onPress={openKin}
            />
          );
        })}
        {!loading && connected && liveRuns.length === 0 ? <EmptyCard label="No active runs right now." /> : null}
      </View>

      <SectionTitle title="Completed Work" />
      <View style={{ marginTop: 12, gap: 10 }}>
        {completedRuns.slice(0, 6).map((run) => {
          const capability = inferKinCapability(run.agent_role, run.summary);
          return (
            <ActivityCard
              key={run.run_id}
              title={run.summary || "Completed run"}
              subtitle="Finished and ready for review."
              meta={formatRelativeTime(run.started_at)}
              status={formatRunStatus(run.status)}
              capability={capability}
              actionLabel="Open KIN"
              onPress={openKin}
            />
          );
        })}
        {!loading && connected && completedRuns.length === 0 ? <EmptyCard label="Completed work will collect here." /> : null}
      </View>

      <SectionTitle title="Saved Outputs" />
      <View style={{ marginTop: 12, gap: 10 }}>
        {artifacts.slice(0, 6).map((artifact) => {
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
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <CapabilityBadge label={capability.label} icon={capability.icon} color={capability.color} />
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                  {artifact.kind ? artifact.kind : "Output"}
                </Text>
              </View>
              <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>{artifact.label}</Text>
            </View>
          );
        })}
        {!loading && connected && artifacts.length === 0 ? <EmptyCard label="Saved outputs will appear here." /> : null}
      </View>
    </ScrollView>
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

function ActivityCard({
  title,
  subtitle,
  meta,
  status,
  capability,
  actionLabel,
  onPress,
}: {
  title: string;
  subtitle: string;
  meta: string;
  status: string;
  capability: { label: string; icon: string; color: string };
  actionLabel: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
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
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <CapabilityBadge label={capability.label} icon={capability.icon} color={capability.color} />
        <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{status}</Text>
      </View>
      <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>{title}</Text>
      <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>{subtitle}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{meta}</Text>
        <TouchableOpacity
          activeOpacity={0.86}
          onPress={onPress}
          style={{
            height: 44,
            paddingHorizontal: 18,
            borderRadius: 999,
            backgroundColor: theme.colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>{actionLabel}</Text>
        </TouchableOpacity>
      </View>
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
