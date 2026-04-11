import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { MobileScreen } from "@/src/components/MobileScreen";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useMobileMachines } from "@/src/lib/mobile-data";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export default function MachinesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const machinesQuery = useMobileMachines();
  const machines = machinesQuery.data ?? [];

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
          <ScreenHeader title="Machines" subtitle="Runtime machine health, status, and lease holder." />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ gap: 12, marginTop: 12 }}>
          {machines.map((machine) => (
            <View
              key={machine.runtime_id}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                padding: 16,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                <Text style={{ flex: 1, fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                  {machine.display_name}
                </Text>
                <Text style={{ color: machine.online ? "#0F9D58" : theme.colors.textSecondary, fontSize: 12, fontWeight: "700" }}>
                  {machine.online ? "Online" : "Offline"}
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                Status: {machine.status}{machine.platform ? ` · ${machine.platform}` : ""}
              </Text>
              <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                Lease holder: {machine.current_lease_holder || "Idle"}
              </Text>
              {machine.current_task_id ? (
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>Current task: {machine.current_task_id}</Text>
              ) : null}
            </View>
          ))}
          {!machinesQuery.isLoading && machines.length === 0 ? (
            <View style={{ padding: 16, borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ color: theme.colors.textSecondary }}>No machines are registered yet.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </MobileScreen>
  );
}
