import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MotionPressable } from "@/src/components/system/MotionPressable";
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
  const styles = useStyles(theme);

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 8,
          paddingBottom: 16,
        },
      ]}
    >
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? (
          <Text style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {action ? (
        <MotionPressable
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel}
          onPress={action.onPress}
          style={[
            styles.action,
            actionHasLabel && styles.actionWide,
            actionVariant === "primary"
              ? styles.actionPrimary
              : actionVariant === "ghost"
                ? styles.actionGhost
                : styles.actionSecondary,
            actionVariant === "primary" && {
              shadowColor: theme.colors.text,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.08,
              shadowRadius: 18,
              elevation: 3,
            },
          ]}
        >
          {action.icon ? (
            <Ionicons
              name={action.icon}
              size={actionHasLabel ? 16 : 19}
              color={actionVariant === "primary" ? "#FFFFFF" : theme.colors.text}
            />
          ) : null}
          {action.label ? (
            <Text style={[styles.actionLabel, { color: actionVariant === "primary" ? "#FFFFFF" : theme.colors.text }]}>
              {action.label}
            </Text>
          ) : null}
        </MotionPressable>
      ) : null}
    </View>
  );
}

const useStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.md,
    },
    copy: {
      flex: 1,
      paddingTop: 2,
      gap: 5,
    },
    title: {
      fontSize: 31,
      lineHeight: 35,
      letterSpacing: -0.7,
      fontFamily: "Fraunces_700Bold",
      color: theme.colors.text,
    },
    subtitle: {
      maxWidth: "92%",
      fontSize: 13.5,
      lineHeight: 20,
      color: theme.colors.textSecondary,
    },
    action: {
      minWidth: 44,
      height: 44,
      paddingHorizontal: 0,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    actionWide: {
      paddingHorizontal: 16,
    },
    actionPrimary: {
      borderColor: "transparent",
      backgroundColor: theme.colors.accent,
    },
    actionSecondary: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
    },
    actionGhost: {
      backgroundColor: "transparent",
      borderColor: "transparent",
    },
    actionLabel: {
      fontSize: 13,
      fontFamily: "DMSans_700Bold",
    },
  });
