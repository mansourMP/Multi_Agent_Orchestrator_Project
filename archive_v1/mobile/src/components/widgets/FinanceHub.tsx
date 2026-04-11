import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/useAppTheme';
import { HubShell } from '../Hub/HubShell';
import { StatusCard, TimelineRow } from '../system';

interface FinanceHubProps {
  balance: number;
  spent: string;
  category: string;
  percentage: string;
  footer: string;
}

export const FinanceHub: React.FC<FinanceHubProps> = ({ balance, spent, category, percentage, footer }) => {
  const theme = useAppTheme();

  const QUICK_ACTIONS = [
    { id: 'scan', label: 'Scan Receipt', icon: 'camera', onPress: () => {} },
    { id: 'review', label: 'Review Spend', icon: 'pie-chart', onPress: () => {} },
    { id: 'budget', label: 'Set Budget', icon: 'options', onPress: () => {} },
  ];

  const TIMELINE = [
    { id: '1', title: 'Transaction: Whole Foods', time: '10:15 AM', icon: 'cart', color: '#6C63FF' },
    { id: '2', title: 'Categorized: Groceries', time: '10:16 AM', icon: 'pricetag', color: '#3B82F6' },
    { id: '3', title: 'Automated Expense Sync Complete', time: '10:17 AM', icon: 'cloud-done', color: '#10B981' },
  ];

  return (
    <HubShell
      title="Market Pulse"
      status="Healthy"
      icon="wallet"
      iconColor="#6C63FF"
      quickActions={QUICK_ACTIONS}
      timeline={TIMELINE}
      insight={{
        text: "You've saved $120 more than last month by optimizing recurring subscriptions. Good work.",
        confidence: 88
      }}
      source="Finance Orchestrator"
    >
      <View style={styles.content}>
        <StatusCard title="Account Balance" value={`$${balance.toLocaleString()}`} subtitle="Net cash position" meta="Updated recently" />
        <StatusCard title="Monthly Spend" value={spent} subtitle={category} meta={`${percentage} of budget`} accent="#6C63FF" />
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Recent Signals</Text>
          <View style={{ gap: 10 }}>
            <TimelineRow title="Subscription optimization" description="Saved $120 this month" time="Today" icon="checkmark-circle-outline" color="#10B981" />
            <TimelineRow title="Budget alert" description={footer} time="Yesterday" icon="alert-circle-outline" color="#F59E0B" />
          </View>
        </View>
      </View>
    </HubShell>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  section: {
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Fraunces_700Bold',
    marginBottom: 10,
  },
});
