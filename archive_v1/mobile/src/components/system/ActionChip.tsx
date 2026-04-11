import React from 'react';
import { Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';

type ActionChipProps = {
  label: string;
  icon?: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
};

export const ActionChip: React.FC<ActionChipProps> = ({ label, icon, selected, onPress, style }) => {
  const theme = useAppTheme();
  const accent = theme.colors.accent;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? accent + '15' : theme.colors.surface,
          borderColor: selected ? accent + '40' : theme.colors.border,
        },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon as any} size={14} color={selected ? accent : theme.colors.textSecondary} /> : null}
      <Text style={[styles.label, { color: selected ? accent : theme.colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  label: {
    fontSize: 12,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 0.2,
  },
});
