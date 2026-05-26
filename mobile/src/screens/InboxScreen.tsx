import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { MobileScreen } from "@/src/components/MobileScreen";
import { SectionCard } from "@/src/components/SectionCard";
import { PrimaryScreenHeader } from "@/src/components/navigation/PrimaryScreenHeader";
import { ActionButton } from "@/src/components/system/ActionButton";
import { MotionPressable } from "@/src/components/system/MotionPressable";
import { formatRelativeTime } from "@/src/lib/kin-surface";
import { useMobileOverviewData } from "@/src/lib/mobile-data";
import { useSessionState } from "@/src/lib/session-context";
import { useTheme } from "@/src/theme";

type ActivityItem = {
  id: string;
  kind: "approval" | "run" | "artifact";
  title: string;
  subtitle: string;
  timestamp?: string;
  actionLabel?: string;
  onPress?: () => void;
};

export default function InboxScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSessionState();
  const { approvals, runs, artifacts, loading } = useMobileOverviewData();
  const connected = Boolean(session?.runtimeUrl && session?.runtimeKey);

  const items = React.useMemo<ActivityItem[]>(() => {
    const approvalItems: ActivityItem[] = approvals.map((approval) => ({
      id: `approval-${approval.approval_id}`,
      kind: "approval",
      title: approval.action || "Action waiting for you",
      subtitle: approval.summary || "Sage is waiting for your decision before it continues.",
      timestamp: approval.requested_at,
      actionLabel: "Review",
      onPress: () => router.push("/approvals"),
    }));

    const runItems: ActivityItem[] = runs.map((run) => ({
      id: `run-${run.run_id}`,
      kind: "run",
      title: run.summary || "Sage worked on something for you",
      subtitle: "Open Chat to continue or review it.",
      timestamp: run.started_at,
      actionLabel: "Open Chat",
      onPress: () => router.push("/chats"),
    }));

    const artifactItems: ActivityItem[] = artifacts.map((artifact) => ({
      id: `artifact-${artifact.id}`,
      kind: "artifact",
      title: artifact.label || "Saved item",
      subtitle: "Something useful was saved for you.",
      actionLabel: "Open Library",
      onPress: () => router.push("/artifacts"),
    }));

    return [...approvalItems, ...runItems, ...artifactItems]
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
      .slice(0, 12);
  }, [approvals, artifacts, router, runs]);

  return (
    <MobileScreen>
      <PrimaryScreenHeader title="Activity" subtitle="Approvals, recent work, outputs, and device controls." />

      {!connected ? (
        <SectionCard title="Finish setup" subtitle="Connect this phone before live work can appear here.">
          <ActionButton label="Pair phone" icon="link-outline" variant="primary" onPress={() => router.push("/session")} />
        </SectionCard>
      ) : null}

      <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
        <Metric label="Approvals" value={String(approvals.length)} />
        <Metric label="Runs" value={String(runs.length)} />
        <Metric label="Outputs" value={String(artifacts.length)} />
      </View>

      <SectionCard title="Control plane" subtitle="Jump to the surfaces that need direct attention.">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          <ActionButton label="Approvals" icon="checkmark-done-outline" onPress={() => router.push("/approvals")} />
          <ActionButton label="Library" icon="albums-outline" onPress={() => router.push("/artifacts")} />
          <ActionButton label="Gateway" icon="desktop-outline" onPress={() => router.push("/gateway")} />
          <ActionButton label="Notifications" icon="notifications-outline" onPress={() => router.push("/notifications")} />
        </View>
      </SectionCard>

      <SectionCard
        title="Timeline"
        subtitle={
          loading
            ? "Refreshing activity..."
            : items.length
              ? `${items.length} recent item${items.length === 1 ? "" : "s"}`
              : "Nothing new right now."
        }
      >
        {items.length ? (
          items.map((item) => <FeedCard key={item.id} item={item} />)
        ) : (
          <EmptyTimeline connected={connected} />
        )}
      </SectionCard>
    </MobileScreen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        borderRadius: theme.radii.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.panel,
        padding: theme.spacing.md,
        gap: theme.spacing.xs,
      }}
    >
      <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.caption, fontFamily: "DMSans_700Bold" }}>
        {label}
      </Text>
      <Text style={{ color: theme.colors.text, fontSize: 24, fontFamily: "Fraunces_700Bold" }}>{value}</Text>
    </View>
  );
}

function FeedCard({ item }: { item: ActivityItem }) {
  const theme = useTheme();
  const iconName: keyof typeof Ionicons.glyphMap =
    item.kind === "approval" ? "checkmark-done-outline" : item.kind === "artifact" ? "albums-outline" : "sparkles-outline";

  return (
    <MotionPressable
      disabled={!item.onPress}
      onPress={item.onPress}
      style={{
        borderRadius: theme.radii.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.app,
        padding: theme.spacing.md,
        gap: theme.spacing.sm,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.md }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: theme.radii.md,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.panelMuted,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={iconName} size={18} color={theme.colors.text} />
        </View>
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          {item.timestamp ? (
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.caption, fontFamily: "DMSans_700Bold" }}>
              {formatRelativeTime(item.timestamp)}
            </Text>
          ) : null}
          <Text style={{ color: theme.colors.text, fontSize: theme.typography.body, fontFamily: "DMSans_700Bold" }}>
            {item.title}
          </Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta, lineHeight: 20 }}>
            {item.subtitle}
          </Text>
        </View>
        {item.actionLabel ? (
          <Text style={{ color: theme.colors.text, fontSize: theme.typography.caption, fontFamily: "DMSans_700Bold" }}>
            {item.actionLabel}
          </Text>
        ) : null}
      </View>
    </MotionPressable>
  );
}

function EmptyTimeline({ connected }: { connected: boolean }) {
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
      <Ionicons name="pulse-outline" size={22} color={theme.colors.textMuted} />
      <Text style={{ color: theme.colors.text, fontSize: theme.typography.body, fontFamily: "DMSans_700Bold" }}>
        {connected ? "Nothing waiting" : "Activity unavailable"}
      </Text>
      <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.meta, lineHeight: 20 }}>
        {connected ? "Approvals, work, and outputs will collect here." : "Pair this phone to load the control plane."}
      </Text>
    </View>
  );
}
