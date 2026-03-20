import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useAppTheme } from '@/src/theme/useAppTheme';
export type WidgetType = 'meal' | 'task' | 'study' | 'progress';

interface InteractiveWidgetProps {
  type: WidgetType;
  data: any;
  onAction?: (action: string) => void;
}

export const InteractiveWidget: React.FC<InteractiveWidgetProps> = ({ type, data, onAction }) => {
  const theme = useAppTheme();
  const styles = useStyles(theme);
  const handlePress = (action: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onAction) onAction(action);
  };

  switch (type) {
    case 'meal':
      return (
        <View style={styles.card}>
          <View style={styles.header}>
            <Ionicons name="restaurant-outline" size={20} color="#FF9500" />
            <Text style={styles.title}>Nutrition Log</Text>
          </View>
          <Text style={styles.body}>{data.description || "Logged 500kcal burger"}</Text>
          <View style={styles.statsRow}>
            <Stat label="Protein" value={data.protein || "24g"} />
            <Stat label="Carbs" value={data.carbs || "42g"} />
            <Stat label="Fats" value={data.fats || "18g"} />
          </View>
          <TouchableOpacity style={[styles.button, { backgroundColor: '#FF9500' }]} onPress={() => handlePress('confirm')}>
            <Text style={styles.buttonText}>Confirm to Health App</Text>
          </TouchableOpacity>
        </View>
      );

    case 'task':
      return (
        <View style={styles.card}>
          <View style={styles.header}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#34C759" />
            <Text style={styles.title}>Action Items</Text>
          </View>
          {(data.items || ['Update project docs', 'Email the team']).map((item: string, i: number) => (
            <TouchableOpacity key={i} style={styles.taskRow} onPress={() => handlePress(`task_${i}`)}>
              <Ionicons name="square-outline" size={18} color="#C7C7CC" />
              <Text style={styles.taskText}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
      );

    case 'progress':
      return (
        <View style={styles.card}>
          <View style={styles.header}>
            <Ionicons name="trending-up-outline" size={20} color="#007AFF" />
            <Text style={styles.title}>Goal Tracking</Text>
          </View>
          <View style={styles.progressContainer}>
             <View style={[styles.progressBar, { width: `${data.percent || 65}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{data.label || 'Study Session - 45/60 mins'}</Text>
        </View>
      );

    default:
      return null;
  }
};

const Stat = ({ label, value }: { label: string, value: string }) => (
  <View style={styles.stat}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const useStyles = (theme: any) => StyleSheet.create({
  card: {
    backgroundColor: theme.colors.text,
    borderRadius: 20,
    padding: 18,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: 1,
    borderColor: '#F2F2F7',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 16,
    color: '#3A3A3C',
    lineHeight: 22,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F9F9FB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },
  statLabel: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '600',
    marginTop: 2,
  },
  button: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F2F2F7',
  },
  taskText: {
    fontSize: 15,
    color: '#3A3A3C',
  },
  progressContainer: {
    height: 8,
    backgroundColor: '#F2F2F7',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  progressLabel: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  }
});
