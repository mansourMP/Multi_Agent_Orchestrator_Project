import React from "react";
import { Text, View } from "react-native";

import { useAppTheme as useTheme } from "@/src/theme/useAppTheme";
import { MobileSession } from "@/src/lib/types";
import { workspaceApi } from "@/src/lib/workspaceApi";

type NutritionPanelProps = {
  session: MobileSession;
};

export function NutritionPanel({ session }: NutritionPanelProps) {
  const theme = useTheme();
  const [loading, setLoading] = React.useState(true);
  const [entries, setEntries] = React.useState<string[]>([]);

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!session?.runtimeUrl || !session?.runtimeKey) return;
      try {
        setLoading(true);
        const res = await workspaceApi.readFile(session, "nutrition_log.txt");
        const content = String(res?.content ?? "");
        const lines = content
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        const recent = lines.slice(-3).reverse();
        if (mounted) {
          setEntries(recent);
        }
      } catch (err) {
        if (mounted) {
          setEntries([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [session]);

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 10,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>Nutrition</Text>
      <Text style={{ fontSize: 16, color: theme.colors.text, marginTop: 4, fontFamily: "DMSans_700Bold" }}>
        Recent entries
      </Text>
      {loading ? (
        <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 8 }}>Loading…</Text>
      ) : entries.length === 0 ? (
        <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 8 }}>
          No entries yet. Use the quick actions below to log meals.
        </Text>
      ) : (
        <View style={{ marginTop: 8, gap: 6 }}>
          {entries.map((entry, idx) => (
            <Text key={`${entry}-${idx}`} style={{ fontSize: 13, color: theme.colors.text }}>
              • {entry}
            </Text>
          ))}
        </View>
      )}
      <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 8 }}>
        File: nutrition_log.txt
      </Text>
    </View>
  );
}
