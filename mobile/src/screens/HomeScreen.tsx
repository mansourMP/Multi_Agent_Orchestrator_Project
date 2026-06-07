import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { MobileScreen } from "@/src/components/MobileScreen";
import { SectionCard } from "@/src/components/SectionCard";
import { ActionButton } from "@/src/components/system/ActionButton";
import { getPrimaryAgent } from "@/src/lib/agents";
import {
  useMobileConnectionStatus,
  useMobileOverviewData,
  usePrimaryGatewayDoctor,
} from "@/src/lib/mobile-data";
import { useSessionState } from "@/src/lib/session-context";
import { useChatStore } from "@/src/stores/chatStore";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

type OperatorTileProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
};

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSessionState();
  const { approvals, runs } = useMobileOverviewData();
  const gatewayQuery = usePrimaryGatewayDoctor();
  const connectionsQuery = useMobileConnectionStatus("sage");
  const ensureSessionForAgent = useChatStore((state) => state.ensureSessionForAgent);

  const connected = Boolean(session?.runtimeUrl && session?.runtimeKey);
  const primaryAgent = getPrimaryAgent();
  const pendingApprovals = approvals.filter((approval) =>
    String(approval.status || "").toLowerCase().includes("pending"),
  );
  const activeRuns = runs.filter((run) =>
    ["queued", "running", "in_progress", "active"].includes(String(run.status || "").toLowerCase()),
  );
  const liveConnections = (connectionsQuery.data ?? []).filter((item) => item.connected || item.runtime_usable);
  const onlineGateway = Boolean(gatewayQuery.gateway) && isGatewayOnline(gatewayQuery.gateway);

  const openSage = React.useCallback(() => {
    const sessionId = ensureSessionForAgent(primaryAgent);
    router.push(`/chats/${sessionId}` as never);
  }, [ensureSessionForAgent, primaryAgent, router]);

  return (
    <MobileScreen>
      <View style={{ gap: 8 }}>
        <Text style={{ color: theme.colors.textSecondary, fontSize: 13, fontFamily: "DMSans_700Bold" }}>
          Sage
        </Text>
        <Text style={{ color: theme.colors.text, fontSize: 34, lineHeight: 38, fontFamily: "Fraunces_700Bold" }}>
          Your daily operator.
        </Text>
        <Text style={{ color: theme.colors.textSecondary, fontSize: 15, lineHeight: 22 }}>
          Message Sage, approve important actions, and keep apps and channels connected from one place.
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatusPill
          icon={connected ? "cloud-done-outline" : "cloud-offline-outline"}
          label={connected ? "Cloud ready" : "Not connected"}
          tone={connected ? "success" : "muted"}
        />
        <StatusPill
          icon="desktop-outline"
          label={onlineGateway ? "Agent Computer online" : "Agent Computer optional"}
          tone={onlineGateway ? "success" : "muted"}
        />
      </View>

      <TouchableOpacity
        activeOpacity={0.88}
        onPress={connected ? openSage : () => router.push("/session" as never)}
        style={{
          borderRadius: 28,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          padding: 22,
          gap: 18,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: theme.colors.text,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="sparkles" size={22} color={theme.colors.surface} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 21, fontFamily: "DMSans_700Bold" }}>
              {connected ? "Message Sage" : "Connect this phone"}
            </Text>
            <Text style={{ marginTop: 4, color: theme.colors.textSecondary, fontSize: 13.5, lineHeight: 19 }}>
              {connected
                ? "Ask, delegate, schedule, or check what needs approval."
                : "Pair mobile once, then use Sage without desktop UI overhead."}
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={20} color={theme.colors.textSecondary} />
        </View>
      </TouchableOpacity>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <MiniMetric label="Approvals" value={pendingApprovals.length} />
        <MiniMetric label="Active work" value={activeRuns.length} />
        <MiniMetric label="Live links" value={liveConnections.length} />
      </View>

      {pendingApprovals.length > 0 ? (
        <SectionCard
          title={`${pendingApprovals.length} approval${pendingApprovals.length === 1 ? "" : "s"} waiting`}
          subtitle="Sage will not send, change, or execute sensitive work until you approve it."
        >
          <ActionButton
            label="Review approvals"
            icon="checkmark-circle-outline"
            variant="primary"
            onPress={() => router.push("/approvals" as never)}
          />
        </SectionCard>
      ) : null}

      <View style={{ gap: 12 }}>
        <Text style={{ color: theme.colors.text, fontSize: 18, fontFamily: "DMSans_700Bold" }}>
          Start from here
        </Text>
        <View style={{ gap: 10 }}>
          <OperatorTile
            icon="calendar-clear-outline"
            title="Recipes"
            subtitle="Morning brief, email triage, and meeting prep."
            onPress={() => router.push("/recipes" as never)}
          />
          <OperatorTile
            icon="repeat-outline"
            title="Automations"
            subtitle="Scheduled work, recurring reminders, and standing orders."
            onPress={() => router.push("/automations" as never)}
          />
          <OperatorTile
            icon="link-outline"
            title="Connections"
            subtitle="Channels, apps, tools, and Agent Computer status."
            onPress={() => router.push("/integrations" as never)}
          />
        </View>
      </View>
    </MobileScreen>
  );
}

function isGatewayOnline(gateway: Record<string, unknown> | null | undefined) {
  const status = String(gateway?.status ?? gateway?.connection_status ?? "").trim().toLowerCase();
  return ["online", "healthy", "active", "connected"].includes(status);
}

function StatusPill({
  icon,
  label,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: "success" | "muted";
}) {
  const theme = useTheme();
  const color = tone === "success" ? theme.colors.success : theme.colors.textSecondary;
  return (
    <View
      style={{
        flex: 1,
        minHeight: 42,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
      }}
    >
      <Ionicons name={icon} size={15} color={color} />
      <Text style={{ flex: 1, color, fontSize: 11.5, fontFamily: "DMSans_700Bold" }}>{label}</Text>
    </View>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        paddingVertical: 14,
        paddingHorizontal: 12,
        gap: 4,
      }}
    >
      <Text style={{ color: theme.colors.text, fontSize: 22, fontFamily: "DMSans_700Bold" }}>{value}</Text>
      <Text style={{ color: theme.colors.textSecondary, fontSize: 11.5, fontFamily: "DMSans_700Bold" }}>
        {label}
      </Text>
    </View>
  );
}

function OperatorTile({ icon, title, subtitle, onPress }: OperatorTileProps) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={onPress}
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
      }}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: theme.colors.card,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={19} color={theme.colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.text, fontSize: 15.5, fontFamily: "DMSans_700Bold" }}>{title}</Text>
        <Text style={{ marginTop: 2, color: theme.colors.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
    </TouchableOpacity>
  );
}
