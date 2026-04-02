import React, { useMemo } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { CoreStatusBar } from "@/src/components/CoreStatusBar";
import { PrimaryScreenHeader } from "@/src/components/navigation/PrimaryScreenHeader";
import { getPrimaryAgent } from "@/src/lib/agents";
import { formatRelativeTime, inferKinCapability } from "@/src/lib/kin-surface";
import { useMobileOverviewData } from "@/src/lib/mobile-data";
import { useChatStore } from "@/src/stores/chatStore";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ChatsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const sessions = useChatStore((state) => state.sessions);
  const createSession = useChatStore((state) => state.createSession);
  const ensureSessionForAgent = useChatStore((state) => state.ensureSessionForAgent);
  const { approvals, artifacts, loading } = useMobileOverviewData();
  const kin = getPrimaryAgent();

  const rows = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((session) => {
          const lastMessage = session.messages[session.messages.length - 1];
          return {
            id: session.id,
            title: session.title || "New thread",
            preview: lastMessage?.speech?.trim() || "",
            timestamp: session.updatedAt,
          };
        }),
    [sessions],
  );

  const pendingApprovals = useMemo(
    () =>
      [...approvals]
        .sort((a, b) => new Date(b.requested_at || 0).getTime() - new Date(a.requested_at || 0).getTime())
        .slice(0, 3),
    [approvals],
  );

  const recentOutputs = useMemo(() => artifacts.slice(0, 4), [artifacts]);

  const handleNewChat = () => {
    const sessionId = createSession(kin);
    router.push(`/kin/${sessionId}`);
  };

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
        title="KIN"
        subtitle="Threads, approvals, and outputs in one workspace."
        action={{
          accessibilityLabel: "Start a new thread",
          icon: "add",
          onPress: handleNewChat,
          variant: "primary",
        }}
      />

      <View
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          padding: 16,
          gap: 14,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, gap: 8 }}>
            <Text
              style={{
                fontSize: 11,
                fontFamily: "DMSans_700Bold",
                color: theme.colors.textSecondary,
                textTransform: "uppercase",
                letterSpacing: 1.1,
              }}
            >
              Quick Start
            </Text>
            <Text style={{ fontSize: 22, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
              Start a focused KIN thread
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 21, color: theme.colors.textSecondary }}>
              Open a clean conversation, review pending approvals, or jump back into a recent thread.
            </Text>
          </View>
          <CoreStatusBar variant="pill" />
        </View>

        <TouchableOpacity
          activeOpacity={0.86}
          onPress={handleNewChat}
          style={{
            height: 44,
            alignSelf: "flex-start",
            paddingHorizontal: 18,
            borderRadius: 999,
            backgroundColor: theme.colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>New thread</Text>
        </TouchableOpacity>
      </View>

      <SectionTitle title="Pending Approvals" />
      <View style={{ marginTop: 10, gap: 10 }}>
        {pendingApprovals.map((approval) => {
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
                {approval.summary || "KIN is waiting for approval before continuing."}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <Text style={{ flex: 1, fontSize: 12, color: theme.colors.textSecondary }}>
                  {formatRelativeTime(approval.requested_at)}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={openKin}
                  style={{
                    height: 38,
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
        {!loading && pendingApprovals.length === 0 ? (
          <EmptyCard label="Approvals that need your sign-off will appear here." />
        ) : null}
      </View>

      <SectionTitle title="Recent Threads" />
      <View style={{ marginTop: 10, gap: 10 }}>
        {rows.slice(0, 6).map((item) => (
          <TouchableOpacity
            key={item.id}
            activeOpacity={0.82}
            onPress={() => router.push(`/kin/${item.id}`)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 14,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 16,
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: kin.avatarColor,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={kin.icon as any} size={20} color="#FFFFFF" />
            </View>

            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <Text style={{ flex: 1, fontSize: 16, fontFamily: "DMSans_700Bold", color: theme.colors.text }} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{formatTimestamp(item.timestamp)}</Text>
              </View>
              <Text
                numberOfLines={1}
                style={{
                  marginTop: 4,
                  fontSize: 13,
                  lineHeight: 19,
                  color: theme.colors.textSecondary,
                }}
              >
                {item.preview || "Fresh thread ready for work."}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {!rows.length ? (
          <View
            style={{
              padding: 16,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              gap: 10,
            }}
          >
            <Text style={{ fontSize: 16, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>No threads yet</Text>
            <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
              Start one thread when you need KIN to reason, draft, plan, or review.
            </Text>
            <TouchableOpacity
              activeOpacity={0.86}
              onPress={handleNewChat}
              style={{
                height: 40,
                alignSelf: "flex-start",
                paddingHorizontal: 16,
                borderRadius: 999,
                backgroundColor: theme.colors.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>New thread</Text>
            </TouchableOpacity>
          </View>
        ) : null}
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
        {!loading && recentOutputs.length === 0 ? <EmptyCard label="Useful outputs will appear here as KIN finishes work." /> : null}
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
