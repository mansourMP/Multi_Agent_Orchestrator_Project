import React from 'react';
import { View, Text } from 'react-native';
import { StatusCard, TimelineRow } from '../system';

interface BarChartWidgetProps {
  data: any; // { total: number, currency: string, labels: string[], datasets: any[] }
}

export const BarChartWidget: React.FC<BarChartWidgetProps> = ({ data }) => {
  // Fallback for empty data
  if (!data || !data.datasets) return <Text>No chart data</Text>;

  const currency = data.currency === 'USD' ? '$' : data.currency;
  const rows = data.labels?.map((label: string, i: number) => {
    const dataset1Val = data.datasets[0]?.data[i] || 0;
    const dataset2Val = data.datasets[1]?.data[i] || 0;
    const total = dataset1Val + dataset2Val;
    return { label, total };
  }) || [];

  return (
    <View style={{ gap: 12 }}>
      <StatusCard
        title="Total Spending"
        value={`${currency}${data.total?.toFixed(2)}`}
        subtitle="Last 7 days"
        meta="Aggregated from signals"
      />
      <View style={{ gap: 8 }}>
        {rows.map((row) => (
          <TimelineRow
            key={row.label}
            title={row.label}
            description="Combined series"
            time={`${currency}${row.total.toFixed(2)}`}
            icon="bar-chart-outline"
            color="#6C63FF"
          />
        ))}
      </View>
    </View>
  );
};
