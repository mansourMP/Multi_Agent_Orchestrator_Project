import { Pressable, Text } from "react-native";

import { useTheme } from "@/src/theme";

export function AgentChip({
  label,
  active = false,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? theme.colors.primary : theme.colors.border,
        backgroundColor: active ? theme.colors.primaryMuted : theme.colors.surface,
        paddingHorizontal: 14,
        height: 38,
        alignItems: "center",
        justifyContent: "center",
      }}
      >
      <Text
        style={{
          color: active ? theme.colors.text : theme.colors.textMuted,
          fontSize: 13,
          fontWeight: active ? "700" : "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
