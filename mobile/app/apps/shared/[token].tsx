import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appRegistryApi, type MiniAppSharePreview } from "@/src/lib/appRegistryApi";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

function permissionLabel(value: string) {
  const token = String(value || "").trim();
  const labels: Record<string, string> = {
    "app.ai.invoke": "Can use approved AI actions",
    "app.summary.read": "Can read its own app summary",
    "app.bridge.sage.request": "Can ask Sage through an approved bridge",
    "app.bridge.specialist.request": "Can request a specialist bridge",
    "app.connector.invoke": "Can use approved connector bridge",
    "app.records.write": "Can write app-owned records",
    "app.records.read.raw": "Can read app-owned raw records",
  };
  return labels[token] || token.replace(/^app\./, "").replace(/[._-]+/g, " ");
}

export default function SharedMiniAppInstallScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useSessionState();
  const token = String(params.token || "").trim();
  const [preview, setPreview] = React.useState<MiniAppSharePreview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [installing, setInstalling] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let active = true;
    async function loadPreview() {
      if (!session || !token) {
        setLoading(false);
        return;
      }
      try {
        setError("");
        const payload = await appRegistryApi.previewSharedMiniApp(session, token);
        if (active) {
          setPreview(payload);
        }
      } catch (previewError) {
        if (active) {
          setError(previewError instanceof Error ? previewError.message : "This app link could not be opened.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    void loadPreview();
    return () => {
      active = false;
    };
  }, [session, token]);

  async function install() {
    if (!session || !token || !preview || installing) {
      return;
    }
    try {
      setInstalling(true);
      setError("");
      const installed = await appRegistryApi.installSharedMiniApp(session, token);
      router.replace(`/apps/${installed.app_id}/home`);
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : "App install failed.");
    } finally {
      setInstalling(false);
    }
  }

  const app = preview?.app;
  const permissions = app?.permissions || [];
  const origins = app?.allowed_origins || app?.hosted_app?.allowed_origins || [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontFamily: "Fraunces_700Bold", color: theme.colors.text }}>
            Review app
          </Text>
          <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>
            Unlisted link install.
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, 18) + 24,
          gap: 14,
        }}
      >
        <View
          style={{
            borderRadius: 24,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            padding: 18,
            gap: 12,
          }}
        >
          <Text style={{ fontSize: 24, fontFamily: "Fraunces_700Bold", color: theme.colors.text }}>
            {loading ? "Loading..." : app?.label || "App"}
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 21, color: theme.colors.textSecondary }}>
            {app?.description || "Review what this app can access before adding it to your workspace."}
          </Text>
        </View>

        <ReviewSection title="Where it comes from">
          {origins.length > 0 ? (
            origins.map((origin) => <ReviewText key={origin}>{origin}</ReviewText>)
          ) : (
            <ReviewText>No hosted origin was provided.</ReviewText>
          )}
        </ReviewSection>

        <ReviewSection title="Memory">
          <ReviewText>No Sage memory by default. This app only receives explicitly allowed context.</ReviewText>
        </ReviewSection>

        <ReviewSection title="Permissions">
          {permissions.length > 0 ? (
            permissions.map((permission) => <ReviewText key={permission}>{permissionLabel(permission)}</ReviewText>)
          ) : (
            <ReviewText>No extra permissions requested.</ReviewText>
          )}
        </ReviewSection>

        <ReviewSection title="Access">
          <ReviewText>AI actions require explicit permission before this app can use them.</ReviewText>
        </ReviewSection>

        {error ? <Text style={{ fontSize: 13, color: theme.colors.error }}>{error}</Text> : null}

        <TouchableOpacity
          activeOpacity={0.86}
          disabled={!preview || installing}
          onPress={install}
          style={{
            height: 54,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: preview && !installing ? theme.colors.text : theme.colors.cardHover,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontFamily: "DMSans_700Bold",
              color: preview && !installing ? theme.colors.background : theme.colors.textSecondary,
            }}
          >
            {installing ? "Installing..." : "Add app"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        padding: 15,
        gap: 8,
      }}
    >
      <Text style={{ fontSize: 13, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>{title}</Text>
      {children}
    </View>
  );
}

function ReviewText({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <Text style={{ fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary }}>{children}</Text>;
}
