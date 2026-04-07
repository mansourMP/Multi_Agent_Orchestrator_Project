import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { MobileScreen } from "@/src/components/MobileScreen";
import { SectionCard } from "@/src/components/SectionCard";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { getDefaultRuntimeUrl, getDefaultWorkspaceId, testRuntimeConnection } from "@/src/lib/api";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export default function SessionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { saveSession, session } = useSessionState();
  const [runtimeKey, setRuntimeKey] = useState(session?.runtimeKey ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runtimeUrl = getDefaultRuntimeUrl();
  const workspaceId = session?.workspaceId ?? getDefaultWorkspaceId();

  const canSave = useMemo(
    () => runtimeKey.trim().length > 0,
    [runtimeKey],
  );

  return (
    <MobileScreen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable
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
        </Pressable>
        <View style={{ flex: 1 }}>
          <ScreenHeader
            title="Connect your core"
            subtitle="Paste your Empyralis API key. We will verify the core and open the workspace."
          />
        </View>
      </View>
      <SectionCard title="Personal Core" subtitle="Runtime URL is fixed by app config. You only need your API key.">
        <Field
          label="Runtime URL"
          value={runtimeUrl}
          editable={false}
          placeholder=""
        />
        <Field
          label="API key"
          value={runtimeKey}
          onChangeText={setRuntimeKey}
          placeholder="Paste runtime API key"
          secureTextEntry
        />
        {error ? <Text style={{ color: theme.colors.error, fontSize: 13 }}>{error}</Text> : null}
        <Pressable
          onPress={async () => {
            if (!canSave || saving) return;
            setSaving(true);
            setError(null);
            try {
              await testRuntimeConnection(runtimeKey, runtimeUrl);
              await saveSession({
                runtimeUrl,
                runtimeKey: runtimeKey.trim(),
                workspaceId,
                platformUrl: session?.platformUrl,
                platformKey: session?.platformKey,
              });
              router.replace("/");
            } catch (nextError) {
              setError(nextError instanceof Error ? nextError.message : "Failed to connect to the core.");
            } finally {
              setSaving(false);
            }
          }}
          style={{
            marginTop: 4,
            height: 44,
            borderRadius: 12,
            backgroundColor: canSave ? theme.colors.accent : theme.colors.cardHover,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: canSave ? "#FFFFFF" : theme.colors.textSecondary, fontSize: 15, fontWeight: "700" }}>
            {saving ? "Connecting..." : "Connect and continue"}
          </Text>
        </Pressable>
      </SectionCard>
    </MobileScreen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText?: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  editable?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
        editable={editable}
        style={{
          height: 44,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          color: editable ? theme.colors.text : theme.colors.textSecondary,
          paddingHorizontal: 14,
          fontSize: 15,
        }}
      />
    </View>
  );
}
