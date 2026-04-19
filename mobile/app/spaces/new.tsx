import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { MobileScreen } from "@/src/components/MobileScreen";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { SectionCard } from "@/src/components/SectionCard";
import { useSpacesStore } from "@/src/lib/spaces";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

const SPACE_PRESETS = [
  {
    label: "Study",
    purpose: "Study topics, notes, quizzes, and revision.",
    defaultAgentId: "private-assistant",
    quickActions: ["Explain this topic", "Quiz me", "Make a study plan"],
  },
  {
    label: "Meals",
    purpose: "Track meals, estimate calories, and plan food.",
    defaultAgentId: "private-assistant",
    quickActions: ["Log a meal", "Estimate calories", "Plan meals"],
  },
  {
    label: "Projects",
    purpose: "Track progress, blockers, and next steps.",
    defaultAgentId: "builder",
    quickActions: ["Show progress", "Next tasks", "Summarize blockers"],
  },
  {
    label: "Custom",
    purpose: "Build a focused place around your own routine or goal.",
    defaultAgentId: "private-assistant",
    quickActions: ["Start here", "Add a routine", "Ask for help"],
  },
];

export default function NewSpaceScreen() {
  const theme = useTheme();
  const addSpace = useSpacesStore((state) => state.addSpace);
  const [selectedPreset, setSelectedPreset] = useState(SPACE_PRESETS[0]);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");

  const effectiveName = useMemo(() => name.trim() || selectedPreset.label, [name, selectedPreset.label]);
  const effectivePurpose = useMemo(() => purpose.trim() || selectedPreset.purpose, [purpose, selectedPreset.purpose]);

  return (
    <MobileScreen>
      <ScreenHeader title="New space" subtitle="Create a focused place for one area of life or work." />
      <SectionCard title="Pick a starting point" subtitle="Keep it simple. You can change it later.">
        <View style={{ gap: 10 }}>
          {SPACE_PRESETS.map((preset) => {
            const active = selectedPreset.label === preset.label;
            return (
              <Pressable
                key={preset.label}
                onPress={() => setSelectedPreset(preset)}
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: active ? theme.colors.accent : theme.colors.border,
                  backgroundColor: active ? theme.colors.cardHover : theme.colors.surface,
                  padding: 16,
                  gap: 6,
                }}
              >
                <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: "700" }}>{preset.label}</Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 20 }}>{preset.purpose}</Text>
              </Pressable>
            );
          })}
        </View>
      </SectionCard>
      <SectionCard title="Name and purpose" subtitle="This is how the space will appear on Home.">
        <View style={{ gap: 12 }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Space name"
            placeholderTextColor={theme.colors.textMuted}
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
          <TextInput
            value={purpose}
            onChangeText={setPurpose}
            placeholder="What this space is for"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            style={{
              minHeight: 96,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              color: theme.colors.text,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 15,
              textAlignVertical: "top",
            }}
          />
        </View>
      </SectionCard>
      <SectionCard title="Preview" subtitle="A quick check before you save it.">
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            padding: 16,
            gap: 8,
          }}
        >
          <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: "700" }}>{effectiveName}</Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: 13, lineHeight: 20 }}>{effectivePurpose}</Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
            Default helper: {selectedPreset.defaultAgentId === "builder" ? "Builder" : "Private Assistant"}
          </Text>
        </View>
      </SectionCard>
      <Pressable
        onPress={async () => {
          const created = await addSpace({
            name: effectiveName,
            purpose: effectivePurpose,
            defaultAgentId: selectedPreset.defaultAgentId,
            quickActions: selectedPreset.quickActions,
            kind: "custom",
          });
          router.replace(`/spaces/${created.id}`);
        }}
        style={{
          height: 46,
          borderRadius: 14,
          backgroundColor: theme.colors.accent,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "700" }}>Create space</Text>
      </Pressable>
    </MobileScreen>
  );
}
