import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { MobileScreen } from "@/src/components/MobileScreen";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { SurfaceStatusBanner } from "@/src/components/SurfaceStatusBanner";
import { mobileApi } from "@/src/lib/api";
import { formatRelativeTime } from "@/src/lib/kin-surface";
import { useMobileApprovals } from "@/src/lib/mobile-data";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

export default function ApprovalsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSessionState();
  const approvalsQuery = useMobileApprovals();
  const approvals = approvalsQuery.data ?? [];
  const [busyId, setBusyId] = useState<string | null>(null);

  const resolve = async (approvalId: string, runId: string, decision: "approved" | "rejected") => {
    if (!session) return;
    setBusyId(approvalId);
    try {
      await mobileApi.resolveApproval(session, runId, approvalId, decision);
      await approvalsQuery.refetch();
    } finally {
      setBusyId(null);
    }
  };

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
          <ScreenHeader title="Approvals" subtitle="Live approval queue with five-second refresh." />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {approvalsQuery.statusMessage ? (
          <View style={{ marginTop: 12 }}>
            <SurfaceStatusBanner message={approvalsQuery.statusMessage} />
          </View>
        ) : null}
        <View style={{ gap: 12, marginTop: 12 }}>
          {approvals.map((approval) => (
            <View
              key={approval.approval_id}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                padding: 16,
                gap: 10,
              }}
            >
              <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>{approval.action}</Text>
              {approval.target ? (
                <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                  {approval.target}
                </Text>
              ) : null}
              <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
                {approval.summary || "This run is waiting for your approval."}
              </Text>
              {approval.email_preview?.subject ? (
                <Text style={{ fontSize: 13, color: theme.colors.text }}>
                  Subject: {approval.email_preview.subject}
                </Text>
              ) : null}
              {approval.email_preview?.body_preview ? (
                <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.textSecondary }}>
                  {approval.email_preview.body_preview}
                </Text>
              ) : null}
              <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                {formatRelativeTime(approval.requested_at)} · {approval.status}
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={() => void resolve(approval.approval_id, approval.run_id, "approved")}
                  disabled={busyId === approval.approval_id}
                  style={{
                    flex: 1,
                    height: 42,
                    borderRadius: 12,
                    backgroundColor: theme.colors.accent,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
                    {busyId === approval.approval_id ? "Working..." : "Approve"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={() => void resolve(approval.approval_id, approval.run_id, "rejected")}
                  disabled={busyId === approval.approval_id}
                  style={{
                    flex: 1,
                    height: 42,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.background,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: "700" }}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {!approvalsQuery.isLoading && approvals.length === 0 ? (
            <View style={{ padding: 16, borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ color: theme.colors.textSecondary }}>No approvals are waiting right now.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </MobileScreen>
  );
}
