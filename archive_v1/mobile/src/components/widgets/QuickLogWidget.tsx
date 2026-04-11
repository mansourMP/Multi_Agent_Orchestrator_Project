import React from 'react';
import { View } from 'react-native';
import { TimelineRow } from '../system';

interface QuickLogWidgetProps {
  data: any; // { entry: string, value: string, unit: string, timestamp: string }
}

export const QuickLogWidget: React.FC<QuickLogWidgetProps> = ({ data }) => {
  if (!data) return null;

  return (
    <View>
      <TimelineRow
        title={data.entry || 'Item'}
        description={`${data.value} ${data.unit}`}
        time={new Date(data.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        icon="flash-outline"
        color="#F59E0B"
      />
    </View>
  );
};
