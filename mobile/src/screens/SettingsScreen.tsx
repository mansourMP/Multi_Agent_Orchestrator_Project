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
  useMobileBillingSummary,
  useMobileCreditUsage,
  useMobileConnectors,
  useMobileMachines,
  useMobileOverviewData,
  usePrimaryGatewayDoctor,
} from "@/src/lib/mobile-data";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

function readNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function formatCredits(value: unknown) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(readNumber(value))));
}

function resolveHostedCredits(payload: unknown) {
  const root = payload && typeof payload === "object" ? payload as Record<string, any> : {};
  const hosted = root.hosted_sage_ai && typeof root.hosted_sage_ai === "object"
    ? root.hosted_sage_ai as Record<string, unknown>
    : {};
  const creditsPerUsd = Math.max(1, readNumber(hosted.credits_per_usd, 1000));
  const cap = readNumber(
    hosted.monthly_credit_cap,
    readNumber(hosted.monthly_cap_usd) * creditsPerUsd,
  );
  const used = readNumber(
    hosted.monthly_credits_used,
    readNumber(hosted.monthly_cost_usd) * creditsPerUsd,
  );
  const remaining = readNumber(
    hosted.monthly_credits_remaining,
    readNumber(hosted.monthly_remaining_usd, Math.max(0, cap - used)) * creditsPerUsd,
  );
  return {
    allowed: hosted.allowed === true,
    cap: Math.max(0, cap),
    used: Math.max(0, used),
    remaining: Math.max(0, remaining),
    policy: typeof hosted.policy === "string" ? hosted.policy : "",
  };
}

function resolveCreditUsage(payload: unknown) {
  const root = payload && typeof payload === "object" ? payload as Record<string, any> : {};
  const summary = root.summary && typeof root.summary === "object" ? root.summary as Record<string, unknown> : {};
  const items = Array.isArray(root.items) ? root.items : [];
  return {
    count: Math.max(0, readNumber(summary.count, items.length)),
    credits: Math.max(0, readNumber(summary.total_credits_debited)),
    cost: Math.max(0, readNumber(summary.total_platform_cost_usd)),
  };
}

export function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { clearSession, session } = useSessionState();
  const connectorsQuery = useMobileConnectors();
  const machinesQuery = useMobileMachines();
  const overview = useMobileOverviewData();
  const gatewayDoctor = usePrimaryGatewayDoctor();
  const billingQuery = useMobileBillingSummary();
  const creditUsageQuery = useMobileCreditUsage();
  const appVersion = Constants.expoConfig?.version || Constants.nativeAppVersion || "0.1.0";
  const connected = Boolean(session?.runtimeUrl && session?.runtimeKey);
  const connectorCount = (connectorsQuery.data ?? []).filter((item) => item.connected || item.runtime_usable).length;
  const machineCount = machinesQuery.data?.length ?? 0;
  const onlineMachineCount = (machinesQuery.data ?? []).filter((item) => item.online).length;
  const approvalCount = overview.approvals.length;
  const gatewayDoctorStatus = String(gatewayDoctor.doctor?.status ?? "").trim().toLowerCase();
  const gatewayDoctorApprovals = Number((gatewayDoctor.doctor?.approvals as { pending_count?: number } | undefined)?.pending_count ?? 0);
  const hostedCredits = resolveHostedCredits(billingQuery.data);
  const creditUsage = resolveCreditUsage(creditUsageQuery.data);
  const hostedCreditPercent = hostedCredits.cap > 0
    ? Math.min(100, Math.max(0, (hostedCredits.used / hostedCredits.cap) * 100))
    : 0;
  const usageSummary = connected
    ? billingQuery.isLoading || creditUsageQuery.isLoading
      ? "Checking hosted credits and runtime usage..."
      : creditUsage.count > 0
        ? `${formatCredits(creditUsage.credits)} credits spent · ${creditUsage.count} metered row${creditUsage.count === 1 ? "" : "s"}`
      : hostedCredits.cap > 0
        ? `${formatCredits(hostedCredits.remaining)} credits left · ${formatCredits(hostedCredits.used)}/${formatCredits(hostedCredits.cap)} used this month`
        : `${overview.runs.length} run${overview.runs.length === 1 ? "" : "s"} · ${overview.artifacts.length} output${overview.artifacts.length === 1 ? "" : "s"} · ${connectorCount} connected app${connectorCount === 1 ? "" : "s"}`
    : "Connect your personal runtime to see live runs, outputs, and linked apps.";
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

      <SectionCard title="Runtime fuel">
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontFamily: "DMSans_700Bold", color: theme.colors.textSecondary }}>
              Runtime fuel
            </Text>
            <Text style={{ marginTop: 4, fontSize: 20, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
              {connected && hostedCredits.cap > 0
                ? `${formatCredits(hostedCredits.remaining)} credits left`
                : connected
                  ? "Credits not active"
                  : "Connect workspace"}
            </Text>
          </View>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: theme.colors.card,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text style={{ fontSize: 12, fontFamily: "DMSans_700Bold", color: theme.colors.textSecondary }}>
              {billingQuery.isFetching ? "Syncing" : hostedCredits.allowed ? "Ready" : "Limited"}
            </Text>
          </View>
        </View>
        <View
          style={{
            height: 8,
            borderRadius: 999,
            backgroundColor: theme.colors.cardHover,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${hostedCreditPercent}%`,
              height: "100%",
              borderRadius: 999,
              backgroundColor: theme.colors.accent,
            }}
          />
        </View>
        <Text style={{ fontSize: 12.5, lineHeight: 18, color: theme.colors.textSecondary }}>
          {connected && hostedCredits.cap > 0
            ? `${formatCredits(hostedCredits.used)} used of ${formatCredits(hostedCredits.cap)} monthly credits. ${creditUsage.count > 0 ? `${formatCredits(creditUsage.credits)} credits in the usage ledger.` : "BYOK users spend through their own provider."}`
            : connected
              ? "Hosted credits are unavailable for this workspace. You can still use connected providers or your own API key."
              : "Sign in and connect your workspace to see monthly usage."}
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
