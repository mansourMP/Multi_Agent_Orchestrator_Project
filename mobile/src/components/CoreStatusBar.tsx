import { TouchableOpacity, View, Text, ViewStyle } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";

import { mobileApi } from "@/src/lib/api";
import { usePrimaryGatewayDoctor } from "@/src/lib/mobile-data";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

type CoreStatusBarProps = {
  variant?: "bar" | "banner" | "pill" | "dot";
  offlineOnly?: boolean;
  style?: ViewStyle;
};

export function CoreStatusBar({ variant = "bar", offlineOnly = false, style }: CoreStatusBarProps) {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSessionState();
  const gatewayDoctor = usePrimaryGatewayDoctor();
  const enabled = Boolean(session?.runtimeUrl && session?.runtimeKey);

  const { data, isError, isLoading } = useQuery({
    queryKey: ["core-status", session?.runtimeUrl, session?.workspaceId],
    enabled,
    queryFn: async () => mobileApi.getCoreStatus(session!),
    refetchInterval: 10000,
  });

  const connected = enabled && !isError;
  const runtimeOk = Boolean(data?.runtime?.ok);
  const gatewayStatus = String(gatewayDoctor.doctor?.status ?? "").trim().toLowerCase();
  const gatewayApprovals = Number((gatewayDoctor.doctor?.approvals as { pending_count?: number } | undefined)?.pending_count ?? 0);
  const gatewayNeedsAttention = ["offline", "blocked", "degraded"].includes(gatewayStatus);
  const gatewayConnected = gatewayStatus === "healthy";
  const workspaceLabel = session?.workspaceId || "default";
  const statusLabel = isLoading ? "Connecting..." : connected ? "Core Connected" : "Core Offline";
  const dotColor = gatewayDoctor.gateway
    ? gatewayConnected
      ? "#22C55E"
      : gatewayNeedsAttention
        ? "#F59E0B"
        : theme.colors.textSecondary
    : isLoading
      ? theme.colors.textSecondary
      : connected
        ? "#22C55E"
        : theme.colors.textSecondary;
  const actionHref = connected ? "/gateway" : "/session";

  if (offlineOnly && ((connected && !gatewayNeedsAttention) || isLoading || gatewayDoctor.loading)) {
    return null;
  }

  if (variant === "dot") {
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={connected ? "Open gateway status" : "Reconnect workspace"}
        onPress={() => router.push(actionHref)}
        style={[
          {
            width: 20,
            height: 20,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
          },
          style,
        ]}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: dotColor,
          }}
        />
      </TouchableOpacity>
    );
  }

  if (variant === "banner") {
    const bannerTitle = !connected
      ? statusLabel
      : gatewayStatus === "offline"
        ? "Gateway Offline"
        : gatewayStatus === "blocked"
          ? "Gateway Blocked"
          : gatewayStatus === "degraded"
            ? "Gateway Needs Attention"
            : statusLabel;
    const bannerDetail = !connected
      ? `Workspace: ${workspaceLabel}`
      : gatewayNeedsAttention
        ? gatewayApprovals > 0
          ? `${gatewayApprovals} approval${gatewayApprovals === 1 ? "" : "s"} waiting on your workspace.`
          : "Open gateway status to review the paired device and doctor checks."
        : `Workspace: ${workspaceLabel}`;
    return (
      <View
        style={[
          {
            marginTop: 16,
            padding: 16,
            borderRadius: 16,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
          },
          style,
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: dotColor,
            }}
          />
          <Text style={{ fontSize: 13, color: theme.colors.text }}>{bannerTitle}</Text>
        </View>
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>
            {gatewayNeedsAttention || !connected ? bannerDetail : "Runtime ready"}
          </Text>
          {!gatewayNeedsAttention && connected ? (
            <Text style={{ fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 }}>
              Workspace: {workspaceLabel}
            </Text>
          ) : null}
        </View>
        {(!connected || gatewayNeedsAttention) ? (
          <TouchableOpacity
            onPress={() => router.push(actionHref)}
            style={{
              marginTop: 12,
              paddingHorizontal: 12,
              height: 32,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.cardHover,
              alignSelf: "flex-start",
            }}
          >
            <Text style={{ fontSize: 12, color: theme.colors.text }}>{connected ? "Open gateway" : "Reconnect"}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (variant === "pill") {
    return (
      <View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 10,
            height: 28,
            borderRadius: 999,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
          },
          style,
        ]}
      >
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: dotColor,
          }}
        />
        <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>{statusLabel}</Text>
      </View>
    );
  }

  const runtimeReady = isLoading ? "Checking runtime..." : runtimeOk ? "Runtime Ready" : "Runtime Unavailable";

  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: 14,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.background,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: dotColor,
            }}
          />
          <Text style={{ fontSize: 13, color: theme.colors.text }}>{statusLabel}</Text>
        </View>
        {connected ? (
          <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{runtimeReady}</Text>
        ) : (
          <TouchableOpacity
            onPress={() => router.push(actionHref)}
            style={{
              paddingHorizontal: 12,
              height: 30,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.surface,
            }}
          >
            <Text style={{ fontSize: 12, color: theme.colors.text }}>Reconnect</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
