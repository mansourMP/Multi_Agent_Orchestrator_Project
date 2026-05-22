import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../../theme/useAppTheme';
import { Ionicons } from '@expo/vector-icons';
import { ActionChip } from '../system';

interface StudyArtifactProps {
  title: string;
  description: string;
  type: string;
  artifact_id: string;
}

export const StudyArtifact: React.FC<StudyArtifactProps> = ({ title, description, type, artifact_id }) => {
  const theme = useAppTheme();

  return (
    <TouchableOpacity 
      style={[styles.container, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
      activeOpacity={0.7}
      accessibilityLabel={`Study artifact ${artifact_id}`}
    >
      <View style={[styles.iconContainer, { backgroundColor: theme.colors.accent + '15' }]}>
        <Ionicons name="document-text-outline" size={22} color={theme.colors.accent} />
      </View>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
          <ActionChip label={type} />
        </View>
        <Text style={[styles.description, { color: theme.colors.textSecondary }]} numberOfLines={2}>
          {description}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    gap: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontFamily: 'DMSans_700Bold',
  },
  description: {
    fontSize: 13,
    fontFamily: 'DMSans_400Regular',
    lineHeight: 18,
    marginBottom: 8,
  },
});
