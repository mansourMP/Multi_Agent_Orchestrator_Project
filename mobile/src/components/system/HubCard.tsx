import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';

type HubCardProps = {
  title: string;
  metric: string;
  delta?: string;
  icon: string;
  accent?: string;
  onPress?: () => void;
  style?: ViewStyle;
};

export const HubCard: React.FC<HubCardProps> = ({ title, metric, delta, icon, accent, onPress, style }) => {
  const theme = useAppTheme();
  const color = accent || theme.colors.accent;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, style]}
    >
      <View style={styles.header}>
        <View style={[styles.iconBox, { backgroundColor: color + '15' }]}>
          <Ionicons name={icon as any} size={16} color={color} />
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
      </View>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.metric, { color: theme.colors.text }]}>{metric}</Text>
      {delta ? <Text style={[styles.delta, { color }]}>{delta}</Text> : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 18,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 13,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  metric: {
    fontSize: 22,
    fontFamily: 'Fraunces_700Bold',
  },
  delta: {
    fontSize: 12,
    fontFamily: 'DMSans_500Medium',
  },
});
