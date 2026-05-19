import React from 'react';
import { Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';

import { MotionPressable } from './MotionPressable';

type Variant = 'primary' | 'secondary' | 'danger';

type ActionButtonProps = {
  label: string;
  icon?: string;
  variant?: Variant;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export const ActionButton: React.FC<ActionButtonProps> = ({
  label,
  icon,
  variant = 'secondary',
  onPress,
  disabled,
  style,
}) => {
  const theme = useAppTheme();
  const palette =
    variant === 'primary'
      ? { background: theme.colors.accent, border: theme.colors.accent, text: theme.colors.accentText }
      : variant === 'danger'
        ? { background: theme.colors.errorMuted, border: 'rgba(194, 65, 59, 0.16)', text: theme.colors.error }
        : { background: theme.colors.card, border: theme.colors.border, text: theme.colors.text };

  return (
    <MotionPressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
          opacity: disabled ? 0.56 : 1,
        },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon as any} size={14} color={palette.text} /> : null}
      <Text style={[styles.label, { color: palette.text }]}>
        {label}
      </Text>
    </MotionPressable>
  );
};

const styles = StyleSheet.create({
  button: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  label: {
    fontSize: 12.5,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 0.15,
  },
});
