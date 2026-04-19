import React from "react";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

import { PrimaryScreenHeader } from "@/src/components/navigation/PrimaryScreenHeader";
import { useMobileConnectors } from "@/src/lib/mobile-data";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { clearSession } = useSessionState();
  const connectorsQuery = useMobileConnectors();
  const appVersion = Constants.expoConfig?.version || Constants.nativeAppVersion || "0.1.0";
  const hasInstalledIntegrations = (connectorsQuery.data?.length || 0) > 0;

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
      icon: "time-outline",
      label: "Automations",
      subtitle: "Wake Sage up later",
      onPress: () => router.push("/automations"),
    },
  ];

  if (hasInstalledIntegrations) {
    profileMenuItems.splice(1, 0, {
      icon: "link-outline",
      label: "Integrations",
      subtitle: "Connected apps and services",
      onPress: () => router.push("/integrations"),
    });
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <PrimaryScreenHeader
        title="Profile"
        subtitle="Memory, integrations, and automations."
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
          borderRadius: 24,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: "#F3F4F6",
          overflow: "hidden",
        }}
      >
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
        <Text style={{ fontSize: 12.5, color: theme.colors.textSecondary }}>Version {appVersion}</Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.86}
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
      </TouchableOpacity>
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
    <TouchableOpacity
      activeOpacity={0.86}
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
    </TouchableOpacity>
  );
}
