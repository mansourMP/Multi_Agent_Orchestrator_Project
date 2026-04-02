import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { MobileScreen } from "@/src/components/MobileScreen";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { SectionCard } from "@/src/components/SectionCard";
import {
  getStoredNotificationState,
  registerForPushNotificationsAsync,
  scheduleAgentTestNotification,
  StoredNotificationState,
} from "@/src/lib/notifications";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export default function NotificationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [notificationState, setNotificationState] = React.useState<StoredNotificationState>({ permissionStatus: "undetermined" });
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    getStoredNotificationState().then((state) => {
      if (active) {
        setNotificationState(state);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const updatedLabel = notificationState.updatedAt
    ? new Date(notificationState.updatedAt).toLocaleString()
    : "Not registered yet";

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
          <ScreenHeader title="Notifications" subtitle="Push permissions, delivery state, and test alerts." />
        </View>
      </View>

      <SectionCard title="Push Delivery" subtitle="Control how KIN alerts arrive on this device.">
        <View style={{ gap: 12 }}>
          <DetailRow label="Permission" value={notificationState.permissionStatus} />
          <DetailRow
            label="Expo push token"
            value={notificationState.expoPushToken || "Not registered yet."}
            multiline
          />
          <DetailRow label="Last updated" value={updatedLabel} />

          {notificationState.error ? (
            <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.warning }}>{notificationState.error}</Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              activeOpacity={0.86}
              disabled={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  const nextState = await registerForPushNotificationsAsync();
                  setNotificationState(nextState);
                } finally {
                  setBusy(false);
                }
              }}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 14,
                backgroundColor: theme.colors.accent,
                alignItems: "center",
                justifyContent: "center",
                opacity: busy ? 0.7 : 1,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>
                {busy ? "Working..." : "Enable"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.86}
              disabled={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await scheduleAgentTestNotification();
                } finally {
                  setBusy(false);
                }
              }}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.background,
                alignItems: "center",
                justifyContent: "center",
                opacity: busy ? 0.7 : 1,
              }}
            >
              <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: "700" }}>Send test</Text>
            </TouchableOpacity>
          </View>
        </View>
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
