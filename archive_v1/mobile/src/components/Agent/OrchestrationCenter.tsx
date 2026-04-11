import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Dimensions, 
  Animated 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { ToolSandbox } from './ToolSandbox';

const { width, height } = Dimensions.get('window');

interface LogEntry {
  id: string;
  agent: string;
  action: string;
  status: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
}

export const OrchestrationCenter = ({ onClose }: { onClose: () => void }) => {
  const theme = useAppTheme();
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: '1', agent: 'ROUTER', action: 'Synthesizing input intent...', status: 'info', timestamp: '16:44:01' },
    { id: '2', agent: 'Llama 3.2', action: 'Reasoning across 12 context items', status: 'info', timestamp: '16:44:02' },
    { id: '3', agent: 'MEMORY', action: 'Retrieved 3 vector fragments (Nutrition)', status: 'success', timestamp: '16:44:03' },
    { id: '4', agent: 'NUTRITION_BOT', action: 'Calibrating diet parameters', status: 'info', timestamp: '16:44:04' },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      const newEntry: LogEntry = {
        id: Math.random().toString(),
        agent: 'ORCHESTRATOR',
        action: 'Monitoring local state consistency...',
        status: 'info',
        timestamp: new Date().toLocaleTimeString().split(' ')[0],
      };
      setLogs(prev => [newEntry, ...prev.slice(0, 19)]);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <View>
          <Text style={[styles.title, { color: theme.colors.text }]}>Orchestration Center</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>Agentic Reasoning Stream (SIMULATED)</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.colors.surface }]}>
          <Ionicons name="close" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.statsRow, { gap: 12, marginBottom: 24 }]}>
          <View style={[styles.statCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
             <Text style={[styles.statValue, { color: theme.colors.accent }]}>12ms</Text>
             <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Latency</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
             <Text style={[styles.statValue, { color: theme.colors.accent }]}>3.2GB</Text>
             <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>LLM RAM</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
             <Text style={[styles.statValue, { color: theme.colors.accent }]}>8</Text>
             <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Sub-Agents</Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.colors.text, marginBottom: 16 }]}>Reasoning Logs</Text>
        {logs.map((log) => (
          <View key={log.id} style={[styles.logItem, { borderLeftColor: theme.colors.accent }]}>
             <View style={styles.logHeader}>
                <Text style={[styles.logAgent, { color: theme.colors.accent }]}>{log.agent}</Text>
                <Text style={[styles.logTime, { color: theme.colors.textSecondary }]}>{log.timestamp}</Text>
             </View>
             <Text style={[styles.logAction, { color: theme.colors.text }]}>{log.action}</Text>
          </View>
        ))}

        <ToolSandbox />
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
         <View style={styles.embodiedAgent}>
            <View style={[styles.dot, { backgroundColor: '#34D399' }]} />
            <Text style={{ color: theme.colors.text, fontFamily: 'DMSans_700Bold' }}>Embodied: Multi-Agent Hub</Text>
         </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: 60,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Fraunces_700Bold',
  },
  subtitle: {
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
    marginTop: 4,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
  },
  statsRow: {
    flexDirection: 'row',
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  statValue: {
    fontSize: 18,
    fontFamily: 'Fraunces_700Bold',
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'DMSans_500Medium',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'DMSans_700Bold',
  },
  logItem: {
    paddingLeft: 16,
    borderLeftWidth: 2,
    marginBottom: 20,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  logAgent: {
    fontSize: 12,
    fontFamily: 'DMSans_700Bold',
    textTransform: 'uppercase',
  },
  logTime: {
    fontSize: 10,
  },
  logAction: {
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
    lineHeight: 20,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
  },
  embodiedAgent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  }
});
