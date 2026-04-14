import React from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAppTheme } from './theme';

export function AppScreen({
  children,
  scroll = false,
}: {
  children: React.ReactNode;
  scroll?: boolean;
}) {
  const { tokens } = useAppTheme();
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={{
        padding: tokens.spacing.lg,
        gap: tokens.spacing.md,
      }}
      style={{ flex: 1 }}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{
      flex: 1,
      padding: tokens.spacing.lg,
      gap: tokens.spacing.md,
    }}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: tokens.colors.canvas }]}>
      {content}
    </SafeAreaView>
  );
}

export function AppCard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { tokens } = useAppTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tokens.colors.panel,
          borderColor: tokens.colors.border,
          borderRadius: tokens.radius.md,
          padding: tokens.spacing.lg,
        },
        tokens.shadow.panel,
      ]}
    >
      {children}
    </View>
  );
}

export function AppHeading({
  children,
}: {
  children: React.ReactNode;
}) {
  const { tokens } = useAppTheme();
  return (
    <Text style={{ color: tokens.colors.textPrimary, fontSize: tokens.typography.heading, fontWeight: '700' }}>
      {children}
    </Text>
  );
}

export function AppTitle({
  children,
}: {
  children: React.ReactNode;
}) {
  const { tokens } = useAppTheme();
  return (
    <Text style={{ color: tokens.colors.textPrimary, fontSize: tokens.typography.title, fontWeight: '600' }}>
      {children}
    </Text>
  );
}

export function AppText({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  const { tokens } = useAppTheme();
  return (
    <Text style={{ color: muted ? tokens.colors.textSecondary : tokens.colors.textPrimary, fontSize: tokens.typography.body, lineHeight: 20 }}>
      {children}
    </Text>
  );
}

export function AppCaption({
  children,
}: {
  children: React.ReactNode;
}) {
  const { tokens } = useAppTheme();
  return (
    <Text style={{ color: tokens.colors.textMuted, fontSize: tokens.typography.caption, lineHeight: 16 }}>
      {children}
    </Text>
  );
}

export function AppBadge({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'accent' | 'success' | 'warning';
}) {
  const { tokens } = useAppTheme();
  const backgroundColor = tone === 'accent'
    ? '#13213e'
    : tone === 'success'
      ? '#10271f'
      : tone === 'warning'
        ? '#2b2213'
        : tokens.colors.panelInteractive;
  const textColor = tone === 'accent'
    ? tokens.colors.accentStrong
    : tone === 'success'
      ? tokens.colors.success
      : tone === 'warning'
        ? tokens.colors.warning
        : tokens.colors.textSecondary;

  return (
    <View style={{
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor,
      borderWidth: 1,
      borderColor: tokens.colors.border,
    }}
    >
      <Text style={{ color: textColor, fontSize: tokens.typography.caption, fontWeight: '600' }}>
        {children}
      </Text>
    </View>
  );
}

export function AppField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ gap: tokens.spacing.xs }}>
      <AppCaption>{label}</AppCaption>
      {children}
    </View>
  );
}

export function AppInput(props: React.ComponentProps<typeof TextInput>) {
  const { tokens } = useAppTheme();
  return (
    <TextInput
      placeholderTextColor={tokens.colors.textMuted}
      {...props}
      style={[
        styles.input,
        {
          backgroundColor: tokens.colors.panelInteractive,
          borderColor: tokens.colors.borderStrong,
          color: tokens.colors.textPrimary,
          borderRadius: tokens.radius.sm,
          paddingHorizontal: tokens.spacing.md,
          paddingVertical: tokens.spacing.md,
        },
        props.style,
      ]}
    />
  );
}

export function AppButton({
  label,
  onPress,
  tone = 'primary',
  disabled = false,
}: {
  label: string;
  onPress?: () => void;
  tone?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const { tokens } = useAppTheme();
  const backgroundColor = tone === 'secondary'
    ? tokens.colors.panelInteractive
    : tone === 'danger'
      ? '#371a1a'
      : tokens.colors.accent;
  const textColor = tone === 'secondary'
    ? tokens.colors.textPrimary
    : tone === 'danger'
      ? tokens.colors.danger
      : tokens.colors.canvas;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
        backgroundColor,
        borderRadius: tokens.radius.sm,
        paddingVertical: tokens.spacing.md,
        paddingHorizontal: tokens.spacing.lg,
        borderWidth: 1,
        borderColor: tone === 'primary' ? tokens.colors.accentStrong : tokens.colors.border,
        alignItems: 'center',
      })}
    >
      <Text style={{ color: textColor, fontSize: tokens.typography.body, fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function AppDivider() {
  const { tokens } = useAppTheme();
  return <View style={{ height: 1, backgroundColor: tokens.colors.border }} />;
}

export function AppLoadingState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <AppScreen>
      <AppCard>
        <AppBadge tone="accent">Launching</AppBadge>
        <AppHeading>{title}</AppHeading>
        <AppText muted>{body}</AppText>
      </AppCard>
    </AppScreen>
  );
}

export function AppErrorState({
  title,
  body,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  title: string;
  body: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}) {
  return (
    <AppScreen>
      <AppCard>
        <AppBadge tone="warning">Attention</AppBadge>
        <AppHeading>{title}</AppHeading>
        <AppText muted>{body}</AppText>
        <View style={{ gap: 10 }}>
          {primaryActionLabel ? (
            <AppButton label={primaryActionLabel} onPress={onPrimaryAction} />
          ) : null}
          {secondaryActionLabel ? (
            <AppButton label={secondaryActionLabel} onPress={onSecondaryAction} tone="secondary" />
          ) : null}
        </View>
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  card: {
    gap: 12,
    borderWidth: 1,
  },
  input: {
    fontSize: 14,
    borderWidth: 1,
  },
});
