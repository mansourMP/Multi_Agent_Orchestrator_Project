import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';

type AuditStatus = 'pending' | 'approved' | 'rejected' | 'info';

const STATUS_META: Record<AuditStatus, { icon: string; label: string }> = {
  pending: { icon: 'time-outline', label: 'Pending' },
  approved: { icon: 'checkmark-circle-outline', label: 'Approved' },
  rejected: { icon: 'close-circle-outline', label: 'Rejected' },
  info: { icon: 'information-circle-outline', label: 'Info' },
};

export const AuditBadge: React.FC<{ status: AuditStatus; text?: string }> = ({ status, text }) => {
  const theme = useAppTheme();
  const meta = STATUS_META[status];
  const tint =
    status === 'approved'
      ? theme.colors.success
      : status === 'rejected'
        ? theme.colors.error
        : status === 'pending'
          ? theme.colors.warning
          : theme.colors.textSecondary;

  return (
    <View style={[styles.badge, { backgroundColor: tint + '15', borderColor: tint + '40' }]}>
      <Ionicons name={meta.icon as any} size={12} color={tint} />
      <Text style={[styles.label, { color: tint }]}>{text || meta.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: {
    fontSize: 10,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
