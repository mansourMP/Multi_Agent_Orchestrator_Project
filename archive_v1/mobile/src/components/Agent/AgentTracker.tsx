import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../../theme';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp, Layout } from 'react-native-reanimated';

interface AgentStatus {
  id: string;
  name: string;
  status: 'thinking' | 'executing' | 'idle' | 'success' | 'error';
  lastActivity: string;
  activityLabel: string;
}

const AGENTS: AgentStatus[] = [
  { id: '1', name: 'Memory Weaver', status: 'thinking', lastActivity: '2s ago', activityLabel: 'Synthesizing local context...' },
  { id: '2', name: 'Web Scout', status: 'executing', lastActivity: '5s ago', activityLabel: 'Researching travel options...' },
  { id: '3', name: 'Health Sentinel', status: 'idle', lastActivity: '10m ago', activityLabel: 'Monitoring vitals...' },
];

export function AgentTracker() {
  const { colors, spacing, radii } = useTheme();

  const getStatusColor = (status: AgentStatus['status']) => {
    switch (status) {
      case 'thinking': return colors.primary;
      case 'executing': return colors.highlight;
      case 'success': return colors.success;
      case 'error': return colors.error;
      default: return colors.textMuted;
    }
  };

  return (
    <View style={[styles.container, { padding: spacing.md }]}>
      <Text style={[styles.title, { color: colors.text, marginBottom: spacing.sm }]}>
        Agent Orchestration
      </Text>
      <ScrollView showsVerticalScrollIndicator={false}>
        {AGENTS.map((agent, index) => (
          <Animated.View 
            key={agent.id}
            entering={FadeInUp.delay(index * 100)}
            layout={Layout.springify()}
            style={[
              styles.agentCard, 
              { 
                backgroundColor: colors.panel,
                borderColor: colors.border,
                borderRadius: radii.md,
                marginBottom: spacing.sm,
                padding: spacing.md
              }
            ]}
          >
            <View style={styles.header}>
              <View style={styles.nameRow}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(agent.status) }]} />
                <Text style={[styles.agentName, { color: colors.text }]}>{agent.name}</Text>
              </View>
              <Text style={[styles.timestamp, { color: colors.textMuted }]}>{agent.lastActivity}</Text>
            </View>
            <Text style={[styles.activity, { color: colors.textMuted, marginTop: spacing.xs }]}>
              {agent.activityLabel}
            </Text>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: -0.5,
  },
  agentCard: {
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  agentName: {
    fontSize: 16,
    fontWeight: '600',
  },
  timestamp: {
    fontSize: 12,
  },
  activity: {
    fontSize: 14,
  }
});
