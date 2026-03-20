import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';

interface Tool {
  id: string;
  name: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  category: 'system' | 'media' | 'data';
  enabled: boolean;
}

export const ToolSandbox = () => {
  const theme = useAppTheme();
  const [tools, setTools] = useState<Tool[]>([
    { id: '1', name: 'HealthKit kernel', description: 'Raw biometric data stream orchestration', icon: 'fitness', category: 'system', enabled: true },
    { id: '2', name: 'Raw Byte Vision', description: 'Multimodal image analysis via OCR/LLM', icon: 'camera', category: 'media', enabled: true },
    { id: '3', name: 'Voice Synthesis', description: 'Low-latency auditory feedback engine', icon: 'mic', category: 'media', enabled: false },
    { id: '4', name: 'Vector Memory', description: 'Persistent semantic search across artifacts', icon: 'cube', category: 'data', enabled: true },
    { id: '5', name: 'SQLite Orchestrator', description: 'Direct relational database mutation', icon: 'server-outline', category: 'data', enabled: false },
  ]);

  const toggleTool = (id: string) => {
    setTools(prev => prev.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t));
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Agentic Capabilities</Text>
      <Text style={[styles.description, { color: theme.colors.textSecondary }]}>
        Toggle the specific tools the kernel can orchestrate for this session.
      </Text>

      {tools.map((tool) => (
        <View key={tool.id} style={[styles.toolCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <View style={[styles.iconBox, { backgroundColor: theme.colors.accent + '15' }]}>
            <Ionicons name={tool.icon} size={20} color={theme.colors.accent} />
          </View>
          
          <View style={styles.toolInfo}>
            <Text style={[styles.toolName, { color: theme.colors.text }]}>{tool.name}</Text>
            <Text style={[styles.toolDesc, { color: theme.colors.textSecondary }]}>{tool.description}</Text>
          </View>

          <Switch
            value={tool.enabled}
            onValueChange={() => toggleTool(tool.id)}
            trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
            thumbColor="#fff"
          />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Fraunces_700Bold',
    marginBottom: 8,
  },
  description: {
    fontSize: 13,
    fontFamily: 'DMSans_400Regular',
    marginBottom: 20,
    lineHeight: 18,
  },
  toolCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  toolInfo: {
    flex: 1,
    marginRight: 12,
  },
  toolName: {
    fontSize: 15,
    fontFamily: 'DMSans_700Bold',
    marginBottom: 2,
  },
  toolDesc: {
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
    lineHeight: 16,
  },
});
