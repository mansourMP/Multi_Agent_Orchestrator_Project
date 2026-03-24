import React from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { normalizeServerUrl } from "@/src/lib/api";
import { getStoredNotificationState, registerForPushNotificationsAsync, scheduleAgentTestNotification, StoredNotificationState } from "@/src/lib/notifications";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, saveSession } = useSessionState();
  const [runtimeUrl, setRuntimeUrl] = React.useState(session?.runtimeUrl || "");
  const [runtimeKey, setRuntimeKey] = React.useState(session?.runtimeKey || "");
  const [workspaceId, setWorkspaceId] = React.useState(session?.workspaceId || "default");
  const [saved, setSaved] = React.useState(false);
  const [notificationState, setNotificationState] = React.useState<StoredNotificationState>({ permissionStatus: "undetermined" });
  const [notificationBusy, setNotificationBusy] = React.useState(false);

  React.useEffect(() => {
    setRuntimeUrl(session?.runtimeUrl || "");
    setRuntimeKey(session?.runtimeKey || "");
    setWorkspaceId(session?.workspaceId || "default");
  }, [session?.runtimeKey, session?.runtimeUrl, session?.workspaceId]);

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

  const handleSave = async () => {
    const nextRuntimeUrl = normalizeServerUrl(runtimeUrl);
    const nextRuntimeKey = runtimeKey.trim();
    const nextWorkspaceId = workspaceId.trim() || "default";

    await saveSession({
      runtimeUrl: nextRuntimeUrl,
      runtimeKey: nextRuntimeKey,
      workspaceId: nextWorkspaceId,
      platformUrl: session?.platformUrl,
      platformKey: session?.platformKey,
    });

    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const handleEnableNotifications = async () => {
    setNotificationBusy(true);
    try {
      const nextState = await registerForPushNotificationsAsync();
      setNotificationState(nextState);
    } finally {
      setNotificationBusy(false);
    }
  };

  const handleSendTestNotification = async () => {
    setNotificationBusy(true);
    try {
      await scheduleAgentTestNotification({ agentId: "personal-assistant" });
    } finally {
      setNotificationBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          paddingTop: Math.max(insets.top, 12),
          paddingHorizontal: 20,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: theme.colors.background,
        }}
      >
        <TouchableOpacity
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
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontFamily: "DMSans_700Bold", color: theme.colors.text, marginLeft: 12 }}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 }}>
        <Text style={{ fontSize: 12, color: theme.colors.textSecondary, textTransform: "uppercase", fontFamily: "DMSans_700Bold" }}>
          Connection
        </Text>

        <View
          style={{
            marginTop: 14,
            gap: 14,
            padding: 18,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <View>
            <Text style={{ fontSize: 13, color: theme.colors.text, marginBottom: 8 }}>Server URL</Text>
            <TextInput
              value={runtimeUrl}
              onChangeText={setRuntimeUrl}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="http://192.168.1.2:8001"
              placeholderTextColor="#9CA3AF"
              style={{
                height: 48,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.background,
                color: theme.colors.text,
                paddingHorizontal: 14,
                fontSize: 15,
              }}
            />
          </View>

          <View>
            <Text style={{ fontSize: 13, color: theme.colors.text, marginBottom: 8 }}>API Key</Text>
            <TextInput
              value={runtimeKey}
              onChangeText={setRuntimeKey}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Your API key"
              placeholderTextColor="#9CA3AF"
              style={{
                height: 48,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.background,
                color: theme.colors.text,
                paddingHorizontal: 14,
                fontSize: 15,
              }}
            />
          </View>

          <View>
            <Text style={{ fontSize: 13, color: theme.colors.text, marginBottom: 8 }}>Workspace ID</Text>
            <TextInput
              value={workspaceId}
              onChangeText={setWorkspaceId}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="default"
              placeholderTextColor="#9CA3AF"
              style={{
                height: 48,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.background,
                color: theme.colors.text,
                paddingHorizontal: 14,
                fontSize: 15,
              }}
            />
          </View>

          <TouchableOpacity
            onPress={handleSave}
            style={{
              marginTop: 4,
              height: 48,
              borderRadius: 16,
              backgroundColor: theme.colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "700" }}>Save</Text>
          </TouchableOpacity>

          {saved ? (
            <Text style={{ fontSize: 13, color: theme.colors.success }}>Saved</Text>
          ) : null}
        </View>

        <Text style={{ marginTop: 26, fontSize: 12, color: theme.colors.textSecondary, textTransform: "uppercase", fontFamily: "DMSans_700Bold" }}>
          Notifications
        </Text>

        <View
          style={{
            marginTop: 14,
            gap: 14,
            padding: 18,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <View>
            <Text style={{ fontSize: 13, color: theme.colors.textSecondary, marginBottom: 6 }}>Permission</Text>
            <Text style={{ fontSize: 15, color: theme.colors.text, fontFamily: "DMSans_700Bold" }}>
              {notificationState.permissionStatus}
            </Text>
          </View>

          <View>
            <Text style={{ fontSize: 13, color: theme.colors.textSecondary, marginBottom: 6 }}>Expo push token</Text>
            <Text style={{ fontSize: 13, color: theme.colors.text, lineHeight: 20 }}>
              {notificationState.expoPushToken || "Not registered yet."}
            </Text>
          </View>

          {notificationState.error ? (
            <Text style={{ fontSize: 13, color: theme.colors.warning, lineHeight: 20 }}>{notificationState.error}</Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={handleEnableNotifications}
              disabled={notificationBusy}
              style={{
                flex: 1,
                height: 46,
                borderRadius: 16,
                backgroundColor: theme.colors.accent,
                alignItems: "center",
                justifyContent: "center",
                opacity: notificationBusy ? 0.7 : 1,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>
                {notificationBusy ? "Working..." : "Enable"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSendTestNotification}
              disabled={notificationBusy}
              style={{
                flex: 1,
                height: 46,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.background,
                alignItems: "center",
                justifyContent: "center",
                opacity: notificationBusy ? 0.7 : 1,
              }}
            >
              <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: "700" }}>Send test</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
