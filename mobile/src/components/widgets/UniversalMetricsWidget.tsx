import React from 'react';
import { View } from 'react-native';
import { ActionButton, MetricRing, StatusCard } from '../system';

export interface UniversalMetricsData {
  title: string;
  icon: string;
  color: string;
  primaryMetric: string;
  subtitle?: string;
  progress?: number; // 0-100
  actionLabel?: string;
  actionId?: string;
}

interface UniversalMetricsWidgetProps {
  data: UniversalMetricsData;
  onAction?: (actionId: string, payload?: any) => void;
}

export const UniversalMetricsWidget: React.FC<UniversalMetricsWidgetProps> = ({ data, onAction }) => {
  return (
    <View style={{ gap: 14 }}>
      <StatusCard
        title={data.title}
        value={data.primaryMetric}
        subtitle={data.subtitle}
        meta={data.progress !== undefined ? `${Math.round(data.progress)}% progress` : undefined}
        accent={data.color}
      />

      {data.progress !== undefined && (
        <MetricRing
          value={data.progress}
          label="Progress"
          sublabel={`${Math.round(data.progress)}%`}
          color={data.color}
        />
      )}

      {data.actionLabel && data.actionId && onAction && (
        <ActionButton
          label={data.actionLabel}
          variant="secondary"
          onPress={() => onAction(data.actionId!)}
        />
      )}
    </View>
  );
};
