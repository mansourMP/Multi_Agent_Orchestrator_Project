import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Svg, Circle } from 'react-native-svg';
import { useAppTheme } from '../../theme/useAppTheme';

interface LiquidWidgetProps {
  title: string;
  value: string;
  subtext: string;
  progress: number; // 0 to 100
}

export const LiquidWidget = ({ title, value, subtext, progress }: LiquidWidgetProps) => {
  const theme = useAppTheme();
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <BlurView intensity={theme.blurIntensity} tint={theme.isDark ? "dark" : "light"} style={styles.blurContainer}>
      <View style={styles.row}>
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.colors.textSecondary }]}>{title}</Text>
          <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
          <Text style={[styles.subtext, { color: theme.colors.accent }]}>{subtext}</Text>
        </View>
        <View style={styles.svgWrapper}>
          <Svg height="70" width="70" viewBox="0 0 100 100">
            {/* Background Circle */}
            <Circle 
              cx="50" cy="50" r={radius} 
              stroke={theme.isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)"} 
              strokeWidth="10" 
              fill="none" 
            />
            {/* Progress Circle */}
            <Circle 
              cx="50" cy="50" r={radius} 
              stroke={theme.colors.accent} 
              strokeWidth="10" 
              fill="none" 
              strokeDasharray={`${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round" 
              transform="rotate(-90 50 50)" 
            />
          </Svg>
        </View>
      </View>
    </BlurView>
  );
};

const styles = StyleSheet.create({
  blurContainer: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  value: {
    fontSize: 34,
    fontWeight: '800',
    marginTop: 6,
    fontFamily: 'Fraunces_700Bold',
  },
  subtext: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
    fontFamily: 'DMSans_700Bold',
  },
  svgWrapper: {
    marginLeft: 20,
  }
});
