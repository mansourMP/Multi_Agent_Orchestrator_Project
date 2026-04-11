import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/useAppTheme';

const FinancialGraph = (props: any) => {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
      <View style={styles.header}>
        <Text style={[styles.amount, { color: colors.text }]}>${props.amount || '0.00'}</Text>
        <Text style={[styles.category, { color: colors.textSecondary }]}>{props.category || 'General'}</Text>
      </View>
      <View style={[styles.barContainer, { backgroundColor: colors.cardHover }]}>
        <View style={[styles.bar, { width: props.percentage || '50%', backgroundColor: props.color || colors.accent }]} />
      </View>
      <Text style={[styles.footer, { color: colors.textSecondary }]}>{props.footer || 'Budget remaining'}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 20,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  amount: {
    fontSize: 24,
    fontFamily: 'Fraunces_700Bold',
  },
  category: {
    fontSize: 12,
    textTransform: 'uppercase',
    fontFamily: 'DMSans_700Bold',
  },
  barContainer: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  bar: {
    height: '100%',
    borderRadius: 4,
  },
  footer: {
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
  }
});

export default FinancialGraph;
