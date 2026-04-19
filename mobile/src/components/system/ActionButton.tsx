import React from 'react';
import { Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';

type Variant = 'primary' | 'secondary' | 'danger';

type ActionButtonProps = {
  label: string;
  icon?: string;
  variant?: Variant;
  onPress?: () => void;
  style?: ViewStyle;
};

export const ActionButton: React.FC<ActionButtonProps> = ({ label, icon, variant = 'secondary', onPress, style }) => {
  const theme = useAppTheme();
  const palette =
    variant === 'primary'
      ? theme.colors.accent
      : variant === 'danger'
        ? theme.colors.error
        : theme.colors.text;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.button,
        {
          backgroundColor: variant === 'primary' ? palette : theme.colors.surface,
          borderColor: variant === 'secondary' ? theme.colors.border : palette,
        },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon as any} size={14} color={variant === 'primary' ? '#fff' : palette} /> : null}
      <Text style={[styles.label, { color: variant === 'primary' ? '#fff' : palette }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  label: {
    fontSize: 12,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 0.3,
  },
});
