import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useAppTheme } from '../../theme/useAppTheme';

type MetricRingProps = {
  value: number;
  label: string;
  sublabel?: string;
  size?: number;
  stroke?: number;
  color?: string;
};

export const MetricRing: React.FC<MetricRingProps> = ({
  value,
  label,
  sublabel,
  size = 86,
  stroke = 8,
  color,
}) => {
  const theme = useAppTheme();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circumference - (clamped / 100) * circumference;
  const ringColor = color || theme.colors.accent;

  return (
    <View style={styles.container}>
      <View>
        <Svg width={size} height={size}>
          <Circle
            stroke={theme.colors.border}
            fill="none"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
          />
          <Circle
            stroke={ringColor}
            fill="none"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        <View style={styles.center}>
          <Text style={[styles.value, { color: theme.colors.text }]}>{Math.round(clamped)}%</Text>
          {sublabel ? <Text style={[styles.sublabel, { color: theme.colors.textMuted }]}>{sublabel}</Text> : null}
        </View>
      </View>
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
  },
  center: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 16,
    fontFamily: 'Fraunces_700Bold',
  },
  sublabel: {
    fontSize: 10,
    fontFamily: 'DMSans_400Regular',
  },
  label: {
    fontSize: 12,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 0.3,
  },
});
