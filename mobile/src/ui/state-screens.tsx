import React from 'react';

import { View } from 'react-native';

import {
  AppBadge,
  AppButton,
  AppCard,
  AppHeading,
  AppScreen,
  AppText,
} from './primitives';

export function SurfaceLoadingScreen({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <AppScreen>
      <AppCard>
        <AppBadge tone="accent">Syncing</AppBadge>
        <AppHeading>{title}</AppHeading>
        <AppText muted>{body}</AppText>
      </AppCard>
    </AppScreen>
  );
}

export function SurfaceErrorScreen({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <AppScreen>
      <AppCard>
        <AppBadge tone="warning">Unavailable</AppBadge>
        <AppHeading>{title}</AppHeading>
        <AppText muted>{body}</AppText>
        {actionLabel ? (
          <AppButton label={actionLabel} onPress={onAction} />
        ) : null}
      </AppCard>
    </AppScreen>
  );
}

export function SurfaceEmptyScreen({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <AppScreen>
      <AppCard>
        <AppBadge>Empty</AppBadge>
        <AppHeading>{title}</AppHeading>
        <AppText muted>{body}</AppText>
        {actionLabel ? (
          <AppButton label={actionLabel} onPress={onAction} tone="secondary" />
        ) : null}
      </AppCard>
    </AppScreen>
  );
}

export function SurfaceNoticeCard({
  title,
  body,
  tone = 'accent',
  actions = [],
}: {
  title: string;
  body: string;
  tone?: 'accent' | 'success' | 'warning';
  actions?: Array<{
    label: string;
    onPress: () => void;
    tone?: 'primary' | 'secondary' | 'danger';
  }>;
}) {
  return (
    <AppCard>
      <AppBadge tone={tone}>{title}</AppBadge>
      <AppText muted>{body}</AppText>
      {actions.length > 0 ? (
        <View style={{ gap: 10 }}>
          {actions.map((action) => (
            <AppButton
              key={action.label}
              label={action.label}
              tone={action.tone}
              onPress={action.onPress}
            />
          ))}
        </View>
      ) : null}
    </AppCard>
  );
}
