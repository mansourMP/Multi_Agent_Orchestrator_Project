import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '@/src/theme/useAppTheme';
interface TopBarProps {
  userName: string;
  onSettingsPress: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ userName, onSettingsPress }) => {
  const theme = useAppTheme();
  const styles = useStyles(theme);
  return (
    <View style={styles.container}>
      <Text style={styles.userName}>{userName}</Text>
      <TouchableOpacity onPress={onSettingsPress} style={styles.settingsButton}>
        <Ionicons name="settings-sharp" size={22} color="#666" />
      </TouchableOpacity>
    </View>
  );
};

const useStyles = (theme: any) => StyleSheet.create({
  container: {
    height: 60,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  userName: {
    color: theme.colors.text,
    fontSize: 20,
    fontFamily: 'Fraunces_700Bold',
  },
  settingsButton: {
    padding: 8,
  },
});
