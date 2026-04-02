import React from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { APP_CATALOG } from "@/src/lib/appCatalog";
import { normalizeServerUrl } from "@/src/lib/api";
import { useKinPreferences } from "@/src/lib/kin-preferences";
import {
  getStoredNotificationState,
  registerForPushNotificationsAsync,
  scheduleAgentTestNotification,
  StoredNotificationState,
} from "@/src/lib/notifications";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

const PROFILE_APP_IDS = ["study", "health", "finance", "travel", "nutrition", "language"];

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { session, saveSession, clearSession } = useSessionState();
  const { preferences, ready, updatePreferences } = useKinPreferences();
  const [runtimeUrl, setRuntimeUrl] = React.useState(session?.runtimeUrl || "");
  const [runtimeKey, setRuntimeKey] = React.useState(session?.runtimeKey || "");
  const [workspaceId, setWorkspaceId] = React.useState(session?.workspaceId || "default");
  const [platformUrl, setPlatformUrl] = React.useState(session?.platformUrl || "");
  const [platformKey, setPlatformKey] = React.useState(session?.platformKey || "");
  const [saved, setSaved] = React.useState(false);
  const [notificationState, setNotificationState] = React.useState<StoredNotificationState>({ permissionStatus: "undetermined" });
  const [notificationBusy, setNotificationBusy] = React.useState(false);

  const showBack = segments[1] !== "profile";
  const connected = Boolean(session?.runtimeUrl && session?.runtimeKey);
  const activeApps = APP_CATALOG.filter((app) => PROFILE_APP_IDS.includes(app.id));

  React.useEffect(() => {
    setRuntimeUrl(session?.runtimeUrl || "");
    setRuntimeKey(session?.runtimeKey || "");
    setWorkspaceId(session?.workspaceId || "default");
    setPlatformUrl(session?.platformUrl || "");
    setPlatformKey(session?.platformKey || "");
  }, [session?.platformKey, session?.platformUrl, session?.runtimeKey, session?.runtimeUrl, session?.workspaceId]);

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
      platformUrl: normalizeServerUrl(platformUrl),
      platformKey: platformKey.trim(),
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
      await scheduleAgentTestNotification();
    } finally {
      setNotificationBusy(false);
    }
  };

  const toggleApp = (appId: string) => {
    updatePreferences((current) => {
      const activeAppIds = current.activeAppIds.includes(appId)
        ? current.activeAppIds.filter((id) => id !== appId)
        : [...current.activeAppIds, appId];

      return {
        ...current,
        activeAppIds,
      };
    });
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
        {showBack ? (
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
        ) : (
          <View style={{ width: 40, height: 40 }} />
        )}
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={{ fontSize: 22, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>Profile</Text>
          <Text style={{ marginTop: 3, fontSize: 13, color: theme.colors.textSecondary }}>
            Settings, integrations, privacy, and KIN behavior.
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 }}>
        <View
          style={{
            padding: 18,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Text style={{ fontSize: 12, color: theme.colors.textSecondary, textTransform: "uppercase", fontFamily: "DMSans_700Bold" }}>
            KIN status
          </Text>
          <Text style={{ marginTop: 8, fontSize: 22, fontFamily: "Fraunces_700Bold", color: theme.colors.text }}>
            {connected ? "Connected to your private core." : "Preview mode only."}
          </Text>
          <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 22, color: theme.colors.textSecondary }}>
            {connected
              ? "Home, Inbox, and app workspaces can now show live runs, approvals, and saved outputs."
              : "Add your runtime and optional platform registry here. KIN only gets access to the connections you enable."}
          </Text>
        </View>

        <SectionTitle title="Connections" />
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
          <Field
            label="Server URL"
            value={runtimeUrl}
            onChangeText={setRuntimeUrl}
            placeholder="http://192.168.1.2:8001"
          />

          <Field
            label="API Key"
            value={runtimeKey}
            onChangeText={setRuntimeKey}
            placeholder="Your API key"
          />

          <Field
            label="Workspace ID"
            value={workspaceId}
            onChangeText={setWorkspaceId}
            placeholder="default"
          />

          <Field
            label="Platform URL"
            value={platformUrl}
            onChangeText={setPlatformUrl}
            placeholder="Optional platform registry"
          />

          <Field
            label="Platform Key"
            value={platformKey}
            onChangeText={setPlatformKey}
            placeholder="Optional platform key"
          />

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
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "700" }}>Save connections</Text>
          </TouchableOpacity>

          {saved ? <Text style={{ fontSize: 13, color: theme.colors.success }}>Saved</Text> : null}
        </View>

        <SectionTitle title="Notifications" />
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

        <SectionTitle title="KIN Behavior" />
        <View
          style={{
            marginTop: 14,
            gap: 16,
            padding: 18,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <PreferenceGroup title="How proactive should KIN be?">
            <ChoicePill
              label="Calm"
              selected={preferences.proactivity === "calm"}
              onPress={() => updatePreferences({ proactivity: "calm" })}
            />
            <ChoicePill
              label="Balanced"
              selected={preferences.proactivity === "balanced"}
              onPress={() => updatePreferences({ proactivity: "balanced" })}
            />
            <ChoicePill
              label="Proactive"
              selected={preferences.proactivity === "proactive"}
              onPress={() => updatePreferences({ proactivity: "proactive" })}
            />
          </PreferenceGroup>

          <PreferenceGroup title="What should KIN remember across work?">
            <ChoicePill
              label="Thread"
              selected={preferences.memoryBoundary === "thread"}
              onPress={() => updatePreferences({ memoryBoundary: "thread" })}
            />
            <ChoicePill
              label="App"
              selected={preferences.memoryBoundary === "app"}
              onPress={() => updatePreferences({ memoryBoundary: "app" })}
            />
            <ChoicePill
              label="Workspace"
              selected={preferences.memoryBoundary === "workspace"}
              onPress={() => updatePreferences({ memoryBoundary: "workspace" })}
            />
          </PreferenceGroup>

          <PreferenceGroup title="How often should KIN remind you?">
            <ChoicePill
              label="Important"
              selected={preferences.reminderCadence === "important"}
              onPress={() => updatePreferences({ reminderCadence: "important" })}
            />
            <ChoicePill
              label="Standard"
              selected={preferences.reminderCadence === "standard"}
              onPress={() => updatePreferences({ reminderCadence: "standard" })}
            />
            <ChoicePill
              label="Frequent"
              selected={preferences.reminderCadence === "frequent"}
              onPress={() => updatePreferences({ reminderCadence: "frequent" })}
            />
          </PreferenceGroup>

          <View>
            <Text style={{ fontSize: 13, color: theme.colors.text, marginBottom: 10 }}>Active apps</Text>
            <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary, marginBottom: 12 }}>
              KIN can launch these app workspaces when structure helps. Home uses this list for pinned app cards.
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {activeApps.map((app) => {
                const selected = preferences.activeAppIds.includes(app.id);
                return (
                  <ChoicePill
                    key={app.id}
                    label={app.name}
                    selected={selected}
                    onPress={() => toggleApp(app.id)}
                  />
                );
              })}
            </View>
          </View>

          <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
            {ready ? "Preferences save automatically." : "Loading preferences..."}
          </Text>
        </View>

        <SectionTitle title="Privacy" />
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
          <Text style={{ fontSize: 14, lineHeight: 22, color: theme.colors.textSecondary }}>
            KIN only uses the runtime, notifications, and apps you enable here. Clearing the connection removes this device from your private core.
          </Text>

          <TouchableOpacity
            onPress={async () => {
              await clearSession();
              setRuntimeUrl("");
              setRuntimeKey("");
              setWorkspaceId("default");
              setPlatformUrl("");
              setPlatformKey("");
            }}
            style={{
              height: 46,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.background,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: "700" }}>Disconnect core</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  const theme = useTheme();

  return (
    <Text style={{ marginTop: 26, fontSize: 12, color: theme.colors.textSecondary, textTransform: "uppercase", fontFamily: "DMSans_700Bold" }}>
      {title}
    </Text>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  const theme = useTheme();

  return (
    <View>
      <Text style={{ fontSize: 13, color: theme.colors.text, marginBottom: 8 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={placeholder}
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
  );
}

function PreferenceGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();

  return (
    <View>
      <Text style={{ fontSize: 13, color: theme.colors.text, marginBottom: 10 }}>{title}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>{children}</View>
    </View>
  );
}

function ChoicePill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        height: 38,
        borderRadius: 19,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: selected ? theme.colors.accent : theme.colors.background,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: selected ? "#FFFFFF" : theme.colors.text, fontSize: 13, fontWeight: "700" }}>{label}</Text>
    </TouchableOpacity>
  );
}
