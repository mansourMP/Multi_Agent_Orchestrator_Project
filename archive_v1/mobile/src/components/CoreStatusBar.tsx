import { TouchableOpacity, View, Text, ViewStyle } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";

import { mobileApi } from "@/src/lib/api";
import { sessionHasRuntimeAccess } from "@/src/lib/session";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

type CoreStatusBarProps = {
  variant?: "bar" | "banner" | "pill";
  style?: ViewStyle;
};

export function CoreStatusBar({ variant = "bar", style }: CoreStatusBarProps) {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSessionState();
  const enabled = sessionHasRuntimeAccess(session);

  const { data, isError, isLoading } = useQuery({
    queryKey: ["core-status", session?.runtimeUrl, session?.workspaceId],
    enabled,
    queryFn: async () => mobileApi.getCoreStatus(session!),
    refetchInterval: 10000,
  });

  const connected = enabled && !isError;
  const runtimeOk = Boolean(data?.runtime?.ok);
  const modelLabel =
    (data?.runtime?.model_name || data?.runtime?.model || data?.runtime?.modelId || data?.runtime?.model_id) ??
    (runtimeOk ? "Ready" : "Unavailable");
  const workspaceLabel = session?.workspaceId || "default";
  const statusLabel = isLoading ? "Connecting..." : connected ? "Core Connected" : "Core Offline";
  const dotColor = isLoading ? theme.colors.textSecondary : connected ? "#22C55E" : theme.colors.textSecondary;

  if (variant === "banner") {
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
          <Text style={{ fontSize: 13, color: theme.colors.text }}>{statusLabel}</Text>
        </View>
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>Model: {String(modelLabel)}</Text>
          <Text style={{ fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 }}>
            Workspace: {workspaceLabel}
          </Text>
        </View>
        {!connected ? (
          <TouchableOpacity
            onPress={() => router.push("/session")}
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
            <Text style={{ fontSize: 12, color: theme.colors.text }}>Reconnect</Text>
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

  const modelReady = isLoading ? "Checking model..." : runtimeOk ? "Model Ready" : "Model Unavailable";

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
          <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{modelReady}</Text>
        ) : (
          <TouchableOpacity
            onPress={() => router.push("/session")}
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
