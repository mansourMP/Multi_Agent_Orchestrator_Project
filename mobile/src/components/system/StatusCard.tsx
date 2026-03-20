import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/useAppTheme';

type StatusCardProps = {
  title: string;
  value: string;
  subtitle?: string;
  meta?: string;
  accent?: string;
  style?: ViewStyle;
};

export const StatusCard: React.FC<StatusCardProps> = ({ title, value, subtitle, meta, accent, style }) => {
  const theme = useAppTheme();
  const color = accent || theme.colors.accent;

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, style]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        <View style={[styles.dot, { backgroundColor: color }]} />
      </View>
      <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>{subtitle}</Text> : null}
      {meta ? <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{meta}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 20,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 13,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  value: {
    fontSize: 28,
    fontFamily: 'Fraunces_700Bold',
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'DMSans_500Medium',
  },
  meta: {
    fontSize: 11,
    fontFamily: 'DMSans_400Regular',
  },
});
