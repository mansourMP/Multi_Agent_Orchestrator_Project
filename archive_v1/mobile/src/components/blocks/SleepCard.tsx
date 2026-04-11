import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '@/src/theme/useAppTheme';
interface SleepCardProps {
  hours: number;
  quality: 'poor' | 'ok' | 'good';
}

export const SleepCard: React.FC<SleepCardProps> = ({ hours, quality }) => {
  const theme = useAppTheme();
  const styles = useStyles(theme);
  const getQualityColor = () => {
    switch (quality) {
      case 'good': return '#34C759';
      case 'ok': return '#FFCC00';
      case 'poor': return '#FF3B30';
      default: return theme.colors.textMuted;
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Sleep</Text>
      <View style={styles.row}>
        <View>
          <Text style={styles.number}>{hours.toFixed(1)}</Text>
          <Text style={styles.label}>hours</Text>
        </View>
        <View style={styles.qualityContainer}>
          <Ionicons name="moon" size={24} color={getQualityColor()} />
          <Text style={[styles.qualityText, { color: getQualityColor() }]}>
            {quality.toUpperCase()}
          </Text>
        </View>
      </View>
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  number: {
    color: theme.colors.text,
    fontSize: 32,
    fontFamily: 'Fraunces_700Bold',
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
  },
  qualityContainer: {
    alignItems: 'center',
  },
  qualityText: {
    fontSize: 12,
    fontFamily: 'Fraunces_700Bold',
    marginTop: 4,
  },
});
