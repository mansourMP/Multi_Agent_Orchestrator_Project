import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

const RUNTIME_URL_KEY = "runtimeUrl";
const RUNTIME_KEY_KEY = "runtimeKey";

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, saveSession } = useSessionState();
  const [runtimeUrl, setRuntimeUrl] = React.useState(session?.runtimeUrl || "");
  const [runtimeKey, setRuntimeKey] = React.useState(session?.runtimeKey || "");
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    Promise.all([AsyncStorage.getItem(RUNTIME_URL_KEY), AsyncStorage.getItem(RUNTIME_KEY_KEY)]).then(([url, key]) => {
      if (!active) return;
      if (url) setRuntimeUrl(url);
      if (key) setRuntimeKey(key);
    });

    return () => {
      active = false;
    };
  }, []);

  const handleSave = async () => {
    const nextRuntimeUrl = runtimeUrl.trim();
    const nextRuntimeKey = runtimeKey.trim();

    await Promise.all([
      AsyncStorage.setItem(RUNTIME_URL_KEY, nextRuntimeUrl),
      AsyncStorage.setItem(RUNTIME_KEY_KEY, nextRuntimeKey),
    ]);

    await saveSession({
      runtimeUrl: nextRuntimeUrl,
      runtimeKey: nextRuntimeKey,
      workspaceId: session?.workspaceId || "default",
      platformUrl: session?.platformUrl,
      platformKey: session?.platformKey,
    });

    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <View
        style={{
          paddingTop: Math.max(insets.top, 12),
          paddingHorizontal: 16,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#FFFFFF",
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ width: 40, height: 40, alignItems: "flex-start", justifyContent: "center" }}
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontFamily: "Fraunces_700Bold", color: "#111827", marginLeft: 8 }}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 }}>
        <Text style={{ fontSize: 13, color: "#6B7280", textTransform: "uppercase", fontFamily: "DMSans_700Bold" }}>
          Connection
        </Text>

        <View style={{ marginTop: 14, gap: 14 }}>
          <View>
            <Text style={{ fontSize: 13, color: "#374151", marginBottom: 8 }}>Server URL</Text>
            <TextInput
              value={runtimeUrl}
              onChangeText={setRuntimeUrl}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="http://192.168.1.2:8001"
              placeholderTextColor="#9CA3AF"
              style={{
                height: 48,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                backgroundColor: "#FFFFFF",
                color: theme.colors.text,
                paddingHorizontal: 14,
                fontSize: 15,
              }}
            />
          </View>

          <View>
            <Text style={{ fontSize: 13, color: "#374151", marginBottom: 8 }}>API Key</Text>
            <TextInput
              value={runtimeKey}
              onChangeText={setRuntimeKey}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Your API key"
              placeholderTextColor="#9CA3AF"
              style={{
                height: 48,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                backgroundColor: "#FFFFFF",
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
              height: 46,
              borderRadius: 14,
              backgroundColor: "#111827",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "700" }}>Save</Text>
          </TouchableOpacity>

          {saved ? (
            <Text style={{ fontSize: 13, color: "#16A34A" }}>Saved</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
