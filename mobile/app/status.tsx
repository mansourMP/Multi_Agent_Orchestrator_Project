import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { CoreStatusBar } from "@/src/components/CoreStatusBar";
import { MobileScreen } from "@/src/components/MobileScreen";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { SectionCard } from "@/src/components/SectionCard";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export default function StatusScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSessionState();

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
          <ScreenHeader title="Status" subtitle="Core connection and runtime availability." />
        </View>
      </View>

      <SectionCard title="Runtime Health" subtitle="A live check against your connected personal core.">
        <CoreStatusBar variant="banner" style={{ marginTop: 0 }} />
      </SectionCard>

      <SectionCard title="Connection Details" subtitle="The endpoints currently available to this device.">
        <DetailRow label="Runtime URL" value={session?.runtimeUrl || "Not connected"} multiline />
        <DetailRow label="Workspace ID" value={session?.workspaceId || "default"} />
        <DetailRow label="Platform URL" value={session?.platformUrl || "Not configured"} multiline />

        <TouchableOpacity
          activeOpacity={0.86}
          onPress={() => router.push("/session")}
          style={{
            marginTop: 4,
            height: 42,
            alignSelf: "flex-start",
            paddingHorizontal: 16,
            borderRadius: 999,
            backgroundColor: theme.colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>Manage accounts</Text>
        </TouchableOpacity>
      </SectionCard>
    </MobileScreen>
  );
}

function DetailRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: 5 }}>
      <Text
        style={{
          color: theme.colors.textMuted,
          fontSize: 12,
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        {label}
      </Text>
      <Text style={{ color: theme.colors.text, fontSize: 14, lineHeight: multiline ? 21 : 20 }}>{value}</Text>
    </View>
  );
}
