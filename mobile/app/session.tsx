import React, { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, TextInput, View } from "react-native";

import { MobileScreen } from "@/src/components/MobileScreen";
import { SectionCard } from "@/src/components/SectionCard";
import { ActionButton } from "@/src/components/system/ActionButton";
import {
  getDefaultPlatformUrl,
  getDefaultRuntimeKey,
  getDefaultRuntimeUrl,
  mobileApi,
} from "@/src/lib/api";
import { ensureMobileDeviceId } from "@/src/lib/mobile-engine";
import { decodePairingInput } from "@/src/lib/pairing";
import { useSessionState } from "@/src/lib/session-context";
import { useTheme } from "@/src/theme";
import type { MobileSession } from "@/src/lib/types";

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function normalizeUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export default function SessionRoute() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ pairing?: string; code?: string }>();
  const { saveSession, session } = useSessionState();
  const [pairingInput, setPairingInput] = useState("");
  const [runtimeUrl, setRuntimeUrl] = useState(session?.runtimeUrl || getDefaultRuntimeUrl() || "");
  const [runtimeKey, setRuntimeKey] = useState(session?.runtimeKey || getDefaultRuntimeKey() || "");
  const [workspaceId, setWorkspaceId] = useState(session?.workspaceId || "");
  const [platformUrl, setPlatformUrl] = useState(session?.platformUrl || getDefaultPlatformUrl() || "");
  const [pairingId, setPairingId] = useState(session?.pairingId || "");
  const [pairingLabel, setPairingLabel] = useState(session?.pairingLabel || "");
  const [pairingExpiresAt, setPairingExpiresAt] = useState(session?.pairingExpiresAt || "");
  const [status, setStatus] = useState<{ tone: "neutral" | "error" | "success"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const canSave = Boolean(normalizeUrl(runtimeUrl) && runtimeKey.trim() && workspaceId.trim() && !saving);
  const incomingPairing = useMemo(
    () => readSearchParam(params.pairing) || readSearchParam(params.code),
    [params.code, params.pairing],
  );

  function applyPairingCode(input: string) {
    const decoded = decodePairingInput(input);
    setRuntimeUrl(decoded.runtimeUrl);
    setWorkspaceId(decoded.workspaceId);
    setPlatformUrl(decoded.platformUrl || platformUrl);
    setPairingId(decoded.pairingId || "");
    setPairingLabel(decoded.label || "");
    setPairingExpiresAt(decoded.expiresAt || "");
    setStatus({
      tone: "success",
      message: "Pairing code applied. Add the runtime key for this workspace to finish linking the phone.",
    });
  }

  useEffect(() => {
    if (!incomingPairing) {
      return;
    }
    setPairingInput(incomingPairing);
    try {
      applyPairingCode(incomingPairing);
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not read the pairing code.",
      });
    }
    // The deep-link payload should hydrate local state once when the route is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingPairing]);

  async function handleApplyPairing() {
    setStatus(null);
    try {
      applyPairingCode(pairingInput);
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not read the pairing code.",
      });
    }
  }

  async function handleSave() {
    if (!canSave) {
      setStatus({
        tone: "error",
        message: "Runtime URL, runtime key, and workspace ID are required.",
      });
      return;
    }
    setSaving(true);
    setStatus({ tone: "neutral", message: "Checking this workspace connection..." });
    try {
      const deviceId = await ensureMobileDeviceId(session?.deviceId);
      const nextSession: MobileSession = {
        ...(session || {}),
        runtimeUrl: normalizeUrl(runtimeUrl),
        runtimeKey: runtimeKey.trim(),
        authScheme: session?.authScheme || "api_key",
        workspaceId: workspaceId.trim(),
        platformUrl: normalizeUrl(platformUrl) || undefined,
        platformKey: session?.platformKey,
        tenantId: session?.tenantId,
        userEmail: session?.userEmail,
        userDisplayName: session?.userDisplayName,
        refreshToken: session?.refreshToken,
        refreshExpiresAt: session?.refreshExpiresAt,
        authSessionId: session?.authSessionId,
        deviceId,
        pairingMethod: pairingId ? "pairing_code" : "manual",
        pairedAt: new Date().toISOString(),
        pairingId: pairingId || undefined,
        pairingExpiresAt: pairingExpiresAt || undefined,
        pairingLabel: pairingLabel || undefined,
        sessionLinkedAt: new Date().toISOString(),
      };
      const accountShell = await mobileApi.getAccountShell(nextSession).catch(() => null);
      const firstMembership = accountShell?.workspaceMemberships?.find(
        (membership) => membership.workspace?.id === nextSession.workspaceId,
      ) || accountShell?.workspaceMemberships?.[0];

      await saveSession({
        ...nextSession,
        tenantId:
          nextSession.tenantId
          || String(firstMembership?.workspace?.tenantId || "").trim()
          || undefined,
        userEmail:
          nextSession.userEmail
          || String(accountShell?.account?.email || "").trim()
          || undefined,
        userDisplayName:
          nextSession.userDisplayName
          || String(accountShell?.account?.displayName || "").trim()
          || undefined,
      });
      setStatus({ tone: "success", message: "Phone connected to this workspace." });
      router.replace("/chats");
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not save this pairing.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <MobileScreen>
      <View style={{ gap: theme.spacing.sm }}>
        <Text style={{ color: theme.colors.text, fontSize: 28, fontFamily: "Fraunces_700Bold" }}>
          Pair & Connect
        </Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.body, lineHeight: 22 }}>
          Link this phone to the same workspace runtime Sage uses on desktop.
        </Text>
      </View>

      {status ? (
        <View
          style={{
            borderRadius: theme.radii.lg,
            borderWidth: 1,
            borderColor:
              status.tone === "error"
                ? theme.colors.errorMuted
                : status.tone === "success"
                  ? theme.colors.successMuted
                  : theme.colors.border,
            backgroundColor:
              status.tone === "error"
                ? theme.colors.errorMuted
                : status.tone === "success"
                  ? theme.colors.successMuted
                  : theme.colors.panelMuted,
            padding: theme.spacing.md,
            gap: theme.spacing.xs,
          }}
        >
          <Text
            style={{
              color:
                status.tone === "error"
                  ? theme.colors.error
                  : status.tone === "success"
                    ? theme.colors.success
                    : theme.colors.text,
              fontSize: theme.typography.meta,
              fontFamily: "DMSans_700Bold",
            }}
          >
            {status.message}
          </Text>
        </View>
      ) : null}

      <SectionCard
        title="Pairing code"
        subtitle="Paste the fallback code or open an empyralis://session link from desktop."
      >
        <Field
          label="Code"
          value={pairingInput}
          onChangeText={setPairingInput}
          placeholder="EMP2..."
          multiline
        />
        <ActionButton
          label="Apply code"
          icon="scan-outline"
          onPress={() => void handleApplyPairing()}
          disabled={!pairingInput.trim()}
        />
      </SectionCard>

      <SectionCard title="Connection" subtitle="Pairing fills these fields; manual setup can fill them directly.">
        <Field label="Runtime URL" value={runtimeUrl} onChangeText={setRuntimeUrl} placeholder="http://192.168.1.10:8000" />
        <Field label="Runtime key" value={runtimeKey} onChangeText={setRuntimeKey} placeholder="Paste runtime key" secureTextEntry />
        <Field label="Workspace ID" value={workspaceId} onChangeText={setWorkspaceId} placeholder="workspace id" />
        <Field label="Platform URL" value={platformUrl} onChangeText={setPlatformUrl} placeholder="Optional" />
        {pairingId ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
            <Ionicons name="link-outline" size={16} color={theme.colors.textMuted} />
            <Text style={{ flex: 1, color: theme.colors.textMuted, fontSize: theme.typography.caption, lineHeight: 18 }}>
              {pairingLabel || pairingId}{pairingExpiresAt ? ` expires ${new Date(pairingExpiresAt).toLocaleString()}` : ""}
            </Text>
          </View>
        ) : null}
        <ActionButton
          label={saving ? "Connecting..." : "Save connection"}
          icon="checkmark-circle-outline"
          variant="primary"
          disabled={!canSave}
          onPress={() => void handleSave()}
        />
      </SectionCard>

      <SectionCard title="Account sign in" subtitle="Use this when your build is configured for the hosted auth runtime.">
        <ActionButton label="Open sign in" icon="person-circle-outline" onPress={() => router.push("/login")} />
      </SectionCard>
    </MobileScreen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  secureTextEntry = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  secureTextEntry?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text style={{ color: theme.colors.textMuted, fontSize: theme.typography.caption, fontFamily: "DMSans_700Bold" }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        style={{
          minHeight: multiline ? 92 : 46,
          borderRadius: theme.radii.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.app,
          color: theme.colors.text,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm,
          fontSize: theme.typography.body,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}
