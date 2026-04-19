import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { MobileScreen } from "@/src/components/MobileScreen";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { mobileApi } from "@/src/lib/api";
import { useMobileConnectors } from "@/src/lib/mobile-data";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

type VerifiedIntegration = {
  id: string;
  label: string;
  description: string;
};

type VerificationState = {
  status: "idle" | "verifying" | "verified" | "failed";
  result?: Record<string, any>;
  message?: string;
};

function buildVerifiedIntegrations(
  connectors: { id?: string; connector?: string; label?: string }[],
  verification: Record<string, VerificationState>,
): VerifiedIntegration[] {
  const rows: VerifiedIntegration[] = [];
  const seen = new Set<string>();

  const push = (item: VerifiedIntegration) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    rows.push(item);
  };

  for (const connector of connectors) {
    const connectorId = String(connector.connector || connector.id || "").trim().toLowerCase();
    if (!connectorId) continue;
    const state = verification[connectorId];
    if (state?.status !== "verified") continue;
    const result = state.result || {};

    if (connectorId === "google_workspace") {
      push({
        id: "gmail",
        label: "Gmail",
        description: "Read inboxes, draft replies, and keep up with important email.",
      });
      if (result.calendar_access === true) {
        push({
          id: "google_calendar",
          label: "Google Calendar",
          description: "See what is coming up and help plan around your schedule.",
        });
      }
      continue;
    }

    if (connectorId === "telegram_bot") {
      push({
        id: "telegram",
        label: "Telegram",
        description: "Bring updates and quick coordination into message-based conversations.",
      });
      continue;
    }

    if (connectorId === "github") {
      push({
        id: "github",
        label: "GitHub",
        description: "Track pull requests, issues, and repository context in one place.",
      });
      continue;
    }

    if (connectorId === "slack") {
      push({
        id: "slack",
        label: "Slack",
        description: "Keep up with team conversations and important channel updates.",
      });
      continue;
    }

    if (connectorId === "notion") {
      push({
        id: "notion",
        label: "Notion",
        description: "Bring notes, docs, and planning pages into the product.",
      });
    }
  }

  const order = new Map(
    ["gmail", "google_calendar", "telegram", "github", "slack", "notion"].map((id, index) => [id, index]),
  );

  return rows.sort((a, b) => {
    const orderA = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const orderB = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.label.localeCompare(b.label);
  });
}

export default function IntegrationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSessionState();
  const connectorsQuery = useMobileConnectors();
  const [verification, setVerification] = React.useState<Record<string, VerificationState>>({});

  const installedConnectors = React.useMemo(
    () =>
      (connectorsQuery.data ?? []).map((item) => ({
        id: String(item.id || "").trim(),
        connector: String(item.connector || "").trim().toLowerCase(),
        label: String(item.label || item.connector || item.id || "").trim(),
      })),
    [connectorsQuery.data],
  );

  React.useEffect(() => {
    if (!session || !installedConnectors.length) {
      setVerification({});
      return;
    }

    let cancelled = false;
    setVerification(
      Object.fromEntries(installedConnectors.map((item) => [item.connector, { status: "verifying" as const }])),
    );

    void Promise.all(
      installedConnectors.map(async (connector) => {
        try {
          const result = await mobileApi.testConnector(session, connector.id);
          return [connector.connector, { status: "verified" as const, result }] as const;
        } catch (error) {
          return [
            connector.connector,
            {
              status: "failed" as const,
              message: error instanceof Error ? error.message : "Verification failed.",
            },
          ] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setVerification(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [installedConnectors, session]);

  const verifiedItems = React.useMemo(
    () => buildVerifiedIntegrations(installedConnectors, verification),
    [installedConnectors, verification],
  );

  const verifiedCount = verifiedItems.length;

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
          <ScreenHeader title="Integrations" subtitle="Only live verified integrations appear here." />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {verifiedItems.length ? (
          <View
            style={{
              marginTop: 12,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              overflow: "hidden",
            }}
          >
            {verifiedItems.map((item, index) => (
              <View
                key={item.id}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  borderBottomWidth: index < verifiedItems.length - 1 ? 1 : 0,
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
                    backgroundColor: "#F6F7F8",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.text }}>
                    {item.label.slice(0, 1)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                    {item.label}
                  </Text>
                  <Text style={{ marginTop: 2, fontSize: 12.5, lineHeight: 18, color: theme.colors.textSecondary }}>
                    {item.description}
                  </Text>
                </View>
                <Text style={{ fontSize: 12.5, color: "#0F8A5F" }}>Live</Text>
              </View>
            ))}
          </View>
        ) : (
          <View
            style={{
              marginTop: 12,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              paddingHorizontal: 16,
              paddingVertical: 16,
              gap: 6,
            }}
          >
            <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
              No live integrations in this beta workspace
            </Text>
            <Text style={{ fontSize: 12.5, lineHeight: 19, color: theme.colors.textSecondary }}>
              Only integrations that are installed here and pass live verification stay visible.
            </Text>
          </View>
        )}

        <View
          style={{
            marginTop: 16,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: "#F6F7F8",
            paddingHorizontal: 16,
            paddingVertical: 14,
            gap: 4,
          }}
        >
          <Text style={{ fontSize: 14, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
            {verifiedCount} integration{verifiedCount === 1 ? "" : "s"} live
          </Text>
          <Text style={{ fontSize: 12.5, lineHeight: 19, color: theme.colors.textSecondary }}>
            Uninstalled or failed integrations are hidden from the beta product.
          </Text>
        </View>
      </ScrollView>
    </MobileScreen>
  );
}
