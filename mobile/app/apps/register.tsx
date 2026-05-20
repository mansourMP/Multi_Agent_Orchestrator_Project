import React from "react";
import { ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appRegistryApi } from "@/src/lib/appRegistryApi";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
}

function originFromUrl(value: string) {
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}`.replace(/\/$/, "");
  } catch {
    return "";
  }
}

export default function RegisterMiniAppScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSessionState();
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [hostedUrl, setHostedUrl] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [allowAi, setAllowAi] = React.useState(false);
  const [allowSageBridge, setAllowSageBridge] = React.useState(false);
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const effectiveSlug = slugify(slug || name);
  const allowedOrigin = originFromUrl(hostedUrl);
  const canSave = Boolean(session && name.trim() && effectiveSlug && hostedUrl.trim() && allowedOrigin && !saving);

  async function submit() {
    if (!session || !canSave) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await appRegistryApi.registerMiniAppContract(session, effectiveSlug, {
        label: name.trim(),
        description: description.trim(),
        hosted_url: hostedUrl.trim(),
        allowed_origins: [allowedOrigin],
        permissions: [
          ...(allowAi ? ["app.ai.invoke"] : []),
          ...(allowSageBridge ? ["app.bridge.sage.request"] : []),
        ],
        bridge_contracts: allowSageBridge ? { app_to_sage: ["summary_request"] } : {},
        visibility: "workspace_private",
      });
      router.replace(`/apps/${effectiveSlug}/home`);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Mini app registration failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontFamily: "Fraunces_700Bold", color: theme.colors.text }}>
            Register mini app
          </Text>
          <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>
            Workspace-private by default.
          </Text>
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 18) + 24, gap: 14 }}
      >
        <Field label="App name" value={name} onChangeText={setName} placeholder="Inventory Helper" />
        <Field label="App id" value={slug} onChangeText={setSlug} placeholder={slugify(name) || "inventory_helper"} />
        <Field label="Hosted URL" value={hostedUrl} onChangeText={setHostedUrl} placeholder="https://example.com/app" />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="What this mini app helps with."
          multiline
        />

        <PermissionRow
          label="Allow AI invoke"
          detail="The app can spend workspace/platform credits through configured providers."
          value={allowAi}
          onValueChange={setAllowAi}
        />
        <PermissionRow
          label="Allow Sage bridge"
          detail="The app can request a governed Sage summary through an explicit bridge contract."
          value={allowSageBridge}
          onValueChange={setAllowSageBridge}
        />

        <View
          style={{
            padding: 14,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            gap: 5,
          }}
        >
          <Text style={{ fontSize: 13, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
            Contract defaults
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary }}>
            Memory is denied by default. Origins are explicit. Public sharing starts as unlisted links later, not marketplace listing.
          </Text>
          {allowedOrigin ? (
            <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>Allowed origin: {allowedOrigin}</Text>
          ) : null}
        </View>

        {error ? <Text style={{ fontSize: 13, color: theme.colors.error }}>{error}</Text> : null}

        <TouchableOpacity
          activeOpacity={0.86}
          disabled={!canSave}
          onPress={submit}
          style={{
            height: 54,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: canSave ? theme.colors.text : theme.colors.cardHover,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontFamily: "DMSans_700Bold",
              color: canSave ? theme.colors.background : theme.colors.textSecondary,
            }}
          >
            {saving ? "Registering..." : "Register app"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 13, fontFamily: "DMSans_700Bold", color: theme.colors.textSecondary }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textSecondary}
        multiline={multiline}
        autoCapitalize="none"
        style={{
          minHeight: multiline ? 104 : 52,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          color: theme.colors.text,
          paddingHorizontal: 15,
          paddingVertical: multiline ? 13 : 0,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}

function PermissionRow({
  label,
  detail,
  value,
  onValueChange,
}: {
  label: string;
  detail: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        padding: 14,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 13, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>{label}</Text>
        <Text style={{ fontSize: 12, lineHeight: 18, color: theme.colors.textSecondary }}>{detail}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}
