import React from "react";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { MobileScreen } from "@/src/components/MobileScreen";
import { SectionCard } from "@/src/components/SectionCard";
import { PrimaryScreenHeader } from "@/src/components/navigation/PrimaryScreenHeader";
import { ActionButton } from "@/src/components/system/ActionButton";
import { MotionPressable } from "@/src/components/system/MotionPressable";
import {
  useMobileConnectors,
  useMobileMachines,
  useMobileOverviewData,
  usePrimaryGatewayDoctor,
} from "@/src/lib/mobile-data";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { clearSession, session } = useSessionState();
  const connectorsQuery = useMobileConnectors();
  const machinesQuery = useMobileMachines();
  const overview = useMobileOverviewData();
  const gatewayDoctor = usePrimaryGatewayDoctor();
  const appVersion = Constants.expoConfig?.version || Constants.nativeAppVersion || "0.1.0";
  const connected = Boolean(session?.runtimeUrl && session?.runtimeKey);
  const connectorCount = (connectorsQuery.data ?? []).filter((item) => item.connected || item.runtime_usable).length;
  const machineCount = machinesQuery.data?.length ?? 0;
  const onlineMachineCount = (machinesQuery.data ?? []).filter((item) => item.online).length;
  const approvalCount = overview.approvals.length;
  const gatewayDoctorStatus = String(gatewayDoctor.doctor?.status ?? "").trim().toLowerCase();
  const gatewayDoctorApprovals = Number((gatewayDoctor.doctor?.approvals as { pending_count?: number } | undefined)?.pending_count ?? 0);
  const usageSummary = connected
    ? `${overview.runs.length} run${overview.runs.length === 1 ? "" : "s"} · ${overview.artifacts.length} output${overview.artifacts.length === 1 ? "" : "s"} · ${connectorCount} connected app${connectorCount === 1 ? "" : "s"}`
    : "Connect your workspace to see live runs, outputs, and linked apps.";
  const gatewaySummary = !connected
    ? "Connect your private runtime and pair a device."
    : gatewayDoctor.loading || machinesQuery.isLoading
      ? "Checking your paired devices and approvals…"
      : gatewayDoctor.gateway && gatewayDoctor.doctor
        ? gatewayDoctorStatus === "healthy"
          ? `Gateway online${gatewayDoctorApprovals ? ` · ${gatewayDoctorApprovals} approval${gatewayDoctorApprovals === 1 ? "" : "s"} waiting` : ""}`
          : gatewayDoctorStatus === "offline"
            ? `Gateway offline${gatewayDoctorApprovals ? ` · ${gatewayDoctorApprovals} approval${gatewayDoctorApprovals === 1 ? "" : "s"} waiting` : ""}`
            : gatewayDoctorStatus === "blocked"
              ? "Gateway access is blocked and needs review."
              : gatewayDoctorStatus === "degraded"
                ? `Gateway needs attention${gatewayDoctorApprovals ? ` · ${gatewayDoctorApprovals} approval${gatewayDoctorApprovals === 1 ? "" : "s"} waiting` : ""}`
                : "Gateway status is available."
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
      onPress: () => router.push("/settings"),
    },
  ];
  return (
    <MobileScreen>
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

      <SectionCard
        title={session?.userDisplayName || "Empyralis User"}
        subtitle={session?.userEmail || "Signed in on this device"}
      >
        <Text style={{ fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary }}>
          Workspace {session?.workspaceId || "default"} · Version {appVersion}
        </Text>
      </SectionCard>

      <SectionCard title="Workspace status">
        <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
          {connected
            ? "This phone is linked to your workspace. Usage, approvals, and app activity appear in Activity."
            : "Connect your workspace to load live Apps, Discover, Sage, and Activity."}
        </Text>
      </SectionCard>

      <SectionCard title="Controls">
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
      </SectionCard>

      <SectionCard title="Empyralis">
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
      </SectionCard>

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
          borderColor: theme.colors.errorMuted,
          backgroundColor: theme.colors.errorMuted,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: theme.colors.error, fontSize: 14, fontWeight: "700" }}>Sign out</Text>
      </MotionPressable>
    </MobileScreen>
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
          backgroundColor: theme.colors.card,
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
