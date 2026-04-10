import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { MobileScreen } from "@/src/components/MobileScreen";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { SectionCard } from "@/src/components/SectionCard";
import {
  getDefaultPlatformUrl,
  getDefaultRuntimeUrl,
  getDefaultWorkspaceId,
  testRuntimeConnection,
} from "@/src/lib/api";
import { ensureMobileDeviceId } from "@/src/lib/mobile-engine";
import {
  buildPairingDeepLink,
  decodePairingInput,
  encodePairingCode,
  formatPairingFallbackCode,
} from "@/src/lib/pairing";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export default function SessionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ pairing?: string }>();
  const { saveSession, session } = useSessionState();
  const [runtimeUrl, setRuntimeUrl] = useState(session?.runtimeUrl ?? getDefaultRuntimeUrl());
  const [workspaceId, setWorkspaceId] = useState(session?.workspaceId ?? getDefaultWorkspaceId());
  const [platformUrl, setPlatformUrl] = useState(session?.platformUrl ?? getDefaultPlatformUrl());
  const [runtimeKey, setRuntimeKey] = useState(session?.runtimeKey ?? "");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingMethod, setPairingMethod] = useState<"manual" | "pairing_qr" | "pairing_code">(
    session?.pairingMethod ?? "manual",
  );
  const [pairingDetails, setPairingDetails] = useState<ReturnType<typeof decodePairingInput> | null>(null);
  const [pairingNotice, setPairingNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const incoming = typeof params.pairing === "string" ? params.pairing.trim() : "";
    if (!incoming) return;
    try {
      const next = decodePairingInput(incoming);
      setRuntimeUrl(next.runtimeUrl);
      setWorkspaceId(next.workspaceId);
      setPlatformUrl(next.platformUrl ?? getDefaultPlatformUrl());
      setPairingDetails(next);
      setPairingCode(incoming);
      setPairingMethod("pairing_qr");
      setPairingNotice(buildPairingNotice(next, "Desktop pairing packet loaded."));
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not read the pairing packet.");
    }
  }, [params.pairing]);

  const canSave = useMemo(
    () => runtimeKey.trim().length > 0 && runtimeUrl.trim().length > 0 && workspaceId.trim().length > 0,
    [runtimeKey, runtimeUrl, workspaceId],
  );

  const previewPairingCode = useMemo(() => {
    try {
      return encodePairingCode({
        runtimeUrl,
        workspaceId,
        platformUrl,
        label: "Empyralis mobile",
      });
    } catch {
      return "";
    }
  }, [platformUrl, runtimeUrl, workspaceId]);

  const formattedPairingCode = useMemo(
    () => formatPairingFallbackCode(previewPairingCode),
    [previewPairingCode],
  );

  const previewPairingLink = useMemo(() => {
    try {
      return buildPairingDeepLink({
        runtimeUrl,
        workspaceId,
        platformUrl,
        label: "Empyralis mobile",
      });
    } catch {
      return "";
    }
  }, [platformUrl, runtimeUrl, workspaceId]);

  const applyPairingCode = () => {
    try {
      const next = decodePairingInput(pairingCode);
      setRuntimeUrl(next.runtimeUrl);
      setWorkspaceId(next.workspaceId);
      setPlatformUrl(next.platformUrl ?? getDefaultPlatformUrl());
      setPairingDetails(next);
      setPairingMethod("pairing_code");
      setPairingNotice(buildPairingNotice(next, "Pairing code applied."));
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not apply the pairing code.");
    }
  };

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
            title="Pair and connect"
            subtitle="Scan the desktop QR or paste the fallback pairing code. Add your runtime API key to finish."
          />
        </View>
      </View>

      <SectionCard
        title="Desktop pairing"
        subtitle="QR pairing opens this screen with a secret-free packet. The fallback pairing code does the same if scanning is not available."
      >
        <Field
          label="Pairing code"
          value={pairingCode}
          onChangeText={setPairingCode}
          placeholder="Paste desktop pairing code or empyralis://session link"
        />
        {pairingNotice ? <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>{pairingNotice}</Text> : null}
        {pairingDetails?.pairingId ? (
          <Text style={{ color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
            Pairing ID: {pairingDetails.pairingId}
            {pairingDetails.expiresAt ? ` · Expires ${new Date(pairingDetails.expiresAt).toLocaleString()}` : ""}
          </Text>
        ) : null}
        <Pressable
          onPress={applyPairingCode}
          disabled={!pairingCode.trim()}
          style={{
            marginTop: 4,
            height: 44,
            borderRadius: 12,
            backgroundColor: pairingCode.trim() ? theme.colors.accent : theme.colors.cardHover,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: pairingCode.trim() ? "#FFFFFF" : theme.colors.textSecondary, fontSize: 15, fontWeight: "700" }}>
            Apply pairing
          </Text>
        </Pressable>
      </SectionCard>

      <SectionCard
        title="Connection"
        subtitle="Pairing fills runtime values. The API key remains manual so mobile never receives broad platform secrets by accident."
      >
        <Field
          label="Runtime URL"
          value={runtimeUrl}
          onChangeText={setRuntimeUrl}
          placeholder="http://your-runtime-host:8001"
          editable
        />
        <Field
          label="Workspace ID"
          value={workspaceId}
          onChangeText={setWorkspaceId}
          placeholder="default"
          editable
        />
        <Field
          label="Platform URL"
          value={platformUrl}
          onChangeText={setPlatformUrl}
          placeholder="Optional desktop/platform surface URL"
          editable
        />
        <Field
          label="Runtime API key"
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
              const linkedAt = new Date().toISOString();
              const deviceId = await ensureMobileDeviceId(session?.deviceId);
              await saveSession({
                runtimeUrl: runtimeUrl.trim(),
                runtimeKey: runtimeKey.trim(),
                workspaceId: workspaceId.trim(),
                platformUrl: platformUrl.trim() || undefined,
                platformKey: session?.platformKey,
                pairingMethod,
                pairedAt: linkedAt,
                pairingId: pairingDetails?.pairingId,
                pairingExpiresAt: pairingDetails?.expiresAt,
                pairingLabel: pairingDetails?.label,
                deviceId,
                sessionLinkedAt: linkedAt,
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

      <SectionCard
        title="Pairing packet"
        subtitle="Desktop or platform can turn this deep link into a QR. The fallback code can be pasted directly into this screen."
      >
        <Field label="Deep link" value={previewPairingLink} placeholder="" editable={false} multiline />
        <Field label="Fallback code" value={formattedPairingCode} placeholder="" editable={false} multiline />
        <Text style={{ color: theme.colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
          Current method: {pairingMethod === "manual" ? "Manual entry" : pairingMethod === "pairing_qr" ? "QR pairing" : "Pairing code"}.
        </Text>
      </SectionCard>
    </MobileScreen>
  );
}

function buildPairingNotice(
  pairing: ReturnType<typeof decodePairingInput>,
  prefix: string,
) {
  const parts = [prefix, "Add the runtime API key to finish connecting."];
  if (pairing.label) {
    parts.push(`Label: ${pairing.label}.`);
  }
  if (pairing.expiresAt) {
    parts.push(`Expires ${new Date(pairing.expiresAt).toLocaleString()}.`);
  }
  return parts.join(" ");
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  editable = true,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText?: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  editable?: boolean;
  multiline?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: 8 }}>
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
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
        editable={editable}
        multiline={multiline}
        style={{
          minHeight: multiline ? 72 : 44,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          color: editable ? theme.colors.text : theme.colors.textSecondary,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 10,
          fontSize: 15,
        }}
      />
    </View>
  );
}
