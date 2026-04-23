import React from "react";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import { PrimaryScreenHeader } from "@/src/components/navigation/PrimaryScreenHeader";
import { ActionButton } from "@/src/components/system/ActionButton";
import { MotionPressable } from "@/src/components/system/MotionPressable";
import { useMobileConnectors, useMobileMachines, useMobileOverviewData } from "@/src/lib/mobile-data";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { clearSession, session } = useSessionState();
  const connectorsQuery = useMobileConnectors();
  const machinesQuery = useMobileMachines();
  const overview = useMobileOverviewData();
  const appVersion = Constants.expoConfig?.version || Constants.nativeAppVersion || "0.1.0";
  const connected = Boolean(session?.runtimeUrl && session?.runtimeKey);
  const connectorCount = (connectorsQuery.data ?? []).filter((item) => item.connected || item.runtime_usable).length;
  const machineCount = machinesQuery.data?.length ?? 0;
  const onlineMachineCount = (machinesQuery.data ?? []).filter((item) => item.online).length;
  const approvalCount = overview.approvals.length;
  const usageSummary = connected
    ? `${overview.runs.length} run${overview.runs.length === 1 ? "" : "s"} · ${overview.artifacts.length} output${overview.artifacts.length === 1 ? "" : "s"} · ${connectorCount} connected app${connectorCount === 1 ? "" : "s"}`
    : "Connect your personal runtime to see live runs, outputs, and linked apps.";
  const gatewaySummary = !connected
    ? "Connect your private runtime and pair a device."
    : machinesQuery.isLoading
      ? "Checking your paired devices and approvals…"
      : onlineMachineCount > 0
        ? `${onlineMachineCount} device${onlineMachineCount === 1 ? "" : "s"} online${approvalCount ? ` · ${approvalCount} approval${approvalCount === 1 ? "" : "s"} waiting` : ""}`
        : machineCount > 0
          ? `All ${machineCount} paired device${machineCount === 1 ? "" : "s"} are offline right now.`
          : "No paired devices are online yet.";

  const profileMenuItems: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    subtitle: string;
    onPress: () => void;
  }[] = [
    {
      icon: "albums-outline",
      label: "Memory",
      subtitle: "What Sage knows about you",
      onPress: () => router.push("/memory"),
    },
    {
      icon: "link-outline",
      label: "Connected apps",
      subtitle: connectorCount ? `${connectorCount} connector${connectorCount === 1 ? "" : "s"} active right now` : "Manage AI providers and linked services",
      onPress: () => router.push("/integrations"),
    },
    {
      icon: "notifications-outline",
      label: "Notifications",
      subtitle: "Alerts, approvals, and recent changes",
      onPress: () => router.push("/notifications"),
    },
    {
      icon: "time-outline",
      label: "Automations",
      subtitle: "Wake Sage up later",
      onPress: () => router.push("/automations"),
    },
    {
      icon: "shield-checkmark-outline",
      label: "Privacy & Safety",
      subtitle: "Permissions, memory boundaries, and controls",
      onPress: () => router.push("/privacy"),
    },
  ];
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <PrimaryScreenHeader
        title="You"
        subtitle="Profile, device connection, and your settings."
        action={{
          accessibilityLabel: "Open notifications",
          icon: "notifications-outline",
          onPress: () => {
            void Haptics.selectionAsync();
            router.push("/notifications");
          },
          variant: "secondary",
        }}
      />

      <View
        style={{
          marginTop: 2,
          paddingHorizontal: 18,
          paddingVertical: 18,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: "#F3F4F6",
          gap: 5,
        }}
      >
        <Text style={{ fontSize: 18, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
          {session?.userDisplayName || "Empyralis User"}
        </Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary }}>
          {session?.userEmail || "Signed in on this device"}
        </Text>
        <Text style={{ fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary }}>
          Workspace {session?.workspaceId || "default"} · Version {appVersion}
        </Text>
      </View>

      <View
        style={{
          marginTop: 14,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: "#F3F4F6",
          overflow: "hidden",
        }}
      >
        <ProfileMenuButton
          icon="desktop-outline"
          label="Device connection"
          subtitle={gatewaySummary}
          onPress={() => router.push("/gateway" as never)}
          showDivider
        />
        <ProfileMenuButton
          icon="stats-chart-outline"
          label="Usage"
          subtitle={usageSummary}
          onPress={() => router.push("/status")}
          showDivider
        />
        {profileMenuItems.map((item, index) => (
          <ProfileMenuButton
            key={item.label}
            icon={item.icon}
            label={item.label}
            subtitle={item.subtitle}
            onPress={item.onPress}
            showDivider={index < profileMenuItems.length - 1}
          />
        ))}
      </View>

      <View
        style={{
          marginTop: 14,
          paddingHorizontal: 18,
          paddingVertical: 14,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: "#F6F7F8",
          gap: 3,
        }}
      >
        <Text style={{ fontSize: 14, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>Empyralis</Text>
        <Text style={{ fontSize: 12.5, color: theme.colors.textSecondary }}>
          {connected
            ? "Your phone is linked to your workspace. Open device connection any time to review approvals and runtime health."
            : "Connect your workspace to unlock live actions on this phone."}
        </Text>
        <ActionButton
          label={connected ? "Open device connection" : "Connect workspace"}
          variant={connected ? "secondary" : "primary"}
          onPress={() => router.push((connected ? "/gateway" : "/session") as never)}
          style={{ alignSelf: "flex-start", marginTop: 8 }}
        />
      </View>

      <MotionPressable
        onPress={async () => {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await clearSession();
        }}
        style={{
          marginTop: 24,
          height: 48,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "rgba(194, 65, 59, 0.16)",
          backgroundColor: "#FFF4F3",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#C2413B", fontSize: 14, fontWeight: "700" }}>Sign out</Text>
      </MotionPressable>
    </ScrollView>
  );
}

export default function SettingsScreen() {
  return <ProfileScreen />;
}

function ProfileMenuButton({
  icon,
  label,
  subtitle,
  onPress,
  showDivider,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle: string;
  onPress: () => void;
  showDivider?: boolean;
}) {
  const theme = useTheme();

  return (
    <MotionPressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        borderBottomWidth: showDivider ? 1 : 0,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={19} color={theme.colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>{label}</Text>
        <Text style={{ marginTop: 2, fontSize: 12.5, lineHeight: 18, color: theme.colors.textSecondary }}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
    </MotionPressable>
  );
}
