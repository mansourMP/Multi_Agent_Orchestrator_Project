import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";
import ChatScreen from "@/src/screens/ChatScreen";
import SpacesScreen from "@/src/screens/SpacesScreen";
import AppsScreen from "@/src/screens/AppsScreen";

const SHOW_APPS = true;

type SegmentKey = "chat" | "spaces" | "apps";

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<SegmentKey>("chat");

  const segments = useMemo(() => {
    const base: { key: SegmentKey; label: string }[] = [
      { key: "spaces", label: "Spaces" },
      { key: "chat", label: "Chat" },
    ];
    if (SHOW_APPS) {
      base.push({ key: "apps", label: "Apps" });
    }
    return base;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          paddingTop: insets.top + 12, // Strict safe area + buffer
          paddingBottom: 12,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View style={{ position: "absolute", left: 16, top: insets.top + 12 }}>
          <TouchableOpacity
            onPress={() => router.push("/settings")}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.surface,
            }}
          >
            <Ionicons name="settings-outline" size={18} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <View
          style={{
            flexDirection: "row",
            backgroundColor: theme.colors.surface,
            borderRadius: 999,
            padding: 4,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          {segments.map((segment) => {
            const selected = active === segment.key;
            return (
              <TouchableOpacity
                key={segment.key}
                onPress={() => setActive(segment.key)}
                style={{
                  paddingHorizontal: 16,
                  height: 32,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: selected ? theme.colors.accent : "transparent",
                }}
              >
                <Text style={{ fontSize: 13, color: selected ? "#fff" : theme.colors.text }}>
                  {segment.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {active === "spaces" ? <SpacesScreen /> : null}
        {active === "chat" ? <ChatScreen /> : null}
        {SHOW_APPS && active === "apps" ? <AppsScreen /> : null}
      </View>
    </View>
  );
}
