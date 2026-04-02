import React from "react";
import { Text, TouchableOpacity, View, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryScreenHeader } from "@/src/components/navigation/PrimaryScreenHeader";
import { APP_CATALOG } from "@/src/lib/appCatalog";
import { useKinPreferences } from "@/src/lib/kin-preferences";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

const PROFILE_APP_IDS = ["study", "health", "finance", "travel", "nutrition", "language"];
const DEFAULT_ACTIVE_APP_IDS = ["study", "health", "finance", "travel"];

const UTILITY_LINKS: Array<{
  href: string;
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    href: "/notifications",
    label: "Notifications",
    subtitle: "Push permissions and alert delivery",
    icon: "notifications-outline",
  },
  {
    href: "/session",
    label: "Connected Accounts",
    subtitle: "Runtime and platform access",
    icon: "link-outline",
  },
  {
    href: "/status",
    label: "Status",
    subtitle: "Core health and runtime availability",
    icon: "pulse-outline",
  },
  {
    href: "/settings",
    label: "Settings",
    subtitle: "Behavior, memory, and privacy controls",
    icon: "settings-outline",
  },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { session, clearSession } = useSessionState();
  const { preferences, ready, updatePreferences } = useKinPreferences();
  const isProfile = segments[1] === "profile";
  const connected = Boolean(session?.runtimeUrl && session?.runtimeKey);
  const activeApps = APP_CATALOG.filter((app) => PROFILE_APP_IDS.includes(app.id));
  const selectedAppIds = preferences.activeAppIds.length ? preferences.activeAppIds : DEFAULT_ACTIVE_APP_IDS;
  const enabledApps = activeApps.filter((app) => selectedAppIds.includes(app.id));

  const toggleApp = (appId: string) => {
    updatePreferences((current) => {
      const nextSource = current.activeAppIds.length ? current.activeAppIds : DEFAULT_ACTIVE_APP_IDS;
      const activeAppIds = nextSource.includes(appId)
        ? nextSource.filter((id) => id !== appId)
        : [...nextSource, appId];

      return {
        ...current,
        activeAppIds,
      };
    });
  };

  if (isProfile) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <PrimaryScreenHeader title="Profile" subtitle="Preferences, privacy, and connected tools." />

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
          <Text
            style={{
              fontSize: 11,
              fontFamily: "DMSans_700Bold",
              color: theme.colors.textSecondary,
              textTransform: "uppercase",
              letterSpacing: 1.1,
            }}
          >
            Identity
          </Text>
          <Text style={{ fontSize: 22, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
            {connected ? "Connected to your private core." : "Preview mode only."}
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 21, color: theme.colors.textSecondary }}>
            {connected
              ? "KIN can use the runtime access you enabled. Utilities stay in the drawer so the main tabs remain focused."
              : "Connect your runtime when you want live approvals, active runs, and saved outputs to flow into the app."}
          </Text>
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={() => router.push(connected ? "/status" : "/session")}
            style={{
              height: 42,
              alignSelf: "flex-start",
              paddingHorizontal: 16,
              borderRadius: 999,
              backgroundColor: theme.colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>
              {connected ? "Open Status" : "Connected Accounts"}
            </Text>
          </TouchableOpacity>
        </View>

        <SectionTitle title="Utilities" />
        <View style={{ marginTop: 10, gap: 10 }}>
          {UTILITY_LINKS.map((item) => (
            <TouchableOpacity
              key={item.href}
              activeOpacity={0.86}
              onPress={() => router.push(item.href as never)}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                padding: 14,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 14,
                  backgroundColor: theme.colors.background,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={item.icon} size={18} color={theme.colors.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                  {item.label}
                </Text>
                <Text style={{ marginTop: 3, fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary }}>
                  {item.subtitle}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <SectionTitle title="KIN Preferences" />
        <View
          style={{
            marginTop: 10,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            padding: 16,
            gap: 12,
          }}
        >
          <PreferenceRow label="Proactivity" value={formatValue(preferences.proactivity)} />
          <PreferenceRow label="Memory" value={formatValue(preferences.memoryBoundary)} />
          <PreferenceRow label="Reminders" value={formatValue(preferences.reminderCadence)} />
          <PreferenceRow
            label="Active apps"
            value={enabledApps.length ? `${enabledApps.length} enabled` : "Default set"}
          />
          <Text style={{ fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary }}>
            {enabledApps.length
              ? enabledApps.map((app) => app.name).join(", ")
              : "Study, Health, Finance, and Travel are enabled by default."}
          </Text>
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={() => router.push("/settings")}
            style={{
              marginTop: 2,
              height: 40,
              alignSelf: "flex-start",
              paddingHorizontal: 16,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.background,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: "700" }}>Open full settings</Text>
          </TouchableOpacity>
        </View>

        <SectionTitle title="Privacy" />
        <View
          style={{
            marginTop: 10,
            gap: 12,
            padding: 16,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
            KIN only uses the connections and apps you allow. Disconnecting removes this device from your private core.
          </Text>
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={async () => {
              await clearSession();
            }}
            style={{
              height: 42,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.background,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: "700" }}>Disconnect core</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          paddingTop: Math.max(insets.top, 12),
          paddingHorizontal: 20,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: theme.colors.background,
          gap: 12,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>Settings</Text>
          <Text style={{ marginTop: 3, fontSize: 13, color: theme.colors.textSecondary }}>
            Deeper controls for KIN behavior, app access, and privacy.
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 }}>
        <View
          style={{
            padding: 16,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Text style={{ fontSize: 14, lineHeight: 21, color: theme.colors.textSecondary }}>
            Notifications, connected accounts, and runtime status stay in dedicated utility screens. Settings focuses on how KIN behaves inside the app.
          </Text>
        </View>

        <SectionTitle title="KIN Behavior" />
        <View
          style={{
            marginTop: 10,
            gap: 16,
            padding: 18,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <PreferenceGroup title="How proactive should KIN be?">
            <ChoicePill
              label="Calm"
              selected={preferences.proactivity === "calm"}
              onPress={() => updatePreferences({ proactivity: "calm" })}
            />
            <ChoicePill
              label="Balanced"
              selected={preferences.proactivity === "balanced"}
              onPress={() => updatePreferences({ proactivity: "balanced" })}
            />
            <ChoicePill
              label="Proactive"
              selected={preferences.proactivity === "proactive"}
              onPress={() => updatePreferences({ proactivity: "proactive" })}
            />
          </PreferenceGroup>

          <PreferenceGroup title="What should KIN remember across work?">
            <ChoicePill
              label="Thread"
              selected={preferences.memoryBoundary === "thread"}
              onPress={() => updatePreferences({ memoryBoundary: "thread" })}
            />
            <ChoicePill
              label="App"
              selected={preferences.memoryBoundary === "app"}
              onPress={() => updatePreferences({ memoryBoundary: "app" })}
            />
            <ChoicePill
              label="Workspace"
              selected={preferences.memoryBoundary === "workspace"}
              onPress={() => updatePreferences({ memoryBoundary: "workspace" })}
            />
          </PreferenceGroup>

          <PreferenceGroup title="How often should KIN remind you?">
            <ChoicePill
              label="Important"
              selected={preferences.reminderCadence === "important"}
              onPress={() => updatePreferences({ reminderCadence: "important" })}
            />
            <ChoicePill
              label="Standard"
              selected={preferences.reminderCadence === "standard"}
              onPress={() => updatePreferences({ reminderCadence: "standard" })}
            />
            <ChoicePill
              label="Frequent"
              selected={preferences.reminderCadence === "frequent"}
              onPress={() => updatePreferences({ reminderCadence: "frequent" })}
            />
          </PreferenceGroup>

          <View>
            <Text style={{ fontSize: 13, color: theme.colors.text, marginBottom: 10 }}>Active apps</Text>
            <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary, marginBottom: 12 }}>
              KIN can open these app workspaces when structure helps.
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {activeApps.map((app) => {
                const selected = selectedAppIds.includes(app.id);
                return (
                  <ChoicePill
                    key={app.id}
                    label={app.name}
                    selected={selected}
                    onPress={() => toggleApp(app.id)}
                  />
                );
              })}
            </View>
          </View>

          <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
            {ready ? "Preferences save automatically." : "Loading preferences..."}
          </Text>
        </View>

        <SectionTitle title="Privacy" />
        <View
          style={{
            marginTop: 10,
            gap: 14,
            padding: 18,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Text style={{ fontSize: 14, lineHeight: 22, color: theme.colors.textSecondary }}>
            KIN only uses the runtime and apps you explicitly enable. Use Connected Accounts in the drawer when you want to change runtime access.
          </Text>

          <TouchableOpacity
            onPress={async () => {
              await clearSession();
            }}
            style={{
              height: 46,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.background,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: "700" }}>Disconnect core</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function formatValue(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function SectionTitle({ title }: { title: string }) {
  const theme = useTheme();

  return (
    <Text
      style={{
        marginTop: 22,
        fontSize: 11,
        color: theme.colors.textSecondary,
        textTransform: "uppercase",
        letterSpacing: 1.1,
        fontFamily: "DMSans_700Bold",
      }}
    >
      {title}
    </Text>
  );
}

function PreferenceRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 13, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>{value}</Text>
    </View>
  );
}

function PreferenceGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();

  return (
    <View>
      <Text style={{ fontSize: 13, color: theme.colors.text, marginBottom: 10 }}>{title}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>{children}</View>
    </View>
  );
}

function ChoicePill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        height: 38,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: selected ? theme.colors.accent : theme.colors.background,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: "700", color: selected ? "#FFFFFF" : theme.colors.text }}>{label}</Text>
    </TouchableOpacity>
  );
}
