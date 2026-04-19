import React from "react";
import { ScrollView, Switch, Text, TouchableOpacity, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { MobileScreen } from "@/src/components/MobileScreen";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { mobileApi, type MobileScheduleRecord } from "@/src/lib/api";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

type AutomationPreset = {
  id: string;
  title: string;
  subtitle: string;
  scheduleLabel: string;
  cron: string;
  goal: string;
};

const PRESETS: AutomationPreset[] = [
  {
    id: "morning_brief",
    title: "Morning brief",
    subtitle: "Start the day with a short brief from Sage.",
    scheduleLabel: "Weekdays at 7:30 AM",
    cron: "30 7 * * 1-5",
    goal: "Prepare my morning brief with the most important things to know today.",
  },
  {
    id: "evening_wrap",
    title: "Evening wrap-up",
    subtitle: "Close the day with a short recap and tomorrow focus.",
    scheduleLabel: "Weekdays at 7:00 PM",
    cron: "0 19 * * 1-5",
    goal: "Prepare my evening wrap-up with what moved forward today and what matters next tomorrow.",
  },
  {
    id: "weekly_planning",
    title: "Weekly planning",
    subtitle: "Have Sage reset the week before it starts.",
    scheduleLabel: "Sundays at 6:00 PM",
    cron: "0 18 * * 0",
    goal: "Prepare my weekly planning session with priorities, open loops, and the next week plan.",
  },
];

function getPresetMetadata(schedule: MobileScheduleRecord | undefined) {
  const metadata = schedule?.run_request?.metadata;
  return metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
}

function findPresetSchedule(
  schedules: MobileScheduleRecord[] | undefined,
  presetId: string,
) {
  return (schedules || []).find((schedule) => {
    const metadata = getPresetMetadata(schedule);
    return String(metadata.mobile_automation_id || "").trim() === presetId;
  });
}

function formatNextRun(value?: string | null) {
  if (!value) return "Not scheduled yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled yet";
  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildRunRequest(preset: AutomationPreset) {
  return {
    engine: "orion",
    user_goal: preset.goal,
    agent_role: "sage",
    metadata: {
      source: "mobile_automation",
      mobile_automation_id: preset.id,
      mobile_surface: "automations",
    },
  };
}

export default function AutomationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSessionState();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  const canManageAutomations = Boolean(session?.runtimeUrl && session?.runtimeKey && session?.workspaceId);

  const schedulesQuery = useQuery({
    queryKey: ["mobile", "automations", session?.runtimeUrl, session?.workspaceId],
    enabled: canManageAutomations,
    retry: false,
    queryFn: () => mobileApi.listSchedules(session!),
  });

  const refreshSchedules = async () => {
    await queryClient.invalidateQueries({ queryKey: ["mobile", "automations", session?.runtimeUrl, session?.workspaceId] });
  };

  const handleToggle = async (preset: AutomationPreset, enabled: boolean) => {
    if (!session || !canManageAutomations) return;
    const schedule = findPresetSchedule(schedulesQuery.data, preset.id);
    setBusyId(preset.id);
    setFeedback(null);
    try {
      if (enabled) {
        if (schedule) {
          await mobileApi.updateSchedule(session, schedule.id, { enabled: true });
        } else {
          await mobileApi.createSchedule(session, {
            name: preset.title,
            cron: preset.cron,
            run_request: buildRunRequest(preset),
          });
        }
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setFeedback(`${preset.title} is on.`);
      } else if (schedule) {
        await mobileApi.updateSchedule(session, schedule.id, { enabled: false });
        await Haptics.selectionAsync();
        setFeedback(`${preset.title} is off.`);
      }
      await refreshSchedules();
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFeedback(error instanceof Error ? error.message : "Could not update this automation.");
    } finally {
      setBusyId(null);
    }
  };

  const handleRunNow = async (preset: AutomationPreset) => {
    if (!session || !canManageAutomations) return;
    const schedule = findPresetSchedule(schedulesQuery.data, preset.id);
    if (!schedule?.id) return;
    setBusyId(preset.id);
    setFeedback(null);
    try {
      const payload = await mobileApi.triggerScheduleNow(session, schedule.id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const runId = String((payload as Record<string, unknown>).run_id || "").trim();
      setFeedback(runId ? `${preset.title} started.` : `${preset.title} is running now.`);
      await refreshSchedules();
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFeedback(error instanceof Error ? error.message : "Could not run this automation.");
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
          <ScreenHeader title="Automations" subtitle="Keep only the recurring Sage check-ins you actually want." />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View
          style={{
            marginTop: 12,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            overflow: "hidden",
          }}
        >
          {PRESETS.map((preset, index) => {
            const schedule = findPresetSchedule(schedulesQuery.data, preset.id);
            const isEnabled = Boolean(schedule?.enabled);
            const isBusy = busyId === preset.id;
            return (
              <View
                key={preset.id}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                  borderBottomWidth: index < PRESETS.length - 1 ? 1 : 0,
                  borderBottomColor: theme.colors.border,
                  opacity: isBusy ? 0.7 : 1,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 16, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                      {preset.title}
                    </Text>
                    <Text style={{ fontSize: 12.5, lineHeight: 18, color: theme.colors.textSecondary }}>
                      {preset.subtitle}
                    </Text>
                    <Text style={{ fontSize: 12.5, lineHeight: 18, color: theme.colors.textSecondary }}>
                      {preset.scheduleLabel}
                    </Text>
                    <Text style={{ fontSize: 12.5, lineHeight: 18, color: theme.colors.textSecondary }}>
                      {isEnabled ? `Next run: ${formatNextRun(schedule?.next_run_at)}` : "Off"}
                    </Text>
                  </View>
                  <Switch
                    value={isEnabled}
                    disabled={!canManageAutomations || isBusy}
                    onValueChange={(next) => {
                      void handleToggle(preset, next);
                    }}
                    trackColor={{ false: "#D9DCE1", true: "#BFC7D4" }}
                    thumbColor={isEnabled ? "#111827" : "#FFFFFF"}
                    ios_backgroundColor="#D9DCE1"
                  />
                </View>
                {isEnabled ? (
                  <TouchableOpacity
                    activeOpacity={0.86}
                    disabled={!canManageAutomations || isBusy}
                    onPress={() => void handleRunNow(preset)}
                    style={{
                      marginTop: 12,
                      alignSelf: "flex-start",
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      backgroundColor: "#F6F7F8",
                    }}
                  >
                    <Text style={{ fontSize: 12.5, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                      {isBusy ? "Working..." : "Run now"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}
        </View>

        {feedback ? (
          <View
            style={{
              marginTop: 14,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          >
            <Text style={{ fontSize: 13, lineHeight: 20, color: theme.colors.text }}>{feedback}</Text>
          </View>
        ) : null}

        {!canManageAutomations ? (
          <Text style={{ marginTop: 12, fontSize: 12.5, lineHeight: 19, color: theme.colors.textSecondary }}>
            Automations will appear here once Sage is ready.
          </Text>
        ) : null}

        {schedulesQuery.isLoading ? (
          <Text style={{ marginTop: 12, fontSize: 12.5, lineHeight: 19, color: theme.colors.textSecondary }}>
            Loading automations...
          </Text>
        ) : null}

        {schedulesQuery.error ? (
          <Text style={{ marginTop: 12, fontSize: 12.5, lineHeight: 19, color: "#C2413B" }}>
            {schedulesQuery.error instanceof Error ? schedulesQuery.error.message : "Could not load automations."}
          </Text>
        ) : null}
      </ScrollView>
    </MobileScreen>
  );
}
