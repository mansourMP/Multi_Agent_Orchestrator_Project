import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useAppTheme } from '@/src/theme/useAppTheme';
interface FinanceCardProps {
  spent: number;
  budget: number;
  period: string;
}

export const FinanceCard: React.FC<FinanceCardProps> = ({ spent, budget, period }) => {
  const theme = useAppTheme();
  const styles = useStyles(theme);
  const percent = Math.min(spent / budget, 1);
  const isOver = spent > budget;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Finances • {period}</Text>
      <View style={styles.row}>
        <Text style={styles.number}>${spent.toFixed(2)}</Text>
        <Text style={styles.label}> / ${budget}</Text>
      </View>
      <View style={styles.progressContainer}>
        <View style={[
          styles.progressBar, 
          { width: `${percent * 100}%`, backgroundColor: isOver ? '#FF3B30' : '#4ECDC4' }
        ]} />
      </View>
      <Text style={styles.footer}>
        {isOver ? 'Over budget' : `$${(budget - spent).toFixed(2)} available`}
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
    fontSize: 12,
    fontFamily: 'Fraunces_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  number: {
    color: theme.colors.text,
    fontSize: 28,
    fontFamily: 'Fraunces_700Bold',
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 16,
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
    borderRadius: 3,
  },
  footer: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
  },
});
