import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useAppTheme } from '@/src/theme/useAppTheme';
interface CaloriesCardProps {
  consumed: number;
  goal: number;
}

export const CaloriesCard: React.FC<CaloriesCardProps> = ({ consumed, goal }) => {
  const theme = useAppTheme();
  const styles = useStyles(theme);
  const progress = Math.min(consumed / goal, 1);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Nutrition</Text>
      <View style={styles.statsRow}>
        <Text style={styles.number}>{consumed}</Text>
        <Text style={styles.label}> / {goal} kcal</Text>
      </View>
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.remaining}>
        {Math.max(goal - consumed, 0)} kcal remaining
      </Text>
    </View>
  );
};

const useStyles = (theme: any) => StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    width: '100%',
    marginVertical: 8,
  },
  title: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontFamily: 'Fraunces_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  number: {
    color: theme.colors.text,
    fontSize: 32,
    fontFamily: 'Fraunces_700Bold',
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 16,
    fontFamily: 'DMSans_400Regular',
  },
  progressContainer: {
    height: 8,
    backgroundColor: theme.colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: theme.colors.accent,
    borderRadius: 4,
  },
  remaining: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
  },
});
