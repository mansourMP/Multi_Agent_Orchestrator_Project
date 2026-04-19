import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";

import { MobileScreen } from "@/src/components/MobileScreen";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { SectionCard } from "@/src/components/SectionCard";
import {
  getStoredNotificationState,
  registerForPushNotificationsAsync,
  StoredNotificationState,
} from "@/src/lib/notifications";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export default function NotificationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSessionState();
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

  const alertsEnabled = notificationState.permissionStatus === "granted";

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
            backgroundColor: "#FFFFFF",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: theme.colors.text, fontSize: 20, lineHeight: 22 }}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ScreenHeader title="Notifications" subtitle="News and important updates from Empyralis." />
        </View>
      </View>

      <SectionCard title="Stay in the loop" subtitle="We will only use notifications for important updates and product news.">
        <View style={{ gap: 14 }}>
          <View
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: "#F6F7F8",
              padding: 14,
              gap: 4,
            }}
          >
            <Text style={{ fontSize: 12, fontFamily: "DMSans_700Bold", color: theme.colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.8 }}>
              Status
            </Text>
            <Text style={{ fontSize: 16, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
              {alertsEnabled ? "Notifications are on" : "Notifications are off"}
            </Text>
            <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
              {alertsEnabled
                ? "You will hear from us when something important changes."
                : "Turn notifications on if you want updates sent to this phone."}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.86}
            disabled={busy}
            onPress={async () => {
              await Haptics.selectionAsync();
              setBusy(true);
              try {
                const nextState = await registerForPushNotificationsAsync(session);
                setNotificationState(nextState);
              } finally {
                setBusy(false);
              }
            }}
            style={{
              height: 48,
              borderRadius: 16,
              backgroundColor: theme.colors.accent,
              alignItems: "center",
              justifyContent: "center",
              opacity: busy ? 0.72 : 1,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>
              {busy ? "Updating..." : alertsEnabled ? "Refresh notifications" : "Turn on notifications"}
            </Text>
          </TouchableOpacity>
        </View>
      </SectionCard>
    </MobileScreen>
  );
}
