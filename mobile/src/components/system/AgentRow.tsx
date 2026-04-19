import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { AuditBadge } from './AuditBadge';

type AgentRowProps = {
  name: string;
  role: string;
  status: 'active' | 'idle' | 'blocked';
  task?: string;
  onPress?: () => void;
};

export const AgentRow: React.FC<AgentRowProps> = ({ name, role, status, task, onPress }) => {
  const theme = useAppTheme();
  const statusText = status === 'active' ? 'Active' : status === 'blocked' ? 'Needs Approval' : 'Idle';
  const badgeStatus = status === 'blocked' ? 'pending' : status === 'active' ? 'approved' : 'info';

  return (
    <TouchableOpacity style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} onPress={onPress}>
      <View style={[styles.avatar, { backgroundColor: theme.colors.accent + '15' }]}>
        <Ionicons name="sparkles" size={16} color={theme.colors.accent} />
      </View>
      <View style={styles.main}>
        <Text style={[styles.name, { color: theme.colors.text }]}>{name}</Text>
        <Text style={[styles.role, { color: theme.colors.textSecondary }]}>{role}</Text>
        {task ? <Text style={[styles.task, { color: theme.colors.textMuted }]} numberOfLines={1}>{task}</Text> : null}
      </View>
      <AuditBadge status={badgeStatus as any} text={statusText} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontFamily: 'DMSans_700Bold',
  },
  role: {
    fontSize: 12,
    fontFamily: 'DMSans_500Medium',
  },
  task: {
    fontSize: 11,
    fontFamily: 'DMSans_400Regular',
  },
});
