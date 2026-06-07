import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { MobileScreen } from "@/src/components/MobileScreen";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { ActionButton } from "@/src/components/system/ActionButton";
import { getPrimaryAgent } from "@/src/lib/agents";
import { useChatStore } from "@/src/stores/chatStore";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

const RECIPES = [
  {
    id: "morning_brief",
    icon: "sunny-outline" as const,
    title: "Morning brief",
    description: "Summarize mail, calendar, tasks, and anything waiting for approval.",
    prompt: "Set up a weekday morning brief for me.",
  },
  {
    id: "email_triage",
    icon: "mail-unread-outline" as const,
    title: "Email triage",
    description: "Find important messages, draft replies, and ask before sending.",
    prompt: "Help me set up email triage.",
  },
  {
    id: "meeting_prep",
    icon: "calendar-clear-outline" as const,
    title: "Meeting prep",
    description: "Prepare context before meetings and surface follow-up work afterward.",
    prompt: "Prepare me before my meetings.",
  },
];

export default function RecipesRoute() {
  const theme = useTheme();
  const router = useRouter();
  const ensureSessionForAgent = useChatStore((state) => state.ensureSessionForAgent);
  const addMessage = useChatStore((state) => state.addMessage);

  const startRecipe = React.useCallback(
    (prompt: string) => {
      const agent = getPrimaryAgent();
      const sessionId = ensureSessionForAgent(agent);
      addMessage(sessionId, {
        intent: "user_prompt",
        speech: prompt,
        messageType: "text",
      });
      router.push(`/chats/${sessionId}` as never);
    },
    [addMessage, ensureSessionForAgent, router],
  );

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
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ScreenHeader title="Recipes" subtitle="Reusable Sage routines for everyday work." />
        </View>
      </View>

      <View style={{ gap: 10 }}>
        {RECIPES.map((recipe) => (
          <View
            key={recipe.id}
            style={{
              borderRadius: 24,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              padding: 18,
              gap: 14,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 13 }}>
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 23,
                  backgroundColor: theme.colors.card,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name={recipe.icon} size={21} color={theme.colors.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontSize: 17, fontFamily: "DMSans_700Bold" }}>
                  {recipe.title}
                </Text>
                <Text style={{ marginTop: 4, color: theme.colors.textSecondary, fontSize: 13.5, lineHeight: 20 }}>
                  {recipe.description}
                </Text>
              </View>
            </View>
            <ActionButton
              label="Ask Sage to set this up"
              icon="sparkles-outline"
              variant="primary"
              onPress={() => startRecipe(recipe.prompt)}
            />
          </View>
        ))}
      </View>

      <ActionButton
        label="Open automations"
        icon="repeat-outline"
        onPress={() => router.push("/automations" as never)}
      />
    </MobileScreen>
  );
}
