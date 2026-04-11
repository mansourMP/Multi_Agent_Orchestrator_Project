import React, { useMemo, useState } from "react";
import { Linking, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { MobileScreen } from "@/src/components/MobileScreen";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { mobileApi } from "@/src/lib/api";
import { useMobileConnectors } from "@/src/lib/mobile-data";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

const FEATURED = ["google_workspace", "telegram_bot", "slack"];

export default function ConnectorsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSessionState();
  const connectorsQuery = useMobileConnectors();
  const connectors = connectorsQuery.data ?? [];
  const [busyId, setBusyId] = useState<string | null>(null);

  const featuredConnectors = useMemo(() => {
    const byConnector = new Map(connectors.map((item) => [item.connector || item.id, item]));
    return FEATURED.map((id) => byConnector.get(id) || {
      id,
      connector: id,
      label: id === "google_workspace" ? "Gmail" : id === "telegram_bot" ? "Telegram" : "Slack",
      status: "not_connected",
      connected: false,
    });
  }, [connectors]);

  const openSetup = async (connectorId: string) => {
    const base = String(session?.platformUrl || "").trim();
    if (!base) return;
    await Linking.openURL(`${base.replace(/\/+$/, "")}/connectors?connector=${encodeURIComponent(connectorId)}`);
  };

  const testConnection = async (connectorId: string) => {
    if (!session) return;
    setBusyId(connectorId);
    try {
      await mobileApi.testConnector(session, connectorId);
      await connectorsQuery.refetch();
    } finally {
      setBusyId(null);
    }
  };

  const disconnect = async (connectorId: string) => {
    if (!session) return;
    setBusyId(connectorId);
    try {
      await mobileApi.disconnectConnector(session, connectorId);
      await connectorsQuery.refetch();
    } finally {
      setBusyId(null);
    }
  };

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
          <ScreenHeader title="Connectors" subtitle="See status, test connections, disconnect, and open full setup." />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ gap: 12, marginTop: 12 }}>
          {featuredConnectors.map((connector) => {
            const busy = busyId === connector.id;
            return (
              <View
                key={connector.id}
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  padding: 16,
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                  <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                    {connector.label}
                  </Text>
                  <Text style={{ fontSize: 12, color: connector.connected ? "#0F9D58" : theme.colors.textSecondary }}>
                    {connector.connected ? "Connected" : "Needs setup"}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                  {connector.summary || connector.status}
                </Text>
                <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                  {connector.connected ? (
                    <>
                      <TouchableOpacity
                        activeOpacity={0.86}
                        onPress={() => void testConnection(connector.id)}
                        disabled={busy}
                        style={{
                          height: 40,
                          paddingHorizontal: 16,
                          borderRadius: 12,
                          backgroundColor: theme.colors.accent,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>{busy ? "Testing..." : "Test"}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.86}
                        onPress={() => void disconnect(connector.id)}
                        disabled={busy}
                        style={{
                          height: 40,
                          paddingHorizontal: 16,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.background,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: theme.colors.text, fontWeight: "700" }}>Disconnect</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      activeOpacity={0.86}
                      onPress={() => void openSetup(connector.connector)}
                      style={{
                        height: 40,
                        paddingHorizontal: 16,
                        borderRadius: 12,
                        backgroundColor: theme.colors.accent,
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: session?.platformUrl ? 1 : 0.55,
                      }}
                    >
                      <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
                        {session?.platformUrl ? "Open setup" : "Web setup unavailable"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </MobileScreen>
  );
}
