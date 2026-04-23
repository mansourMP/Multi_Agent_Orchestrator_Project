import { StyleSheet, Text } from "react-native";

import { MotionRow } from "@/src/components/system/MotionRow";
import { useTheme } from "@/src/theme";

export function ListRow({
  title,
  subtitle,
  meta,
  onPress,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  onPress?: () => void;
}) {
  const theme = useTheme();

  return (
    <MotionRow
      onPress={onPress}
      style={[
        styles.row,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.panel,
        },
      ]}
    >
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
      ) : null}
      {meta ? <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{meta}</Text> : null}
    </MotionRow>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 15,
    gap: 7,
  },
  title: {
    fontSize: 14.5,
    fontFamily: "DMSans_700Bold",
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
  },
  meta: {
    fontSize: 11,
    lineHeight: 16,
  },
});
