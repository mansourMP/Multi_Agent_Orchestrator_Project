import React from 'react';

import { Pressable, View } from 'react-native';

import {
  AppBadge,
  AppCaption,
  AppCard,
  AppDivider,
  AppHeading,
  AppScreen,
  AppText,
  AppTitle,
} from './primitives';
import { SurfaceEmptyScreen } from './state-screens';

export type ListDetailItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  kind?: string | null;
  status?: string | null;
  timestamp?: string | null;
  detailLines?: Array<{
    label: string;
    value: string;
  }>;
  raw?: Record<string, unknown> | null;
};

export function ListDetailScreen({
  badge,
  title,
  body,
  items,
  selectedId,
  onSelect,
  emptyTitle,
  emptyBody,
  notice,
  renderDetailActions,
  renderDetailBody,
}: {
  badge: string;
  title: string;
  body: string;
  items: ListDetailItem[];
  selectedId: string | null;
  onSelect: (itemId: string) => void;
  emptyTitle: string;
  emptyBody: string;
  notice?: React.ReactNode;
  renderDetailActions?: (item: ListDetailItem) => React.ReactNode;
  renderDetailBody?: (item: ListDetailItem) => React.ReactNode;
}) {
  if (items.length === 0) {
    return (
      <SurfaceEmptyScreen
        title={emptyTitle}
        body={emptyBody}
      />
    );
  }

  const selectedItem = items.find((item) => item.id === selectedId) ?? items[0];

  return (
    <AppScreen scroll>
      <AppCard>
        <AppBadge tone="accent">{badge}</AppBadge>
        <AppHeading>{title}</AppHeading>
        <AppText muted>{body}</AppText>
      </AppCard>
      {notice}
      <AppCard>
        <AppTitle>Queue</AppTitle>
        <View style={{ gap: 10 }}>
          {items.map((item, index) => {
            const active = item.id === selectedItem.id;
            return (
              <React.Fragment key={item.id}>
                <Pressable
                  onPress={() => onSelect(item.id)}
                  style={{
                    borderRadius: 14,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: active ? '#91b4ff' : '#232d3a',
                    backgroundColor: active ? '#13213e' : '#1d2531',
                    gap: 6,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                    <AppTitle>{item.title}</AppTitle>
                    {item.status ? (
                      <AppBadge tone={active ? 'accent' : 'default'}>{item.status}</AppBadge>
                    ) : null}
                  </View>
                  {item.subtitle ? <AppText muted>{item.subtitle}</AppText> : null}
                  {item.timestamp ? <AppCaption>{item.timestamp}</AppCaption> : null}
                </Pressable>
                {index < items.length - 1 ? <AppDivider /> : null}
              </React.Fragment>
            );
          })}
        </View>
      </AppCard>
      <AppCard>
        <AppBadge>{selectedItem.status ?? 'Detail'}</AppBadge>
        <AppHeading>{selectedItem.title}</AppHeading>
        {selectedItem.subtitle ? <AppText muted>{selectedItem.subtitle}</AppText> : null}
        <View style={{ gap: 10 }}>
          {(selectedItem.detailLines ?? []).map((detail) => (
            <View key={`${selectedItem.id}:${detail.label}`} style={{ gap: 4 }}>
              <AppCaption>{detail.label}</AppCaption>
              <AppText>{detail.value}</AppText>
            </View>
          ))}
        </View>
        {renderDetailBody ? renderDetailBody(selectedItem) : null}
        {renderDetailActions ? renderDetailActions(selectedItem) : null}
      </AppCard>
    </AppScreen>
  );
}
