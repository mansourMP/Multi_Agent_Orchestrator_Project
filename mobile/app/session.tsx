import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { MobileScreen } from "@/src/components/MobileScreen";
import { SectionCard } from "@/src/components/SectionCard";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { getDefaultPlatformUrl, getDefaultRuntimeUrl, getDefaultWorkspaceId } from "@/src/lib/api";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export default function SessionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { saveSession, session } = useSessionState();
  const [runtimeUrl, setRuntimeUrl] = useState(session?.runtimeUrl ?? getDefaultRuntimeUrl());
  const [runtimeKey, setRuntimeKey] = useState(session?.runtimeKey ?? "");
  const [workspaceId, setWorkspaceId] = useState(session?.workspaceId ?? getDefaultWorkspaceId());
  const [platformUrl, setPlatformUrl] = useState(session?.platformUrl ?? getDefaultPlatformUrl());
  const [platformKey, setPlatformKey] = useState(session?.platformKey ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = useMemo(
    () => runtimeUrl.trim().length > 0 && runtimeKey.trim().length > 0 && workspaceId.trim().length > 0,
    [runtimeKey, runtimeUrl, workspaceId],
  );

  return (
    <MobileScreen>
      <ScreenHeader title="Connect Empyralis" subtitle="Connect your personal core and optional platform registry." />
      <SectionCard title="Personal Core" subtitle="Your Mac Mini runtime powers private memory, files, and device actions.">
        <Field
          label="Runtime URL"
          value={runtimeUrl}
          onChangeText={setRuntimeUrl}
          placeholder="http://192.168.x.x:8001"
        />
        <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: -4 }}>
          Tip: on a real iPhone use your Mac Mini IP (not 127.0.0.1). Simulator can use 127.0.0.1.
        </Text>
        <Field
          label="Runtime key"
          value={runtimeKey}
          onChangeText={setRuntimeKey}
          placeholder="replace-with-strong-key"
          secureTextEntry
        />
        <Field
          label="Space ID"
          value={workspaceId}
          onChangeText={setWorkspaceId}
          placeholder="default"
        />
      </SectionCard>

      <SectionCard title="Platform Registry" subtitle="Optional. Company-owned app catalog and app distribution layer.">
        <Field
          label="Platform URL"
          value={platformUrl}
          onChangeText={setPlatformUrl}
          placeholder="https://apps.yourcompany.com"
        />
        <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: -4 }}>
          Leave this empty for preview mode. Real store publishing should come from the platform registry, not the Mac Mini.
        </Text>
        <Field
          label="Platform key"
          value={platformKey}
          onChangeText={setPlatformKey}
          placeholder="optional-api-key"
          secureTextEntry
        />
        {error ? <Text style={{ color: theme.colors.error, fontSize: 13 }}>{error}</Text> : null}
        <Pressable
          onPress={async () => {
            if (!canSave || saving) return;
            setSaving(true);
            setError(null);
            try {
              await saveSession({
                runtimeUrl: runtimeUrl.trim(),
                runtimeKey: runtimeKey.trim(),
                workspaceId: workspaceId.trim(),
                platformUrl: platformUrl.trim(),
                platformKey: platformKey.trim(),
              });
              router.replace("/");
            } catch (nextError) {
              setError(nextError instanceof Error ? nextError.message : "Failed to save session.");
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
            {saving ? "Saving..." : "Continue"}
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
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
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
        style={{
          height: 44,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          color: theme.colors.text,
          paddingHorizontal: 14,
          fontSize: 15,
        }}
      />
    </View>
  );
}
