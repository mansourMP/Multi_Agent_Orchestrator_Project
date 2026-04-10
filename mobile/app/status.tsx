import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { CoreStatusBar } from "@/src/components/CoreStatusBar";
import { MobileScreen } from "@/src/components/MobileScreen";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { SectionCard } from "@/src/components/SectionCard";
import { useMobileChatContext } from "@/src/lib/mobile-data";
import { useSessionState } from "@/src/lib/session-context";
import type { RuntimeAttachmentSummary } from "@/src/lib/types";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export default function StatusScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSessionState();
  const chatContextQuery = useMobileChatContext();
  const runtimeAttachments = chatContextQuery.data?.runtimeAttachments;
  const unifiedMemory = chatContextQuery.data?.unifiedMemory;
  const scheduler = chatContextQuery.data?.scheduler;
  const continuity = summarizeStatusTopology(runtimeAttachments?.attachments ?? []);
  const deploymentMode = formatDeploymentMode(runtimeAttachments?.deploymentMode);
  const localOnlyLayers = unifiedMemory?.boundaryMap.neverSyncByDefault.length ?? 0;
  const cloudSyncedLayers = unifiedMemory?.boundaryMap.cloudSyncedByDefault.length ?? 0;
  const optInLayers = unifiedMemory?.boundaryMap.explicitOptIn.length ?? 0;
  const queuedWakeups = Number(scheduler?.wakeQueue?.pending_count ?? 0) || 0;

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
          <ScreenHeader title="Status" subtitle="Core connection and runtime availability." />
        </View>
      </View>

      <SectionCard title="Runtime Health" subtitle="A live check against your connected personal core.">
        <CoreStatusBar variant="banner" style={{ marginTop: 0 }} />
      </SectionCard>

      <SectionCard title="Connection Details" subtitle="The endpoints currently available to this device.">
        <DetailRow label="Runtime URL" value={session?.runtimeUrl || "Not connected"} multiline />
        <DetailRow label="Workspace ID" value={session?.workspaceId || "default"} />
        <DetailRow label="Platform URL" value={session?.platformUrl || "Not configured"} multiline />

        <TouchableOpacity
          activeOpacity={0.86}
          onPress={() => router.push("/session")}
          style={{
            marginTop: 4,
            height: 42,
            alignSelf: "flex-start",
            paddingHorizontal: 16,
            borderRadius: 999,
            backgroundColor: theme.colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>Manage accounts</Text>
        </TouchableOpacity>
      </SectionCard>

      <SectionCard title="Runtime Topology" subtitle="Phone and desktop share the same Sage, with placement decided by runtime health and policy.">
        <DetailRow label="Deployment mode" value={deploymentMode} />
        <DetailRow label="Attached runtimes" value={String(runtimeAttachments?.attachments.length ?? 0)} />
        <DetailRow label="Healthy continuity" value={continuity} />
        <DetailRow label="Placement rule" value="Capability follows runtime availability and policy, not the phone surface." multiline />
      </SectionCard>

      <SectionCard title="Memory Boundary" subtitle="Safe summaries on phone, deeper controls on desktop-power.">
        <DetailRow label="Local by default" value={`${localOnlyLayers} layer${localOnlyLayers === 1 ? "" : "s"}`} />
        <DetailRow label="Cloud-safe by default" value={`${cloudSyncedLayers} layer${cloudSyncedLayers === 1 ? "" : "s"}`} />
        <DetailRow label="Explicit opt-in" value={`${optInLayers} layer${optInLayers === 1 ? "" : "s"}`} />
        <DetailRow label="Queued wakeups" value={String(queuedWakeups)} />
      </SectionCard>
    </MobileScreen>
  );
}

function DetailRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: 5 }}>
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
      <Text style={{ color: theme.colors.text, fontSize: 14, lineHeight: multiline ? 21 : 20 }}>{value}</Text>
    </View>
  );
}

function formatDeploymentMode(value: string | undefined): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "cloud_only") return "Cloud + Phone";
  if (normalized === "local_only") return "Local Core";
  if (normalized === "hybrid") return "Hybrid Core";
  if (normalized === "self_hosted_business") return "Self-Hosted";
  return "Connected Core";
}

function summarizeStatusTopology(attachments: RuntimeAttachmentSummary[]): string {
  if (!attachments.length) return "No runtime attachments reported yet.";
  const local = attachments.filter((item) => item.attachment_kind === "local_companion");
  const healthy = attachments.filter((item) => item.healthy !== false && item.online !== false).length;
  if (local.length > 0 && local.every((item) => item.healthy === false || item.online === false)) {
    return "Local continuity is degraded while the paired companion is offline.";
  }
  return `${healthy}/${attachments.length} attachment${attachments.length === 1 ? "" : "s"} healthy, with ${local.length} local companion${local.length === 1 ? "" : "s"} available for private execution.`;
}
