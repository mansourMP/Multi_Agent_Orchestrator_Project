import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { MobileScreen } from "@/src/components/MobileScreen";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { SurfaceStatusBanner } from "@/src/components/SurfaceStatusBanner";
import { useMobileArtifacts } from "@/src/lib/mobile-data";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export default function ArtifactsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const artifactsQuery = useMobileArtifacts();
  const artifacts = artifactsQuery.data ?? [];

  return (
    <MobileScreen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity
          activeOpacity={0.86}
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
          <Text style={{ color: theme.colors.text, fontSize: 20, lineHeight: 22 }}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ScreenHeader title="Artifacts" subtitle="Saved outputs, screenshots, and delivered files." />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {artifactsQuery.statusMessage ? (
          <View style={{ marginTop: 12 }}>
            <SurfaceStatusBanner message={artifactsQuery.statusMessage} />
          </View>
        ) : null}
        <View style={{ gap: 12, marginTop: 12 }}>
          {artifacts.map((artifact) => (
            <View
              key={artifact.id}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                padding: 16,
                gap: 8,
              }}
            >
              <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>{artifact.label}</Text>
              <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                {artifact.kind || "Artifact"}{artifact.run_id ? ` · Run ${artifact.run_id}` : ""}
              </Text>
              {artifact.uri_or_path ? (
                <Text style={{ fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary }}>{artifact.uri_or_path}</Text>
              ) : null}
            </View>
          ))}
          {!artifactsQuery.isLoading && artifacts.length === 0 ? (
            <View style={{ padding: 16, borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ color: theme.colors.textSecondary }}>No artifacts are available yet.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </MobileScreen>
  );
}
