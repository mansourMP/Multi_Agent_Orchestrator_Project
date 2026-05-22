import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { PrimaryScreenHeader } from "@/src/components/navigation/PrimaryScreenHeader";
import { formatRelativeTime } from "@/src/lib/kin-surface";
import { useMobileOverviewData } from "@/src/lib/mobile-data";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

type ActivityItem = {
  id: string;
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
      title: approval.action || "Action waiting for you",
      subtitle: approval.summary || "Sage is waiting for your decision before it continues.",
      timestamp: approval.requested_at,
      actionLabel: "Open Chat",
      onPress: () => router.push("/chats"),
    }));

    const runItems: ActivityItem[] = runs.map((run) => ({
      id: `run-${run.run_id}`,
      title: run.summary || "Sage worked on something for you",
      subtitle: "Open Chat to continue or review it.",
      timestamp: run.started_at,
      actionLabel: "Open Chat",
      onPress: () => router.push("/chats"),
    }));

    const artifactItems: ActivityItem[] = artifacts.map((artifact) => ({
      id: `artifact-${artifact.id}`,
      title: artifact.label || "Saved item",
      subtitle: "Something useful was saved for you.",
      timestamp: undefined,
    }));

    return [...approvalItems, ...runItems, ...artifactItems]
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
      .slice(0, 12);
  }, [approvals, artifacts, router, runs]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 36 }}
      showsVerticalScrollIndicator={false}
    >
      <PrimaryScreenHeader title="Inbox" subtitle="Simple updates from Sage and your phone." />

      {!connected ? (
        <FeedCard
          title="Finish setup to see updates"
          subtitle="Once your phone is connected, important updates will appear here."
          actionLabel="Open Phone Access"
          onPress={() => router.push("/session")}
        />
      ) : null}

      {connected && !loading && items.length === 0 ? (
        <FeedCard
          title="Nothing new right now"
          subtitle="When something important happens, it will appear here."
        />
      ) : null}

      <View style={{ marginTop: 4, gap: 10 }}>
        {items.map((item) => (
          <FeedCard
            key={item.id}
            title={item.title}
            subtitle={item.subtitle}
            meta={item.timestamp ? formatRelativeTime(item.timestamp) : ""}
            actionLabel={item.actionLabel}
            onPress={item.onPress}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function FeedCard({
  title,
  subtitle,
  meta,
  actionLabel,
  onPress,
}: {
  title: string;
  subtitle: string;
  meta?: string;
  actionLabel?: string;
  onPress?: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: 16,
        gap: 10,
      }}
    >
      <View style={{ gap: 5 }}>
        {meta ? <Text style={{ fontSize: 11.5, fontFamily: "DMSans_700Bold", color: theme.colors.textSecondary }}>{meta}</Text> : null}
        <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>{title}</Text>
        <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>{subtitle}</Text>
      </View>
      {actionLabel && onPress ? (
        <TouchableOpacity
          activeOpacity={0.86}
          onPress={onPress}
          style={{
            alignSelf: "flex-start",
            height: 40,
            paddingHorizontal: 16,
            borderRadius: 999,
            backgroundColor: theme.colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 12.5, fontWeight: "700" }}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
