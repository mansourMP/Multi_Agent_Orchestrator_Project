import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { MobileScreen } from "@/src/components/MobileScreen";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { SectionCard } from "@/src/components/SectionCard";
import {
  getDefaultPlatformUrl,
  getDefaultRuntimeUrl,
  getDefaultWorkspaceId,
  mobileApi,
  testRuntimeConnection,
} from "@/src/lib/api";
import { ensureMobileDeviceId } from "@/src/lib/mobile-engine";
import {
  buildPairingDeepLink,
  decodePairingInput,
  encodePairingCode,
  formatPairingFallbackCode,
} from "@/src/lib/pairing";
import { resolvePreferredWorkspaceId, sessionUsesPlatformAccount } from "@/src/lib/session";
import { useSessionState } from "@/src/lib/session-context";
import type { TrustedDeviceSummary } from "@/src/lib/types";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export default function SessionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ pairing?: string }>();
  const { saveSession, session, clearSession } = useSessionState();
  const cloudConnected = sessionUsesPlatformAccount(session);
  const [runtimeUrl, setRuntimeUrl] = useState(session?.runtimeUrl ?? getDefaultRuntimeUrl());
  const [workspaceId, setWorkspaceId] = useState(session?.workspaceId ?? getDefaultWorkspaceId());
  const [platformUrl, setPlatformUrl] = useState(session?.platformUrl ?? getDefaultPlatformUrl());
  const [runtimeKey, setRuntimeKey] = useState(session?.runtimeKey ?? "");
  const [accountMode, setAccountMode] = useState<"signin" | "signup">("signin");
  const [accountName, setAccountName] = useState(session?.user?.name ?? "");
  const [accountEmail, setAccountEmail] = useState(session?.user?.email ?? "");
  const [accountPassword, setAccountPassword] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingMethod, setPairingMethod] = useState<"manual" | "pairing_qr" | "pairing_code">(
    session?.pairingMethod ?? "manual",
  );
  const [pairingDetails, setPairingDetails] = useState<ReturnType<typeof decodePairingInput> | null>(null);
  const [pairingNotice, setPairingNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [authSaving, setAuthSaving] = useState(false);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDeviceSummary[]>([]);
  const [currentTrustedDeviceId, setCurrentTrustedDeviceId] = useState("");
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvancedRuntime, setShowAdvancedRuntime] = useState(false);

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

  const canSaveRuntimeFallback = useMemo(
    () => runtimeKey.trim().length > 0 && runtimeUrl.trim().length > 0 && workspaceId.trim().length > 0,
    [runtimeKey, runtimeUrl, workspaceId],
  );
  const canSubmitAccount = useMemo(
    () =>
      runtimeUrl.trim().length > 0 &&
      accountEmail.trim().length > 0 &&
      accountPassword.trim().length > 0 &&
      (accountMode === "signin" || accountName.trim().length > 0),
    [accountEmail, accountMode, accountName, accountPassword, runtimeUrl],
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

  useEffect(() => {
    let active = true;
    if (!session?.authToken || !session.runtimeUrl.trim()) {
      setTrustedDevices([]);
      setCurrentTrustedDeviceId("");
      setDevicesLoading(false);
      setDevicesError(null);
      return () => {
        active = false;
      };
    }
    setDevicesLoading(true);
    setDevicesError(null);
    mobileApi.listTrustedDevices(session)
      .then((payload) => {
        if (!active) return;
        setTrustedDevices(payload.devices);
        setCurrentTrustedDeviceId(payload.currentDeviceId);
      })
      .catch((nextError) => {
        if (!active) return;
        setDevicesError(nextError instanceof Error ? nextError.message : "Failed to load trusted devices.");
      })
      .finally(() => {
        if (active) setDevicesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.authToken, session?.runtimeUrl, session?.workspaceId]);

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
            title="Sign in and connect"
            subtitle="Platform account sign-in is the primary paid path. The phone enters through the cloud platform first; local pairing and runtime-key entry stay under advanced settings for companion bootstrap or developer testing."
          />
        </View>
      </View>

      {session?.sessionRecovery?.needsReauth ? (
        <SectionCard
          title="Session recovery required"
          subtitle="This device was signed out or the recovery session expired. Sign in again to restore access. Re-pairing is not required unless you intentionally switch back to local runtime mode."
        >
          <Text style={{ color: theme.colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
            {session.sessionRecovery.recoveryReason || "Your mobile session needs to be refreshed."}
          </Text>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Platform account"
        subtitle="Sign in once with your Empyralis account. AI providers stay separate and can be connected later as capability, not identity."
      >
        {cloudConnected ? (
          <Text style={{ color: theme.colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
            Signed in as {session?.user?.email || "your account"} on workspace {session?.currentWorkspaceId || session?.workspaceId || "default"}.
          </Text>
        ) : null}
        <View
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            padding: 14,
            gap: 6,
          }}
        >
          <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: "700" }}>
            Cloud backend
          </Text>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
            {runtimeUrl.trim() || "This build does not have a cloud backend URL configured yet."}
          </Text>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
            Your personal workspace is selected automatically after sign-in. Use advanced settings only if you are overriding the backend for testing or local companion work.
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => setAccountMode("signin")}
            style={{
              height: 38,
              paddingHorizontal: 14,
              borderRadius: 999,
              backgroundColor: accountMode === "signin" ? theme.colors.accent : theme.colors.cardHover,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: accountMode === "signin" ? "#FFFFFF" : theme.colors.textSecondary, fontSize: 13, fontWeight: "700" }}>
              Sign in
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setAccountMode("signup")}
            style={{
              height: 38,
              paddingHorizontal: 14,
              borderRadius: 999,
              backgroundColor: accountMode === "signup" ? theme.colors.accent : theme.colors.cardHover,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: accountMode === "signup" ? "#FFFFFF" : theme.colors.textSecondary, fontSize: 13, fontWeight: "700" }}>
              Create account
            </Text>
          </Pressable>
        </View>
        {accountMode === "signup" ? (
          <Field
            label="Name"
            value={accountName}
            onChangeText={setAccountName}
            placeholder="Your name"
          />
        ) : null}
        <Field
          label="Email"
          value={accountEmail}
          onChangeText={setAccountEmail}
          placeholder="you@example.com"
        />
        <Field
          label="Password"
          value={accountPassword}
          onChangeText={setAccountPassword}
          placeholder={accountMode === "signin" ? "Enter your password" : "Create a password"}
          secureTextEntry
        />
        {!runtimeUrl.trim() ? (
          <Text style={{ color: theme.colors.warning, fontSize: 13, lineHeight: 20 }}>
            No cloud backend URL is configured in this build. Open advanced settings to override the backend URL for testing until the production endpoint is wired in.
          </Text>
        ) : null}
        <Text style={{ color: theme.colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
          Your account owns workspaces, runs, artifacts, approvals, and recovery. Provider connections like OpenAI or Anthropic attach later and do not replace account ownership.
        </Text>
        <Pressable
          onPress={async () => {
            if (!canSubmitAccount || authSaving) return;
            setAuthSaving(true);
            setError(null);
            try {
              const deviceId = await ensureMobileDeviceId(session?.deviceId);
              const payload =
                accountMode === "signup"
                  ? await mobileApi.registerAccount({
                      runtimeUrl,
                      name: accountName.trim(),
                      email: accountEmail.trim(),
                      password: accountPassword,
                      deviceId,
                      deviceName: "Empyralis mobile",
                      devicePlatform: Platform.OS,
                      workspaceId,
                    })
                  : await mobileApi.loginAccount({
                      runtimeUrl,
                      email: accountEmail.trim(),
                      password: accountPassword,
                      deviceId,
                      deviceName: "Empyralis mobile",
                      devicePlatform: Platform.OS,
                      workspaceId,
                    });
              const token = String(payload.token || "").trim();
              if (!token) {
                throw new Error("Account sign-in did not return a bearer token.");
              }
              const linkedAt = new Date().toISOString();
              await saveSession({
                authMode: "platform_account",
                runtimeUrl: runtimeUrl.trim(),
                runtimeKey: session?.runtimeKey ?? "",
                workspaceId: resolvePreferredWorkspaceId(workspaceId, payload.workspace_access, {
                  currentWorkspaceId: payload.current_workspace_id,
                  defaultWorkspaceId: payload.default_workspace_id,
                }),
                currentWorkspaceId: payload.current_workspace_id,
                defaultWorkspaceId: payload.default_workspace_id,
                currentTenantId: payload.current_tenant_id,
                defaultTenantId: payload.default_tenant_id,
                authToken: token,
                user: payload.user,
                workspaceAccess: payload.workspace_access,
                tenantAccess: payload.tenant_access,
                authSession: payload.auth_session,
                deviceLink: payload.device_link,
                identityBoundary: payload.identity_boundary,
                enterpriseSecurity: payload.enterprise_security,
                sessionRecovery: {
                  ...(payload.session_recovery || {}),
                  needsReauth: false,
                  recoveryReason: undefined,
                },
                platformUrl: platformUrl.trim() || undefined,
                platformKey: session?.platformKey,
                pairingMethod,
                pairedAt: session?.pairedAt,
                pairingId: pairingDetails?.pairingId ?? session?.pairingId,
                pairingExpiresAt: pairingDetails?.expiresAt ?? session?.pairingExpiresAt,
                pairingLabel: pairingDetails?.label ?? session?.pairingLabel,
                deviceId,
                sessionLinkedAt: linkedAt,
              });
              router.replace("/");
            } catch (nextError) {
              setError(nextError instanceof Error ? nextError.message : "Failed to sign in.");
            } finally {
              setAuthSaving(false);
            }
          }}
          disabled={!canSubmitAccount || authSaving}
          style={{
            marginTop: 4,
            height: 44,
            borderRadius: 12,
            backgroundColor: canSubmitAccount ? theme.colors.accent : theme.colors.cardHover,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: canSubmitAccount ? "#FFFFFF" : theme.colors.textSecondary, fontSize: 15, fontWeight: "700" }}>
            {authSaving ? "Signing in..." : accountMode === "signup" ? "Create account and continue" : "Sign in and continue"}
          </Text>
        </Pressable>
      </SectionCard>

      {session?.authToken ? (
        <SectionCard
          title="Trusted devices"
          subtitle="Trusted mobile sessions persist across restarts and normal time. Revoke only when you want a device to sign in again."
        >
          {devicesLoading ? (
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>Loading trusted devices…</Text>
          ) : null}
          {devicesError ? (
            <Text style={{ color: theme.colors.error, fontSize: 13 }}>{devicesError}</Text>
          ) : null}
          {!devicesLoading && !devicesError && trustedDevices.length === 0 ? (
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
              No trusted devices are linked to this account yet.
            </Text>
          ) : null}
          <View style={{ gap: 10 }}>
            {trustedDevices.map((device) => {
              const isCurrent = device.device_id === (currentTrustedDeviceId || session.deviceId);
              const label = device.display_name || device.platform || device.device_id;
              const meta = [device.platform ? device.platform.toUpperCase() : "", device.status || "", device.trust_state || ""]
                .filter(Boolean)
                .join(" • ");
              return (
                <View
                  key={device.device_id}
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                    padding: 14,
                    gap: 6,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: "700" }}>
                        {label}
                        {isCurrent ? " · This phone" : ""}
                      </Text>
                      {meta ? (
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
                          {meta}
                        </Text>
                      ) : null}
                      <Text style={{ color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
                        Last seen {formatEpoch(device.last_seen_at || device.updated_at || device.linked_at)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={async () => {
                        if (!session?.authToken || revokingDeviceId) return;
                        setRevokingDeviceId(device.device_id);
                        setDevicesError(null);
                        try {
                          const result = await mobileApi.revokeTrustedDevice(session, device.device_id);
                          if (result.revokedCurrentDevice || isCurrent) {
                            await clearSession();
                            setError("This device was revoked. Sign in again to reconnect.");
                            return;
                          }
                          setTrustedDevices((current) => current.filter((item) => item.device_id !== device.device_id));
                        } catch (nextError) {
                          setDevicesError(nextError instanceof Error ? nextError.message : "Failed to revoke the trusted device.");
                        } finally {
                          setRevokingDeviceId(null);
                        }
                      }}
                      disabled={Boolean(revokingDeviceId)}
                      style={{
                        height: 36,
                        paddingHorizontal: 14,
                        borderRadius: 999,
                        backgroundColor: theme.colors.cardHover,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: "700" }}>
                        {revokingDeviceId === device.device_id ? "Revoking…" : "Revoke"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Advanced local runtime and developer settings"
        subtitle="Only use this section when you are overriding the cloud backend, attaching a local companion or self-host runtime, or testing with a runtime API key."
      >
        <Pressable
          onPress={() => setShowAdvancedRuntime((current) => !current)}
          style={{
            height: 44,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: "700" }}>
            {showAdvancedRuntime ? "Hide advanced settings" : "Show advanced settings"}
          </Text>
        </Pressable>

        {showAdvancedRuntime ? (
          <View style={{ gap: 14 }}>
            <Field
              label="Backend URL override"
              value={runtimeUrl}
              onChangeText={setRuntimeUrl}
              placeholder="https://platform.your-domain.com"
              editable
            />
            <Field
              label="Workspace ID override"
              value={workspaceId}
              onChangeText={setWorkspaceId}
              placeholder="default"
              editable
            />
            <Field
              label="Platform URL override"
              value={platformUrl}
              onChangeText={setPlatformUrl}
              placeholder="Optional browser/control-plane URL"
              editable
            />

            <View style={{ gap: 10 }}>
              <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: "700" }}>
                Local runtime pairing
              </Text>
              <Text style={{ color: theme.colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
                Pairing is kept here for local companion bootstrap and direct device testing. It is not the normal paid mobile login path, and it does not replace the workspace account model.
              </Text>
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
                  marginTop: 2,
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
            </View>

            <View style={{ gap: 10 }}>
              <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: "700" }}>
                Runtime-key fallback
              </Text>
              <Text style={{ color: theme.colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
                Keep this only for local development, self-host runtime testing, direct LAN sessions, or advanced recovery cases.
              </Text>
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
                  if (!canSaveRuntimeFallback || saving) return;
                  setSaving(true);
                  setError(null);
                  try {
                    await testRuntimeConnection(runtimeKey, runtimeUrl);
                    const linkedAt = new Date().toISOString();
                    const deviceId = await ensureMobileDeviceId(session?.deviceId);
                    await saveSession({
                      authMode: "runtime_key",
                      runtimeUrl: runtimeUrl.trim(),
                      runtimeKey: runtimeKey.trim(),
                      workspaceId: workspaceId.trim(),
                      authToken: undefined,
                      user: session?.user,
                      workspaceAccess: session?.workspaceAccess,
                      tenantAccess: session?.tenantAccess,
                      authSession: undefined,
                      deviceLink: session?.deviceLink,
                      identityBoundary: session?.identityBoundary,
                      enterpriseSecurity: session?.enterpriseSecurity,
                      sessionRecovery: session?.sessionRecovery,
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
                  marginTop: 2,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: canSaveRuntimeFallback ? theme.colors.accent : theme.colors.cardHover,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: canSaveRuntimeFallback ? "#FFFFFF" : theme.colors.textSecondary, fontSize: 15, fontWeight: "700" }}>
                  {saving ? "Connecting..." : "Connect local runtime"}
                </Text>
              </Pressable>
            </View>

            <View style={{ gap: 10 }}>
              <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: "700" }}>
                Pairing packet
              </Text>
              <Field label="Deep link" value={previewPairingLink} placeholder="" editable={false} multiline />
              <Field label="Fallback code" value={formattedPairingCode} placeholder="" editable={false} multiline />
              <Text style={{ color: theme.colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
                Current method: {pairingMethod === "manual" ? "Manual entry" : pairingMethod === "pairing_qr" ? "QR pairing" : "Pairing code"}.
              </Text>
            </View>
          </View>
        ) : (
          <Text style={{ color: theme.colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
            The public cloud backend remains the default mobile path. Expand this section only when you intentionally need local runtime controls.
          </Text>
        )}
      </SectionCard>
    </MobileScreen>
  );
}

function buildPairingNotice(
  pairing: ReturnType<typeof decodePairingInput>,
  prefix: string,
) {
  const parts = [prefix, "Use this to prefill the local runtime fallback if you want direct companion access."];
  if (pairing.label) {
    parts.push(`Label: ${pairing.label}.`);
  }
  if (pairing.expiresAt) {
    parts.push(`Expires ${new Date(pairing.expiresAt).toLocaleString()}.`);
  }
  return parts.join(" ");
}

function formatEpoch(value?: number | null) {
  if (!value || Number.isNaN(value)) return "recently";
  try {
    return new Date(value * 1000).toLocaleString();
  } catch {
    return "recently";
  }
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
