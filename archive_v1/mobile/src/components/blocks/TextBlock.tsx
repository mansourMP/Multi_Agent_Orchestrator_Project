import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from "@expo/vector-icons";

import { useAppTheme } from '@/src/theme/useAppTheme';

interface TextBlockProps {
  role: 'user' | 'agent';
  message: string;
}

export const TextBlock: React.FC<TextBlockProps> = ({ role, message }) => {
  const theme = useAppTheme();
  const styles = useStyles(theme);
  const isUser = role === 'user';

  return (
    <View style={styles.container}>
      {/* Icon/Avatar Area */}
      <View style={styles.avatarContainer}>
        {isUser ? (
          <View style={[styles.avatar, { backgroundColor: theme.colors.accent + '20' }]}>
            <Text style={{ color: theme.colors.accent, fontWeight: '700', fontSize: 14 }}>M</Text>
          </View>
        ) : (
           <View style={[styles.avatar, { backgroundColor: theme.colors.cardHover }]}>
            <Ionicons name="sparkles" size={16} color={theme.colors.text} />
          </View>
        )}
      </View>

      {/* Message Content Area */}
      <View style={styles.contentContainer}>
        <Text style={styles.nameLabel}>{isUser ? 'Mansur' : 'Empyralis'}</Text>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
};

const useStyles = (theme: ReturnType<typeof useAppTheme>) => StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  avatarContainer: {
    width: 32,
    alignItems: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentContainer: {
    flex: 1,
    paddingTop: 2,
  },
  nameLabel: {
    fontSize: 14,
    fontFamily: 'DMSans_700Bold',
    color: theme.colors.text,
    marginBottom: 6,
  },
  text: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 26,
    fontFamily: 'DMSans_400Regular',
  },
});

