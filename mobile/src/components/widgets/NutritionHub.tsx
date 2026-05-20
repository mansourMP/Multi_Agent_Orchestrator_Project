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
  const QUICK_ACTIONS = [
    { id: 'scan', label: 'Scan Food', icon: 'camera', onPress: () => {} },
    { id: 'log', label: 'Manual Log', icon: 'add-circle', onPress: () => {} },
    { id: 'coach', label: 'Ask Coach', icon: 'chatbubbles', onPress: () => {} },
  ];

  const TIMELINE = [
    { id: '1', title: 'Lunch: Salmon Rice Bowl', time: '1:30 PM', icon: 'restaurant', color: '#FF6B35' },
    { id: '2', title: 'Calculated: 632 kcal', time: '1:32 PM', icon: 'calculator', color: '#3B82F6' },
    { id: '3', title: 'Updated Daily Caloric Plan', time: '1:32 PM', icon: 'sync', color: '#10B981' },
  ];

  return (
    <HubShell 
      title="Nutrition Hub"
      status="Balanced"
      icon="restaurant"
      iconColor="#FF6B35"
      quickActions={QUICK_ACTIONS}
      timeline={TIMELINE}
      insight={{
        text: "You are consistent with your protein intake today. Adding 15g more would hit your optimal hypertrophy target.",
        confidence: 94
      }}
      source="Health Coach"
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
