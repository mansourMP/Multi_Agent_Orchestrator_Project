import React from 'react';
import { View, StyleSheet } from 'react-native';
import { HubShell } from '../Hub/HubShell';
import { StatusCard } from '../system';

interface FinanceHubProps {
  balance: number;
  spent: string;
  category: string;
  percentage: string;
  footer: string;
}

export const FinanceHub: React.FC<FinanceHubProps> = ({ balance, spent, category, percentage, footer }) => {
  return (
    <HubShell
      title="Market Pulse"
      status="Healthy"
      icon="wallet"
      iconColor="#6C63FF"
      quickActions={[]}
      timeline={[]}
      source="Finance summary"
    >
      <View style={styles.content}>
        <StatusCard title="Account Balance" value={`$${balance.toLocaleString()}`} subtitle="Net cash position" meta="Updated recently" />
        <StatusCard title="Monthly Spend" value={spent} subtitle={category} meta={footer || `${percentage} of budget`} accent="#6C63FF" />
      </View>
    </HubShell>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
});
