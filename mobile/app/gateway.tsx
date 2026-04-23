import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { MobileScreen } from "@/src/components/MobileScreen";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { mobileApi } from "@/src/lib/api";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

type GatewayRegistrationRecord = Record<string, unknown> & {
  gateway_id?: string | null;
  display_name?: string | null;
  platform?: string | null;
  status?: string | null;
  device_trust_state?: string | null;
  last_seen_at?: string | null;
};

type GatewayApprovalRecord = Record<string, unknown> & {
  approval_id?: string | null;
  capability_id?: string | null;
  status?: string | null;
  run_id?: string | null;
  note?: string | null;
};

type GatewayBrowserSessionRecord = Record<string, unknown> & {
  browser_session_id?: string | null;
  status?: string | null;
  session_profile?: string | null;
  current_url?: string | null;
  resume_supported?: boolean | null;
  metadata?: Record<string, unknown> | null;
};

type PersonalChannelStateRecord = Record<string, unknown> & {
  status?: string | null;
  qr_code?: string | null;
  login_hint?: string | null;
  linked_name?: string | null;
  linked_jid?: string | null;
  linked_phone?: string | null;
  linked_username?: string | null;
};

function readString(value: unknown, fallback = "Unknown") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function humanizeToken(value: unknown, fallback = "Unknown") {
  const token = String(value ?? "").trim();
  if (!token) {
    return fallback;
  }
  return token
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTimestamp(value: unknown) {
  const token = String(value ?? "").trim();
  if (!token) {
    return "Not available";
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(token));
  } catch {
    return token;
  }
}

function normalizeGatewayRegistrations(payload: Record<string, unknown> | null | undefined): GatewayRegistrationRecord[] {
  return Array.isArray(payload?.items)
    ? payload.items.filter((item): item is GatewayRegistrationRecord => Boolean(item) && typeof item === "object")
    : [];
}

function normalizeGatewayApprovals(payload: Record<string, unknown> | null | undefined): GatewayApprovalRecord[] {
  const items = Array.isArray(payload?.items)
    ? payload.items.filter((item): item is GatewayApprovalRecord => Boolean(item) && typeof item === "object")
    : [];
  return [...items].sort((left, right) => {
    const leftPending = String(left.status ?? "").trim().toLowerCase() === "pending";
    const rightPending = String(right.status ?? "").trim().toLowerCase() === "pending";
    if (leftPending !== rightPending) {
      return leftPending ? -1 : 1;
    }
    return String(left.approval_id ?? "").localeCompare(String(right.approval_id ?? ""));
  });
}

function normalizeBrowserSessions(payload: Record<string, unknown> | null | undefined): GatewayBrowserSessionRecord[] {
  const items = Array.isArray(payload?.items)
    ? payload.items.filter((item): item is GatewayBrowserSessionRecord => Boolean(item) && typeof item === "object")
    : [];
  return [...items].sort((left, right) => {
    const leftStatus = String(left.status ?? "").trim().toLowerCase();
    const rightStatus = String(right.status ?? "").trim().toLowerCase();
    if (leftStatus !== rightStatus) {
      if (leftStatus === "active" || leftStatus === "attached") {
        return -1;
      }
      if (rightStatus === "active" || rightStatus === "attached") {
        return 1;
      }
    }
    return String(left.browser_session_id ?? "").localeCompare(String(right.browser_session_id ?? ""));
  });
}

function toneColors(status: unknown) {
  const token = String(status ?? "").trim().toLowerCase();
  if (["healthy", "active", "connected", "attached", "approved", "pass", "executed"].includes(token)) {
    return {
      background: "#EAFBF1",
      border: "#B8E7C9",
      text: "#13653A",
    };
  }
  if (["pending", "requested", "approval_required", "warn", "attach_required", "degraded", "waiting_for_input"].includes(token)) {
    return {
      background: "#FFF7E8",
      border: "#F2D7A4",
      text: "#8A5A00",
    };
  }
  if (["blocked", "rejected", "fail", "attach_failed", "offline", "not_attached", "revoked"].includes(token)) {
    return {
      background: "#FFF0EF",
      border: "#F3C7C3",
      text: "#B23B30",
    };
  }
  return {
    background: "#F4F5F7",
    border: "#E0E3E8",
    text: "#586070",
  };
}

function summarizeWhatsappState(state: PersonalChannelStateRecord | null | undefined) {
  if (!state) {
    return "Gateway has not reported WhatsApp personal state yet.";
  }
  if (state.qr_code) {
    return "QR token is ready for the linked WhatsApp Web session.";
  }
  if (String(state.status ?? "").trim().toLowerCase() === "connected") {
    return `${readString(state.linked_name, readString(state.linked_jid, "Linked account"))} is connected.`;
  }
  return `WhatsApp personal is ${humanizeToken(state.status, "Idle")}.`;
}

function summarizeTelegramState(state: PersonalChannelStateRecord | null | undefined) {
  if (!state) {
    return "Gateway has not reported Telegram personal state yet.";
  }
  if (state.login_hint) {
    return "Telegram is waiting for a login code or confirmation.";
  }
  if (String(state.status ?? "").trim().toLowerCase() === "connected") {
    return `${readString(state.linked_name, readString(state.linked_username, readString(state.linked_phone, "Linked account")))} is connected.`;
  }
  return `Telegram personal is ${humanizeToken(state.status, "Idle")}.`;
}

function DetailCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: 16,
        gap: 12,
      }}
    >
      <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>{title}</Text>
      {children}
    </View>
  );
}

function TonePill({ value }: { value: string }) {
  const palette = toneColors(value);
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
      }}
    >
      <Text style={{ color: palette.text, fontSize: 12, fontWeight: "700" }}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  tone = "primary",
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  tone?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}) {
  const theme = useTheme();
  const backgroundColor = tone === "primary"
    ? theme.colors.accent
    : tone === "danger"
      ? "#FFF4F3"
      : theme.colors.surface;
  const borderColor = tone === "primary"
    ? theme.colors.accent
    : tone === "danger"
      ? "rgba(194, 65, 59, 0.2)"
      : theme.colors.border;
  const textColor = tone === "primary" ? "#FFFFFF" : tone === "danger" ? "#C2413B" : theme.colors.text;

  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={onPress}
      disabled={disabled}
      style={{
        minHeight: 40,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor,
        backgroundColor,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <Text style={{ color: textColor, fontWeight: "700", fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function GatewayScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSessionState();
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>(null);
  const [pairingLabel, setPairingLabel] = useState("My device");
  const [pairingPlatform, setPairingPlatform] = useState<"macos" | "windows" | "linux">("macos");
  const [pairingIntent, setPairingIntent] = useState<Record<string, unknown> | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const registrationsQuery = useQuery({
    queryKey: ["mobile", "gateway-registrations", session?.runtimeUrl, session?.workspaceId],
    enabled: Boolean(session?.runtimeUrl && session?.runtimeKey),
    retry: false,
    refetchInterval: session?.runtimeUrl && session?.runtimeKey ? 15_000 : false,
    queryFn: async () => normalizeGatewayRegistrations(await mobileApi.listGatewayRegistrations(session!)),
  });

  const selectedGateway = useMemo(
    () =>
      (registrationsQuery.data ?? []).find((gateway) => String(gateway.gateway_id ?? "").trim() === String(selectedGatewayId ?? "").trim()) ?? null,
    [registrationsQuery.data, selectedGatewayId],
  );

  useEffect(() => {
    const items = registrationsQuery.data ?? [];
    setSelectedGatewayId((current) => {
      if (current && items.some((item) => String(item.gateway_id ?? "").trim() === current)) {
        return current;
      }
      return String(items[0]?.gateway_id ?? "").trim() || null;
    });
  }, [registrationsQuery.data]);

  const doctorQuery = useQuery({
    queryKey: ["mobile", "gateway-doctor", session?.runtimeUrl, session?.workspaceId, selectedGatewayId],
    enabled: Boolean(session?.runtimeUrl && session?.runtimeKey && selectedGatewayId),
    retry: false,
    refetchInterval: selectedGatewayId ? 15_000 : false,
    queryFn: async () => mobileApi.getGatewayDoctor(session!, selectedGatewayId!),
  });

  const whatsappQuery = useQuery({
    queryKey: ["mobile", "gateway-whatsapp", session?.runtimeUrl, session?.workspaceId, selectedGatewayId],
    enabled: Boolean(session?.runtimeUrl && session?.runtimeKey && selectedGatewayId),
    retry: false,
    refetchInterval: selectedGatewayId ? 15_000 : false,
    queryFn: async () => mobileApi.getGatewayWhatsappStatus(session!, selectedGatewayId!),
  });

  const telegramQuery = useQuery({
    queryKey: ["mobile", "gateway-telegram", session?.runtimeUrl, session?.workspaceId, selectedGatewayId],
    enabled: Boolean(session?.runtimeUrl && session?.runtimeKey && selectedGatewayId),
    retry: false,
    refetchInterval: selectedGatewayId ? 15_000 : false,
    queryFn: async () => mobileApi.getGatewayTelegramStatus(session!, selectedGatewayId!),
  });

  const approvalsQuery = useQuery({
    queryKey: ["mobile", "gateway-approvals", session?.runtimeUrl, session?.workspaceId, selectedGatewayId],
    enabled: Boolean(session?.runtimeUrl && session?.runtimeKey && selectedGatewayId),
    retry: false,
    refetchInterval: selectedGatewayId ? 10_000 : false,
    queryFn: async () => normalizeGatewayApprovals(await mobileApi.listGatewayApprovals(session!, selectedGatewayId!)),
  });

  const browserQuery = useQuery({
    queryKey: ["mobile", "gateway-browser", session?.runtimeUrl, session?.workspaceId, selectedGatewayId],
    enabled: Boolean(session?.runtimeUrl && session?.runtimeKey && selectedGatewayId),
    retry: false,
    refetchInterval: selectedGatewayId ? 15_000 : false,
    queryFn: async () => normalizeBrowserSessions(await mobileApi.listGatewayBrowserSessions(session!, selectedGatewayId!)),
  });

  async function refreshAll() {
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await registrationsQuery.refetch();
      if (selectedGatewayId) {
        await Promise.all([
          doctorQuery.refetch(),
          whatsappQuery.refetch(),
          telegramQuery.refetch(),
          approvalsQuery.refetch(),
          browserQuery.refetch(),
        ]);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not refresh gateway state.");
    }
  }

  async function handleCreatePairingIntent() {
    if (!session) {
      return;
    }
    setBusyKey("pairing");
    setErrorMessage(null);
    try {
      const payload = await mobileApi.createGatewayPairingIntent(session, {
        display_name: pairingLabel.trim() || undefined,
        platform: pairingPlatform,
      });
      setPairingIntent(payload);
      setStatusMessage("Gateway pairing token is ready. Finish registration from the local gateway app on that device.");
      await registrationsQuery.refetch();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create a pairing token.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleResolveApproval(approvalId: string, decision: "approved" | "rejected") {
    if (!session || !selectedGatewayId) {
      return;
    }
    const key = `approval:${approvalId}:${decision}`;
    setBusyKey(key);
    setErrorMessage(null);
    try {
      await mobileApi.resolveGatewayApproval(
        session,
        selectedGatewayId,
        approvalId,
        decision,
        decision === "approved"
          ? "Approved from mobile gateway controls."
          : "Rejected from mobile gateway controls.",
      );
      setStatusMessage(decision === "approved" ? "Gateway approval accepted." : "Gateway approval rejected.");
      await approvalsQuery.refetch();
      await doctorQuery.refetch();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not resolve the gateway approval.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleBrowserControl(browserSessionId: string, action: "takeover" | "resume" | "interrupt") {
    if (!session || !selectedGatewayId) {
      return;
    }
    const key = `browser:${browserSessionId}:${action}`;
    setBusyKey(key);
    setErrorMessage(null);
    try {
      const payload = await mobileApi.controlGatewayBrowserSession(
        session,
        selectedGatewayId,
        browserSessionId,
        action,
        {
          note:
            action === "interrupt"
              ? "Interrupted from mobile gateway controls."
              : action === "takeover"
                ? "Takeover requested from mobile gateway controls."
                : "Resume requested from mobile gateway controls.",
        },
      );
      setStatusMessage(`${humanizeToken(action)} sent. Status: ${humanizeToken((payload as Record<string, unknown>).status, "requested")}.`);
      await browserQuery.refetch();
      await doctorQuery.refetch();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not control the gateway browser session.");
    } finally {
      setBusyKey(null);
    }
  }

  const doctorPayload = doctorQuery.data ?? null;
  const whatsappState = (whatsappQuery.data?.state ?? null) as PersonalChannelStateRecord | null;
  const telegramState = (telegramQuery.data?.state ?? null) as PersonalChannelStateRecord | null;
  const approvals = approvalsQuery.data ?? [];
  const browserSessions = browserQuery.data ?? [];
  const derivedErrorMessage =
    errorMessage
    || (registrationsQuery.error instanceof Error ? registrationsQuery.error.message : null)
    || (doctorQuery.error instanceof Error ? doctorQuery.error.message : null)
    || (whatsappQuery.error instanceof Error ? whatsappQuery.error.message : null)
    || (telegramQuery.error instanceof Error ? telegramQuery.error.message : null)
    || (approvalsQuery.error instanceof Error ? approvalsQuery.error.message : null)
    || (browserQuery.error instanceof Error ? browserQuery.error.message : null);

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
          <ScreenHeader title="Gateway" subtitle="Pair devices, inspect personal channels, and control governed browser sessions." />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={{ gap: 12, marginTop: 12 }}>
          {statusMessage ? (
            <View style={{ borderRadius: 16, padding: 14, backgroundColor: "#EAFBF1", borderWidth: 1, borderColor: "#B8E7C9" }}>
              <Text style={{ color: "#13653A", fontWeight: "600" }}>{statusMessage}</Text>
            </View>
          ) : null}
          {derivedErrorMessage ? (
            <View style={{ borderRadius: 16, padding: 14, backgroundColor: "#FFF0EF", borderWidth: 1, borderColor: "#F3C7C3" }}>
              <Text style={{ color: "#B23B30", fontWeight: "600" }}>{derivedErrorMessage}</Text>
            </View>
          ) : null}

          <DetailCard title="Pair a new gateway">
            <Text style={{ fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary }}>
              Create a short-lived pairing token for the machine that will run empyralis-gateway.
            </Text>
            <TextInput
              value={pairingLabel}
              onChangeText={setPairingLabel}
              placeholder="My MacBook"
              placeholderTextColor={theme.colors.textSecondary}
              style={{
                height: 46,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.background,
                paddingHorizontal: 14,
                color: theme.colors.text,
              }}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["macos", "windows", "linux"] as const).map((platform) => (
                <ActionButton
                  key={platform}
                  label={humanizeToken(platform)}
                  tone={pairingPlatform === platform ? "primary" : "secondary"}
                  onPress={() => setPairingPlatform(platform)}
                />
              ))}
            </View>
            <ActionButton
              label={busyKey === "pairing" ? "Creating token..." : "Create pairing token"}
              onPress={() => void handleCreatePairingIntent()}
              disabled={busyKey === "pairing" || !session}
            />
            {pairingIntent ? (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 12.5, color: theme.colors.textSecondary }}>Pairing token</Text>
                <Text style={{ fontSize: 13, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                  {readString(pairingIntent.pairing_token, "Unavailable")}
                </Text>
                <Text style={{ fontSize: 12.5, color: theme.colors.textSecondary }}>
                  Expires {formatTimestamp(pairingIntent.expires_at)}
                </Text>
              </View>
            ) : null}
          </DetailCard>

          <DetailCard title="Paired gateways">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                {registrationsQuery.isLoading ? "Loading paired devices..." : `${registrationsQuery.data?.length || 0} gateway(s)`}
              </Text>
              <ActionButton label="Refresh" tone="secondary" onPress={() => void refreshAll()} disabled={registrationsQuery.isFetching} />
            </View>
            {(registrationsQuery.data ?? []).length === 0 && !registrationsQuery.isLoading ? (
              <Text style={{ fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary }}>
                No gateways are paired yet. Create a token above, then finish registration on the target machine.
              </Text>
            ) : null}
            {(registrationsQuery.data ?? []).map((gateway) => {
              const gatewayId = String(gateway.gateway_id ?? "").trim();
              const selected = gatewayId === selectedGatewayId;
              return (
                <TouchableOpacity
                  key={gatewayId}
                  activeOpacity={0.86}
                  onPress={() => setSelectedGatewayId(gatewayId)}
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: selected ? theme.colors.accent : theme.colors.border,
                    backgroundColor: selected ? "#F5F9FF" : theme.colors.background,
                    padding: 14,
                    gap: 8,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                        {readString(gateway.display_name, gatewayId)}
                      </Text>
                      <Text style={{ marginTop: 2, fontSize: 12.5, color: theme.colors.textSecondary }}>
                        {humanizeToken(gateway.platform, "Unknown platform")} · {gatewayId}
                      </Text>
                    </View>
                    <TonePill value={humanizeToken(gateway.status, "Unknown")} />
                  </View>
                  <Text style={{ fontSize: 12.5, color: theme.colors.textSecondary }}>
                    Trust {humanizeToken(gateway.device_trust_state, "Unknown")} · last seen {formatTimestamp(gateway.last_seen_at)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </DetailCard>

          {selectedGateway ? (
            <DetailCard title="Gateway doctor">
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                    {readString(selectedGateway.display_name, String(selectedGateway.gateway_id ?? ""))}
                  </Text>
                  <Text style={{ marginTop: 4, fontSize: 22, fontFamily: "Fraunces_700Bold", color: theme.colors.text }}>
                    {humanizeToken((doctorPayload as Record<string, unknown> | null)?.status, "Unknown")}
                  </Text>
                </View>
                <TonePill value={humanizeToken((doctorPayload as Record<string, unknown> | null)?.status, "Unknown")} />
              </View>
              {Array.isArray((doctorPayload as Record<string, unknown> | null)?.checks)
                ? ((doctorPayload as Record<string, unknown>).checks as Record<string, unknown>[]).map((check, index) => (
                    <View
                      key={`${String(check.id || "check")}:${index}`}
                      style={{
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.background,
                        padding: 12,
                        gap: 8,
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                        <Text style={{ flex: 1, fontSize: 14, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                          {humanizeToken(check.id, "Check")}
                        </Text>
                        <TonePill value={humanizeToken(check.status, "Unknown")} />
                      </View>
                      <Text style={{ fontSize: 12.5, lineHeight: 19, color: theme.colors.textSecondary }}>
                        {readString(check.summary, "No detail available.")}
                      </Text>
                    </View>
                  ))
                : null}
            </DetailCard>
          ) : null}

          {selectedGateway ? (
            <DetailCard title="Personal channels">
              <View style={{ gap: 12 }}>
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <Text style={{ fontSize: 14, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>WhatsApp personal</Text>
                    <TonePill value={whatsappState?.qr_code ? "QR ready" : humanizeToken(whatsappState?.status, "Idle")} />
                  </View>
                  <Text style={{ fontSize: 12.5, lineHeight: 19, color: theme.colors.textSecondary }}>
                    {summarizeWhatsappState(whatsappState)}
                  </Text>
                  {whatsappState?.qr_code ? (
                    <Text style={{ fontSize: 12.5, color: theme.colors.text }}>QR token: {readString(whatsappState.qr_code, "Unavailable")}</Text>
                  ) : null}
                </View>
                <View style={{ height: 1, backgroundColor: theme.colors.border }} />
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <Text style={{ fontSize: 14, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>Telegram personal</Text>
                    <TonePill value={telegramState?.login_hint ? "Code required" : humanizeToken(telegramState?.status, "Idle")} />
                  </View>
                  <Text style={{ fontSize: 12.5, lineHeight: 19, color: theme.colors.textSecondary }}>
                    {summarizeTelegramState(telegramState)}
                  </Text>
                  {telegramState?.login_hint ? (
                    <Text style={{ fontSize: 12.5, color: theme.colors.text }}>Login hint: {readString(telegramState.login_hint, "Waiting for code")}</Text>
                  ) : null}
                </View>
              </View>
            </DetailCard>
          ) : null}

          {selectedGateway ? (
            <DetailCard title="Gateway approvals">
              {approvals.length === 0 ? (
                <Text style={{ fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary }}>
                  No gateway approvals are waiting right now.
                </Text>
              ) : (
                approvals.map((approval) => {
                  const approvalId = String(approval.approval_id ?? "").trim();
                  return (
                    <View
                      key={approvalId}
                      style={{
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.background,
                        padding: 14,
                        gap: 10,
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                            {humanizeToken(approval.capability_id, "Gateway approval")}
                          </Text>
                          <Text style={{ marginTop: 2, fontSize: 12.5, color: theme.colors.textSecondary }}>
                            {approvalId} · Run {readString(approval.run_id, "unlinked")}
                          </Text>
                        </View>
                        <TonePill value={humanizeToken(approval.status, "Pending")} />
                      </View>
                      <Text style={{ fontSize: 12.5, lineHeight: 19, color: theme.colors.textSecondary }}>
                        {readString(approval.note, "Approval required before Sage can continue on the paired device.")}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <ActionButton
                          label={busyKey === `approval:${approvalId}:approved` ? "Approving..." : "Approve"}
                          tone="secondary"
                          disabled={Boolean(busyKey)}
                          onPress={() => void handleResolveApproval(approvalId, "approved")}
                        />
                        <ActionButton
                          label={busyKey === `approval:${approvalId}:rejected` ? "Rejecting..." : "Reject"}
                          tone="danger"
                          disabled={Boolean(busyKey)}
                          onPress={() => void handleResolveApproval(approvalId, "rejected")}
                        />
                      </View>
                    </View>
                  );
                })
              )}
            </DetailCard>
          ) : null}

          {selectedGateway ? (
            <DetailCard title="Browser sessions">
              {browserSessions.length === 0 ? (
                <Text style={{ fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary }}>
                  No gateway browser sessions are tracked yet.
                </Text>
              ) : (
                browserSessions.map((sessionRecord) => {
                  const browserSessionId = String(sessionRecord.browser_session_id ?? "").trim();
                  const sessionMode = humanizeToken((sessionRecord.metadata || {}).browser_session_mode, "Managed profile");
                  const resumeSupported = Boolean(sessionRecord.resume_supported ?? true);
                  return (
                    <View
                      key={browserSessionId}
                      style={{
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.background,
                        padding: 14,
                        gap: 10,
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                            {readString(sessionRecord.session_profile, browserSessionId)}
                          </Text>
                          <Text style={{ marginTop: 2, fontSize: 12.5, color: theme.colors.textSecondary }}>
                            {sessionMode} · {browserSessionId}
                          </Text>
                        </View>
                        <TonePill value={humanizeToken(sessionRecord.status, "Unknown")} />
                      </View>
                      <Text style={{ fontSize: 12.5, lineHeight: 19, color: theme.colors.textSecondary }}>
                        {readString(sessionRecord.current_url, "No active URL reported yet.")}
                      </Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        <ActionButton
                          label={busyKey === `browser:${browserSessionId}:takeover` ? "Working..." : "Takeover"}
                          tone="secondary"
                          disabled={Boolean(busyKey)}
                          onPress={() => void handleBrowserControl(browserSessionId, "takeover")}
                        />
                        <ActionButton
                          label={busyKey === `browser:${browserSessionId}:resume` ? "Working..." : "Resume"}
                          tone="secondary"
                          disabled={Boolean(busyKey) || !resumeSupported}
                          onPress={() => void handleBrowserControl(browserSessionId, "resume")}
                        />
                        <ActionButton
                          label={busyKey === `browser:${browserSessionId}:interrupt` ? "Working..." : "Interrupt"}
                          tone="danger"
                          disabled={Boolean(busyKey)}
                          onPress={() => void handleBrowserControl(browserSessionId, "interrupt")}
                        />
                      </View>
                    </View>
                  );
                })
              )}
            </DetailCard>
          ) : null}
        </View>
      </ScrollView>
    </MobileScreen>
  );
}
