import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/src/theme/useAppTheme';

export const COMMANDS = [
  { id: 'nutrition', command: '/log_food', label: 'Log Nutrition', icon: 'restaurant', color: '#FF6B35' },
  { id: 'sleep', command: '/log_sleep', label: 'Log Sleep', icon: 'moon', color: '#6C63FF' },
  { id: 'goals', command: '/goal', label: 'Update Goal', icon: 'trophy', color: '#00C896' },
  { id: 'study', command: '/study', label: 'Study Session', icon: 'book', color: '#FFD700' },
  { id: 'finance', command: '/expense', label: 'Log Expense', icon: 'wallet', color: '#4ECDC4' },
  { id: 'focus', command: '/focus', label: 'Focus Mode', icon: 'stopwatch', color: '#FF4757' },
];

interface SlashCommandPickerProps {
  input: string;
  onSelectCommand: (command: string) => void;
}

export const SlashCommandPicker: React.FC<SlashCommandPickerProps> = ({ input, onSelectCommand }) => {
  const theme = useAppTheme();
  const showCommands = input.startsWith('/');

  if (!showCommands) return null;

  const filterText = input.substring(1).toLowerCase();
  const filteredCommands = COMMANDS.filter(c => 
    c.command.toLowerCase().includes(filterText) ||
    c.label.toLowerCase().includes(filterText)
  );

  if (filteredCommands.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      <Text style={[styles.header, { color: theme.colors.textMuted }]}>Available Commands</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {filteredCommands.map(cmd => (
          <TouchableOpacity 
            key={cmd.id} 
            style={[styles.commandPill, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
            onPress={() => onSelectCommand(cmd.command + ' ')}
          >
            <View style={[styles.iconBox, { backgroundColor: cmd.color + '20' }]}>
              <Ionicons name={cmd.icon as any} size={16} color={cmd.color} />
            </View>
            <View>
              <Text style={[styles.commandText, { color: theme.colors.text }]}>{cmd.command}</Text>
              <Text style={[styles.labelText, { color: theme.colors.textMuted }]}>{cmd.label}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: '100%',
    left: 8,
    right: 8,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  header: {
    fontSize: 12,
    fontFamily: 'DMSans_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  commandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    paddingRight: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
  },
  labelText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
  }
});
