import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";
import { UtilityDrawer } from "./UtilityDrawer";

type HeaderAction = {
  accessibilityLabel: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
};

export function PrimaryScreenHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: HeaderAction;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const actionVariant = action?.variant ?? "secondary";
  const actionHasLabel = Boolean(action?.label);

  return (
    <>
      <View
        style={{
          paddingTop: insets.top + 10,
          paddingBottom: 14,
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityLabel="Open utilities menu"
          onPress={() => setDrawerOpen(true)}
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="menu-outline" size={20} color={theme.colors.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, paddingTop: 2 }}>
          <Text style={{ fontSize: 30, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>{title}</Text>
          {subtitle ? (
            <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary }}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {action ? (
          <TouchableOpacity
            activeOpacity={0.86}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            onPress={action.onPress}
            style={{
              minWidth: 40,
              height: 40,
              paddingHorizontal: actionHasLabel ? 14 : 0,
              borderRadius: 999,
              borderWidth: actionVariant === "secondary" ? 1 : 0,
              borderColor: theme.colors.border,
              backgroundColor:
                actionVariant === "primary"
                  ? theme.colors.accent
                  : actionVariant === "secondary"
                    ? theme.colors.surface
                    : "transparent",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: actionHasLabel && action?.icon ? 6 : 0,
            }}
          >
            {action.icon ? (
              <Ionicons
                name={action.icon}
                size={actionHasLabel ? 16 : 20}
                color={actionVariant === "primary" ? "#FFFFFF" : theme.colors.text}
              />
            ) : null}
            {action.label ? (
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "DMSans_700Bold",
                  color: actionVariant === "primary" ? "#FFFFFF" : theme.colors.text,
                }}
              >
                {action.label}
              </Text>
            ) : null}
          </TouchableOpacity>
        ) : null}
      </View>

      <UtilityDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
