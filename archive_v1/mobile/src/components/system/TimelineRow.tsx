import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';

type TimelineRowProps = {
  title: string;
  time: string;
  description?: string;
  icon?: string;
  color?: string;
};

export const TimelineRow: React.FC<TimelineRowProps> = ({ title, time, description, icon, color }) => {
  const theme = useAppTheme();
  const tint = color || theme.colors.accent;

  return (
    <View style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={[styles.iconBox, { backgroundColor: tint + '15' }]}>
        <Ionicons name={(icon || 'pulse') as any} size={14} color={tint} />
      </View>
      <View style={styles.main}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        {description ? <Text style={[styles.desc, { color: theme.colors.textSecondary }]} numberOfLines={2}>{description}</Text> : null}
      </View>
      <Text style={[styles.time, { color: theme.colors.textMuted }]}>{time}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontFamily: 'DMSans_700Bold',
  },
  desc: {
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
  },
  time: {
    fontSize: 11,
    fontFamily: 'DMSans_500Medium',
  },
});
