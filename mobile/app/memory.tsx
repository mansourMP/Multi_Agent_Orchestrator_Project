import React from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";

import {
  mobileApi,
  type SageMemoryCategory,
  type SageMemoryItem,
} from "@/src/lib/api";
import { useSessionState } from "@/src/lib/session-context";
import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";

type MemoryLayerMeta = {
  category: SageMemoryCategory;
  title: string;
};

type MemoryLayerValues = Record<SageMemoryCategory, string>;
type MemoryLayerEntries = Partial<Record<SageMemoryCategory, SageMemoryItem>>;

const MEMORY_LAYERS: MemoryLayerMeta[] = [
  { category: "work_context", title: "Work context" },
  { category: "personal_context", title: "Personal context" },
  { category: "top_of_mind", title: "Top of mind" },
  { category: "brief_history", title: "Brief history" },
  { category: "earlier_context", title: "Earlier context" },
  { category: "long_term_background", title: "Long-term background" },
];

const EMPTY_MEMORY: MemoryLayerValues = {
  work_context: "",
  personal_context: "",
  top_of_mind: "",
  brief_history: "",
  earlier_context: "",
  long_term_background: "",
};

const EMPTY_STATE_TEXT = "Nothing saved yet.";

function createEmptyEntries(): MemoryLayerEntries {
  return {};
}

function mapItemsToLayers(items: SageMemoryItem[]): {
  values: MemoryLayerValues;
  entries: MemoryLayerEntries;
} {
  const values: MemoryLayerValues = { ...EMPTY_MEMORY };
  const entries: MemoryLayerEntries = createEmptyEntries();

  for (const layer of MEMORY_LAYERS) {
    const match = items.find((item) => item.category === layer.category);
    if (!match) continue;
    entries[layer.category] = match;
    values[layer.category] = String(match.content || "");
  }

  return { values, entries };
}

export default function MemoryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSessionState();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [memoryValues, setMemoryValues] = React.useState<MemoryLayerValues>(EMPTY_MEMORY);
  const [draftValues, setDraftValues] = React.useState<MemoryLayerValues>(EMPTY_MEMORY);
  const [memoryEntries, setMemoryEntries] = React.useState<MemoryLayerEntries>(createEmptyEntries());
  const [status, setStatus] = React.useState<{ kind: "error" | "success"; message: string } | null>(null);

  const loadMemory = React.useCallback(async () => {
    if (!session?.runtimeUrl || !session.runtimeKey) {
      setMemoryValues(EMPTY_MEMORY);
      setDraftValues(EMPTY_MEMORY);
      setMemoryEntries(createEmptyEntries());
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const payload = await mobileApi.listSageMemory(session);
      const mapped = mapItemsToLayers(Array.isArray(payload.items) ? payload.items : []);
      setMemoryValues(mapped.values);
      setDraftValues(mapped.values);
      setMemoryEntries(mapped.entries);
      setStatus(null);
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not load Sage memory.",
      });
    } finally {
      setLoading(false);
    }
  }, [session]);

  React.useEffect(() => {
    void loadMemory();
  }, [loadMemory]);

  const beginEditing = async () => {
    await Haptics.selectionAsync();
    setDraftValues(memoryValues);
    setIsEditing(true);
    setStatus(null);
  };

  const cancelEditing = async () => {
    await Haptics.selectionAsync();
    setDraftValues(memoryValues);
    setIsEditing(false);
    setStatus(null);
  };

  const saveMemory = async () => {
    if (!session?.runtimeUrl || !session.runtimeKey) {
      setStatus({ kind: "error", message: "Sage is not ready yet." });
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      for (const layer of MEMORY_LAYERS) {
        const existing = memoryEntries[layer.category];
        const nextContent = draftValues[layer.category].trim();

        if (!nextContent) {
          if (existing?.id) {
            await mobileApi.deleteSageMemoryEntry(session, existing.id);
          }
          continue;
        }

        if (existing?.id) {
          await mobileApi.updateSageMemoryEntry(session, existing.id, {
            category: layer.category,
            title: layer.title,
            content: nextContent,
            pinned: Boolean(existing.pinned),
          });
          continue;
        }

        await mobileApi.createSageMemoryEntry(session, {
          category: layer.category,
          title: layer.title,
          content: nextContent,
        });
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsEditing(false);
      setStatus({ kind: "success", message: "Memory saved." });
      await loadMemory();
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not save Sage memory.",
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingTop: 16, marginBottom: 4 }}>
        <TouchableOpacity
          activeOpacity={0.86}
          onPress={() => router.back()}
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <View style={{ marginTop: 4, marginBottom: 16 }}>
        <Text style={{ fontSize: 30, fontFamily: "Fraunces_700Bold", color: theme.colors.text }}>Memory</Text>
      </View>

      <View
        style={{
          borderRadius: 22,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          overflow: "hidden",
        }}
      >
        {loading ? (
          <View
            style={{
              minHeight: 220,
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              paddingHorizontal: 20,
            }}
          >
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={{ fontSize: 13.5, color: theme.colors.textSecondary }}>Loading memory…</Text>
          </View>
        ) : (
          MEMORY_LAYERS.map((layer, index) => (
            <View
              key={layer.category}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 16,
                gap: 8,
                borderBottomWidth: index < MEMORY_LAYERS.length - 1 ? 1 : 0,
                borderBottomColor: theme.colors.border,
              }}
            >
              <Text style={{ fontSize: 15, fontFamily: "DMSans_700Bold", color: theme.colors.text }}>
                {layer.title}
              </Text>

              {isEditing ? (
                <TextInput
                  multiline
                  textAlignVertical="top"
                  placeholder={`Write ${layer.title.toLowerCase()} here`}
                  placeholderTextColor={theme.colors.textSecondary}
                  value={draftValues[layer.category]}
                  onChangeText={(value) =>
                    setDraftValues((current) => ({
                      ...current,
                      [layer.category]: value,
                    }))
                  }
                  style={{
                    minHeight: 72,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: "#F6F7F8",
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    color: theme.colors.text,
                    fontSize: 13.5,
                    lineHeight: 21,
                  }}
                />
              ) : (
                <Text style={{ fontSize: 13.5, lineHeight: 21, color: theme.colors.textSecondary }}>
                  {memoryValues[layer.category].trim() || EMPTY_STATE_TEXT}
                </Text>
              )}
            </View>
          ))
        )}
      </View>

      {status ? (
        <Text
          style={{
            marginTop: 12,
            fontSize: 13,
            lineHeight: 19,
            color: status.kind === "error" ? "#C2413B" : theme.colors.textSecondary,
          }}
        >
          {status.message}
        </Text>
      ) : null}

      {isEditing ? (
        <View style={{ marginTop: 16, gap: 10 }}>
          <TouchableOpacity
            activeOpacity={0.86}
            disabled={saving}
            onPress={() => void saveMemory()}
            style={{
              height: 48,
              borderRadius: 18,
              backgroundColor: theme.colors.accent,
              alignItems: "center",
              justifyContent: "center",
              opacity: saving ? 0.6 : 1,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>
              {saving ? "Saving…" : "Save memory"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.86}
            disabled={saving}
            onPress={() => void cancelEditing()}
            style={{
              height: 46,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
              alignItems: "center",
              justifyContent: "center",
              opacity: saving ? 0.6 : 1,
            }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: "700" }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          activeOpacity={0.86}
          disabled={loading}
          onPress={() => void beginEditing()}
          style={{
            marginTop: 16,
            height: 48,
            borderRadius: 18,
            backgroundColor: theme.colors.accent,
            alignItems: "center",
            justifyContent: "center",
            opacity: loading ? 0.6 : 1,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>Edit memory</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
