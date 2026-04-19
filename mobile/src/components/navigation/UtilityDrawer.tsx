import React from "react";
import { Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

type UtilityDrawerProps = {
  visible: boolean;
  onClose: () => void;
};

const DRAWER_ITEMS: {
  href: string;
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    href: "/notifications",
    label: "Notifications",
    subtitle: "Push permissions and delivery",
    icon: "notifications-outline",
  },
  {
    href: "/session",
    label: "Pair & Connect",
    subtitle: "Desktop pairing, runtime, and platform access",
    icon: "link-outline",
  },
  {
    href: "/status",
    label: "Status",
    subtitle: "Core connection and runtime health",
    icon: "pulse-outline",
  },
  {
    href: "/settings",
    label: "Settings",
    subtitle: "Behavior, privacy, and app controls",
    icon: "settings-outline",
  },
];

export function UtilityDrawer({ visible, onClose }: UtilityDrawerProps) {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: "rgba(17, 24, 39, 0.18)" }}>
        <View
          style={{
            width: "78%",
            maxWidth: 320,
            paddingTop: insets.top + 16,
            paddingHorizontal: 18,
            paddingBottom: Math.max(insets.bottom, 18),
            borderRightWidth: 1,
            borderRightColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <View
            style={{
              paddingBottom: 18,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
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
              Utilities
            </Text>
            <Text style={{ marginTop: 10, fontSize: 24, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
              Workspace tools
            </Text>
            <Text style={{ marginTop: 6, fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
              Secondary controls for access, notifications, and system state.
            </Text>
          </View>

          <View style={{ marginTop: 16, gap: 10 }}>
            {DRAWER_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <TouchableOpacity
                  key={item.href}
                  activeOpacity={0.86}
                  onPress={() => {
                    onClose();
                    requestAnimationFrame(() => {
                      if (!active) {
                        router.push(item.href as never);
                      }
                    });
                  }}
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: active ? theme.colors.accent : theme.colors.border,
                    backgroundColor: active ? theme.colors.cardHover : theme.colors.surface,
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
                      backgroundColor: active ? theme.colors.accent : theme.colors.background,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name={item.icon}
                      size={18}
                      color={active ? "#FFFFFF" : theme.colors.text}
                    />
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
              );
            })}
          </View>
        </View>

        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </View>
    </Modal>
  );
}
