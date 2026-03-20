import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useAppTheme } from '@/src/theme/useAppTheme';
interface GoalCardProps {
  title: string;
  progress: number;
  target: number;
}

export const GoalCard: React.FC<GoalCardProps> = ({ title, progress, target }) => {
  const theme = useAppTheme();
  const styles = useStyles(theme);
  const percent = Math.min(progress / target, 1);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Goal</Text>
      <Text style={styles.goalTitle}>{title}</Text>
      <View style={styles.statsRow}>
        <Text style={styles.number}>{progress}</Text>
        <Text style={styles.label}> of {target}</Text>
      </View>
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { width: `${percent * 100}%` }]} />
      </View>
      <Text style={styles.percentText}>{Math.round(percent * 100)}% complete</Text>
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
    fontSize: 12,
    fontFamily: 'Fraunces_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  goalTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontFamily: 'Fraunces_700Bold',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  number: {
    color: theme.colors.text,
    fontSize: 24,
    fontFamily: 'Fraunces_700Bold',
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
  },
  progressContainer: {
    height: 6,
    backgroundColor: theme.colors.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#34C759', // Green for goals
    borderRadius: 3,
  },
  percentText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
  },
});
