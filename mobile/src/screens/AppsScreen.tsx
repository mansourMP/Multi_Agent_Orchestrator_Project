import React from "react";
import { ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { PrimaryScreenHeader } from "@/src/components/navigation/PrimaryScreenHeader";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export default function AppsScreen() {
  const theme = useTheme();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 36 }}
      showsVerticalScrollIndicator={false}
    >
      <PrimaryScreenHeader title="Applications" subtitle="Workspace app surfaces available on this phone." />

      <View
        style={{
          marginTop: 4,
          padding: 18,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          gap: 12,
        }}
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Ionicons name="cube-outline" size={22} color={theme.colors.text} />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 20, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
            No installed apps
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 21, color: theme.colors.textSecondary }}>
            Apps added to this workspace will appear here when mobile app surfaces are enabled.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
