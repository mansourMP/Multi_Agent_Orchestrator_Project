import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/useAppTheme';

const ProgressWidget = (props: any) => {
  const { colors } = useAppTheme();
  return (
    <View style={styles.container}>
      <View style={[styles.circle, { borderColor: props.color || colors.accent }]}>
        <Text style={[styles.value, { color: props.color || colors.accent }]}>{props.value || '0'}</Text>
        <Text style={[styles.unit, { color: colors.textSecondary }]}>{props.unit || 'kcal'}</Text>
      </View>
      <Text style={[styles.label, { color: colors.text }]}>{props.label || 'Daily Progress'}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  value: {
    fontSize: 28,
    fontFamily: 'Fraunces_700Bold',
  },
  unit: {
    fontSize: 12,
    fontFamily: 'DMSans_700Bold',
  },
  label: {
    fontSize: 14,
    fontFamily: 'DMSans_500Medium',
  }
});

export default ProgressWidget;
