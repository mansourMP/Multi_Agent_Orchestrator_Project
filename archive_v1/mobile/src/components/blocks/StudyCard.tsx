import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '@/src/theme/useAppTheme';
interface StudyCardProps {
  subject: string;
  streak: number;
  nextTopic: string;
}

export const StudyCard: React.FC<StudyCardProps> = ({ subject, streak, nextTopic }) => {
  const theme = useAppTheme();
  const styles = useStyles(theme);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Study Session</Text>
      <Text style={styles.subject}>{subject}</Text>
      <View style={styles.streakRow}>
        <Ionicons name="flame" size={20} color="#FF9500" />
        <Text style={styles.streakText}>{streak} day streak</Text>
      </View>
      <View style={styles.nextContainer}>
        <Text style={styles.nextLabel}>NEXT TOPIC</Text>
        <Text style={styles.nextText}>{nextTopic}</Text>
      </View>
    </View>
  );
};

const useStyles = (theme: any) => StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    width: '100%',
    marginVertical: 8,
  },
  title: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontFamily: 'Fraunces_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  subject: {
    color: theme.colors.text,
    fontSize: 20,
    fontFamily: 'Fraunces_700Bold',
    marginBottom: 12,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  streakText: {
    color: '#FF9500',
    fontSize: 14,
    fontFamily: 'DMSans_700Bold',
    marginLeft: 6,
  },
  nextContainer: {
    backgroundColor: theme.colors.background,
    padding: 12,
    borderRadius: 8,
  },
  nextLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontFamily: 'DMSans_700Bold',
    marginBottom: 4,
  },
  nextText: {
    color: theme.colors.text,
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
  },
});
