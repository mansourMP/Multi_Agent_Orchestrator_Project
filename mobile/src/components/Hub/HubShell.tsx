import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  onPress: () => void;
}

interface TimelineEvent {
  id: string;
  title: string;
  time: string;
  icon: string;
  color: string;
}

interface HubShellProps {
  title: string;
  status: string;
  icon: string;
  iconColor?: string;
  quickActions: QuickAction[];
  insight?: {
    text: string;
    confidence: number;
  };
  timeline: TimelineEvent[];
  children: React.ReactNode;
  source?: string;
  onUndo?: () => void;
}

export const HubShell: React.FC<HubShellProps> = ({
  title,
  status,
  icon,
  iconColor,
  quickActions,
  insight,
  timeline,
  children,
  source = 'Orchestration Kernel',
  onUndo
}) => {
  const theme = useAppTheme();
  const accent = iconColor || theme.colors.accent;

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Status Header */}
      <View style={styles.header}>
        <View style={[styles.iconBox, { backgroundColor: accent + '15' }]}>
          <Ionicons name={icon as any} size={28} color={accent} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.hubTitle, { color: theme.colors.text }]}>{title}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />
            <Text style={[styles.statusText, { color: theme.colors.textSecondary }]}>{status}</Text>
          </View>
        </View>
      </View>

      {/* 2. Quick Actions Row */}
      {quickActions.length > 0 && (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.actionScroll}
          contentContainerStyle={styles.actionContent}
        >
          {quickActions.map(action => (
            <TouchableOpacity 
              key={action.id} 
              onPress={action.onPress}
              style={[styles.actionBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
            >
              <Ionicons name={action.icon as any} size={18} color={accent} />
              <Text style={[styles.actionLabel, { color: theme.colors.text }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* 3. Main Content (Domain UI) */}
      <View style={styles.mainContent}>
        {children}
      </View>

      {/* 4. AI Insight Card */}
      {insight && (
        <View style={[styles.insightCard, { backgroundColor: theme.colors.surface, borderColor: accent + '30' }]}>
          <View style={styles.insightHeader}>
             <Ionicons name="sparkles" size={16} color={accent} />
             <Text style={[styles.insightLabel, { color: accent }]}>AI INSIGHT</Text>
             <Text style={[styles.confidenceText, { color: theme.colors.textSecondary }]}>{insight.confidence}% confidence</Text>
          </View>
          <Text style={[styles.insightText, { color: theme.colors.text }]}>{insight.text}</Text>
        </View>
      )}

      {/* 5. Interaction Timeline */}
      {timeline.length > 0 && (
        <View style={styles.timelineSection}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Timeline</Text>
          {timeline.map((event, idx) => (
            <View key={event.id} style={styles.timelineItem}>
              <View style={styles.timelineLeft}>
                <View style={[styles.timelineIcon, { backgroundColor: event.color + '20' }]}>
                  <Ionicons name={event.icon as any} size={14} color={event.color} />
                </View>
                {idx !== timeline.length - 1 && <View style={[styles.timelineLine, { backgroundColor: theme.colors.border }]} />}
              </View>
              <View style={styles.timelineRight}>
                <Text style={[styles.eventTitle, { color: theme.colors.text }]}>{event.title}</Text>
                <Text style={[styles.eventTime, { color: theme.colors.textSecondary }]}>{event.time}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* 6. Traceability Footer */}
      <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
        <View>
          <Text style={[styles.footerLabel, { color: theme.colors.textSecondary }]}>SOURCE</Text>
          <Text style={[styles.footerValue, { color: theme.colors.text }]}>{source}</Text>
        </View>
        {onUndo && (
          <TouchableOpacity style={[styles.undoBtn, { backgroundColor: theme.colors.surface }]} onPress={onUndo}>
            <Ionicons name="arrow-undo" size={14} color={accent} />
            <Text style={[styles.undoText, { color: accent }]}>Undo</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  iconBox: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    marginLeft: 16,
  },
  hubTitle: {
    fontSize: 24,
    fontFamily: 'Fraunces_700Bold',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 13,
    fontFamily: 'DMSans_500Medium',
  },
  actionScroll: {
    marginHorizontal: -24,
    marginBottom: 24,
  },
  actionContent: {
    paddingHorizontal: 24,
    gap: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  actionLabel: {
    fontSize: 13,
    fontFamily: 'DMSans_700Bold',
  },
  mainContent: {
    marginBottom: 24,
  },
  insightCard: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 32,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 6,
  },
  insightLabel: {
    fontSize: 10,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 1,
    flex: 1,
  },
  confidenceText: {
    fontSize: 10,
    fontFamily: 'DMSans_400Regular',
  },
  insightText: {
    fontSize: 15,
    fontFamily: 'DMSans_400Regular',
    lineHeight: 22,
  },
  timelineSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Fraunces_700Bold',
    marginBottom: 16,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 16,
  },
  timelineLeft: {
    alignItems: 'center',
  },
  timelineIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginVertical: 4,
  },
  timelineRight: {
    flex: 1,
    paddingBottom: 24,
  },
  eventTitle: {
    fontSize: 15,
    fontFamily: 'DMSans_700Bold',
    marginBottom: 2,
  },
  eventTime: {
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 20,
  },
  footerLabel: {
    fontSize: 9,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  footerValue: {
    fontSize: 12,
    fontFamily: 'DMSans_700Bold',
  },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  undoText: {
    fontSize: 13,
    fontFamily: 'DMSans_700Bold',
  }
});
