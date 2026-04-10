import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { MobileScreen } from "@/src/components/MobileScreen";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { SectionCard } from "@/src/components/SectionCard";
import { mobileApi } from "@/src/lib/api";
import { getMobileEngineState, type MobileEngineState } from "@/src/lib/mobile-engine";
import { useMobileNotifications } from "@/src/lib/mobile-data";
import {
  getStoredNotificationState,
  registerForPushNotificationsAsync,
  scheduleAgentTestNotification,
  StoredNotificationState,
} from "@/src/lib/notifications";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export default function NotificationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSessionState();
  const notificationsQuery = useMobileNotifications();
  const [notificationState, setNotificationState] = React.useState<StoredNotificationState>({ permissionStatus: "undetermined" });
  const [engineState, setEngineState] = React.useState<MobileEngineState | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    Promise.all([getStoredNotificationState(), getMobileEngineState()]).then(([state, engine]) => {
      if (!active) return;
      setNotificationState(state);
      setEngineState(engine);
    });
    return () => {
      active = false;
    };
  }, []);

  const updatedLabel = notificationState.updatedAt
    ? new Date(notificationState.updatedAt).toLocaleString()
    : "Not registered yet";
  const runtimeRegisteredLabel = notificationState.runtimeRegistration?.registeredAt
    ? new Date(notificationState.runtimeRegistration.registeredAt).toLocaleString()
    : "Not registered with runtime yet";
  const engineLastSyncLabel = engineState?.lastNotificationSyncAt
    ? new Date(engineState.lastNotificationSyncAt).toLocaleString()
    : "No mobile sync yet";
  const engineWakeLabel = engineState?.lastWakeRequestAt
    ? new Date(engineState.lastWakeRequestAt).toLocaleString()
    : "No wake requested yet";

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

      <SectionCard title="Push Delivery" subtitle="Control how Sage alerts arrive on this device.">
        <View style={{ gap: 12 }}>
          <DetailRow label="Permission" value={notificationState.permissionStatus} />
          <DetailRow
            label="Expo push token"
            value={notificationState.expoPushToken || "Not registered yet."}
            multiline
          />
          <DetailRow label="Device ID" value={notificationState.deviceId || "Not assigned yet."} multiline />
          <DetailRow
            label="Runtime registration"
            value={notificationState.runtimeRegistration?.status || "Not registered"}
          />
          <DetailRow label="Runtime sync" value={runtimeRegisteredLabel} />
          <DetailRow label="Last updated" value={updatedLabel} />
          <DetailRow label="Mobile sync loop" value={engineLastSyncLabel} />
          <DetailRow label="Last wake request" value={engineWakeLabel} />
          <DetailRow
            label="Queued context events"
            value={String(engineState?.queuedContextEvents.length ?? 0)}
          />

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
                  const nextState = await registerForPushNotificationsAsync(session);
                  setNotificationState(nextState);
                  setEngineState(await getMobileEngineState());
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
                  setEngineState(await getMobileEngineState());
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

      <SectionCard title="Recent Runtime Alerts" subtitle="Live notifications mirrored from the runtime feed.">
        <View style={{ gap: 12 }}>
          {(notificationsQuery.data ?? []).slice(0, 6).map((item) => (
            <View
              key={item.id}
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.background,
                padding: 12,
                gap: 6,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                <Text style={{ flex: 1, color: theme.colors.text, fontSize: 14, fontWeight: "700" }}>
                  {item.action || item.channel || "Notification"}
                </Text>
                <Text style={{ color: theme.colors.textSecondary, fontSize: 11 }}>
                  {item.ts ? new Date(item.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}
                </Text>
              </View>
              <Text style={{ color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19 }}>{item.text}</Text>
              {!item.read_at && session ? (
                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={async () => {
                    await mobileApi.markNotificationsRead(session, [item.id]);
                    await notificationsQuery.refetch();
                  }}
                  style={{
                    alignSelf: "flex-start",
                    height: 34,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    backgroundColor: theme.colors.accent,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>Mark read</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
          {!notificationsQuery.isLoading && (notificationsQuery.data ?? []).length === 0 ? (
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
              No runtime alerts yet. Once the feed is active, new events will appear here and sync to push.
            </Text>
          ) : null}
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
