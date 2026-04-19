import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

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
  const actionVariant = action?.variant ?? "secondary";
  const actionHasLabel = Boolean(action?.label);

  return (
    <View
      style={{
        paddingTop: insets.top + 12,
        paddingBottom: 18,
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 14,
      }}
    >
      <View style={{ flex: 1, paddingTop: 2, gap: 5 }}>
        <Text style={{ fontSize: 31, fontFamily: "Fraunces_700Bold", color: theme.colors.text }}>{title}</Text>
        {subtitle ? (
          <Text style={{ fontSize: 13.5, lineHeight: 20, color: theme.colors.textSecondary }}>
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
            height: 42,
            paddingHorizontal: actionHasLabel ? 16 : 0,
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
  );
}
