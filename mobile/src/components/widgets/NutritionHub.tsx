import React from 'react';
import { View, StyleSheet } from 'react-native';
import { HubShell } from '../Hub/HubShell';
import { MetricRing, StatusCard } from '../system';

interface NutritionHubProps {
  currentCalories: number;
  goalCalories: number;
  macros: {
    protein: string;
    carbs: string;
    fat: string;
  };
}

export const NutritionHub: React.FC<NutritionHubProps> = ({ currentCalories, goalCalories, macros }) => {
  return (
    <HubShell 
      title="Nutrition Hub"
      status="Balanced"
      icon="restaurant"
      iconColor="#FF6B35"
      quickActions={[]}
      timeline={[]}
      source="Nutrition summary"
    >
      <View style={styles.content}>
        <StatusCard
          title="Calories"
          value={`${currentCalories}`}
          subtitle={`Goal ${goalCalories} kcal`}
          meta="Auto-estimated from entries"
          accent="#FF6B35"
        />
        <View style={styles.ringRow}>
          <MetricRing value={toPercent(macros.protein, 140)} label="Protein" sublabel={macros.protein} color="#FF6B35" />
          <MetricRing value={toPercent(macros.carbs, 220)} label="Carbs" sublabel={macros.carbs} color="#4ECDC4" />
          <MetricRing value={toPercent(macros.fat, 70)} label="Fat" sublabel={macros.fat} color="#F59E0B" />
        </View>
      </View>
    </HubShell>
  );
};

const toPercent = (value: string, goal: number) => {
  const numeric = Number(value.replace(/[^\d.]/g, '')) || 0;
  return (numeric / goal) * 100;
};

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  ringRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
