import React from "react";
import { Text, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { MotionPressable } from "@/src/components/system/MotionPressable";
import { BottomSheetScaffold } from "@/src/components/system/BottomSheetScaffold";
import { useAppTheme } from "@/src/theme/useAppTheme";
import { MOBILE_BOTTOM_SHEET_SNAP_POINTS } from "@/src/ui/motion";

interface Extension {
  id: string;
  label: string;
  icon: string;
  color: string;
  prompt: string;
}

const EXTENSIONS: Extension[] = [
  { id: "nutrition", label: "Nutrition", icon: "restaurant", color: "#FF6B35", prompt: "Log nutrition: " },
  { id: "sleep", label: "Sleep", icon: "moon", color: "#6C63FF", prompt: "Log sleep: " },
  { id: "goals", label: "Goals", icon: "trophy", color: "#00C896", prompt: "Update goal: " },
  { id: "study", label: "Study", icon: "book", color: "#FFD700", prompt: "Start study session: " },
  { id: "finance", label: "Finance", icon: "wallet", color: "#4ECDC4", prompt: "Log expense: " },
  { id: "focus", label: "Focus", icon: "stopwatch", color: "#FF4757", prompt: "Start focus mode" },
  { id: "brainstorm", label: "Brainstorm", icon: "bulb", color: "#FFA502", prompt: "Brainstorm ideas for: " },
  { id: "email", label: "Email Digest", icon: "mail", color: "#747D8C", prompt: "Summarize my emails" },
];

interface ExtensionSheetProps {
  isVisible: boolean;
  onClose: () => void;
  onSelectExtension: (prompt: string) => void;
}

export const ExtensionSheet: React.FC<ExtensionSheetProps> = ({
  isVisible,
  onClose,
  onSelectExtension,
}) => {
  const theme = useAppTheme();
  const styles = useStyles(theme);

  return (
    <BottomSheetScaffold
      visible={isVisible}
      onClose={onClose}
      title="Extensions"
      subtitle="Quick actions that drop structured prompts into Sage."
      snapPoints={MOBILE_BOTTOM_SHEET_SNAP_POINTS.medium}
    >
      <View style={styles.grid}>
        {EXTENSIONS.map((ext) => (
          <MotionPressable
            key={ext.id}
            style={styles.tile}
            onPress={() => {
              onSelectExtension(ext.prompt);
              onClose();
            }}
          >
            <View style={[styles.iconContainer, { backgroundColor: `${ext.color}20` }]}>
              <Ionicons name={ext.icon as never} size={24} color={ext.color} />
            </View>
            <Text style={styles.label}>{ext.label}</Text>
          </MotionPressable>
        ))}
      </View>
    </BottomSheetScaffold>
  );
};

const useStyles = (theme: ReturnType<typeof useAppTheme>) =>
  StyleSheet.create({
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginHorizontal: -6,
    },
    tile: {
      width: "25%",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 6,
      paddingVertical: 10,
    },
    iconContainer: {
      width: 56,
      height: 56,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    label: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontFamily: "DMSans_500Medium",
      textAlign: "center",
    },
  });
