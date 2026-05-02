import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/useAppTheme';
import { ActionButton, ActionChip, AuditBadge } from './system';

// Import our beautiful widgets
import { NutritionHub } from './widgets/NutritionHub';
import { FinanceHub } from './widgets/FinanceHub';
import { StudyArtifact } from './widgets/StudyArtifact';

// Core Type Definitions for the Generative UI Protocol
export type ComponentType = 'NUTRITION_LOG' | 'FINANCE_SUMMARY' | 'STUDY_PLAN_CARD' | 'GENERIC_BUTTONS' | 'ACTION_BUTTONS';

export interface Action {
  label: string;
  command: string;
}

export interface AgentPayload {
  intent: string;
  messageType?: "text" | "approval" | "tool";
  approval?: {
    kind?: "run" | "direct";
    action: string;
    target?: string;
    reason?: string;
    approvalId?: string;
    runId?: string;
    connector?: string;
    actionId?: string;
    input?: string;
  };
  understood?: string; // explicit understanding of the request
  plan?: string[]; // Step-by-step execution plan
  source?: string; // Tool or agent source
  confidence?: number; // 0-100 percentage
  resultingChanges?: string; // Summary of state changes
  undoAvailable?: boolean;
  requiresApproval?: boolean;
  approvalId?: string;
  speech: string;
  ui?: {
    type: ComponentType;
    props: any;
  };
  actions?: Action[];
}

// Registry for Generative UI
const ComponentRegistry: Record<string, (props: any) => React.ReactElement> = {
  NUTRITION_LOG: (props) => <NutritionHub {...props} />,
  FINANCE_SUMMARY: (props) => <FinanceHub {...props} />,
  STUDY_PLAN_CARD: (props) => <StudyArtifact {...props} />,
};

interface ActionButtonsProps {
  actions: Action[];
  onAction?: (cmd: string) => void;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({ actions, onAction }) => {
  return (
    <View style={styles.actionRow}>
      {actions.map((btn) => (
        <ActionChip key={btn.command} label={btn.label} onPress={() => onAction && onAction(btn.command)} />
      ))}
    </View>
  );
};

export const AgentRenderer: React.FC<{ payload: AgentPayload; onAction?: (cmd: string) => void }> = ({ payload, onAction }) => {
  const theme = useAppTheme();
  const understood = payload.understood || payload.speech;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      {/* Header */}
      <View style={styles.contractHeader}>
        <Text style={[styles.intentLabel, { color: theme.colors.textSecondary }]}>ACTION RESULT</Text>
        <Text style={[styles.intentValue, { color: theme.colors.text }]}>{payload.intent}</Text>
      </View>

      {/* Understood */}
      <View style={styles.speechCard}>
        <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>UNDERSTOOD</Text>
        <Text style={[styles.speechText, { color: theme.colors.text }]}>{understood}</Text>
      </View>

      {/* Execution Plan */}
      {payload.plan && (
        <View style={styles.planSection}>
          <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>PLAN</Text>
          {payload.plan.map((step, i) => (
            <View key={i} style={styles.planStep}>
              <View style={[styles.stepDot, { backgroundColor: theme.colors.accent }]} />
              <Text style={[styles.stepText, { color: theme.colors.text }]}>{step}</Text>
            </View>
          ))}
        </View>
      )}
      
      {/* Generative UI portion */}
      {payload.ui && ComponentRegistry[payload.ui.type] && (
        <View style={styles.uiWrapper}>
          {ComponentRegistry[payload.ui.type](payload.ui.props)}
        </View>
      )}

      {/* Resulting Changes */}
      {payload.resultingChanges && (
        <View style={styles.changesSection}>
           <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>CHANGED</Text>
           <Text style={[styles.changesText, { color: theme.colors.text }]}>{payload.resultingChanges}</Text>
        </View>
      )}

      {/* Approval Gate */}
      {payload.requiresApproval && payload.approvalId && (
        <View style={[styles.approvalSection, { borderColor: theme.colors.border, backgroundColor: theme.colors.cardHover }]}>
          <View style={styles.approvalHeader}>
            <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>APPROVAL REQUIRED</Text>
            <AuditBadge status="pending" />
          </View>
          <View style={styles.approvalActions}>
            <ActionButton
              label="Approve"
              variant="primary"
              icon="checkmark"
              onPress={() => onAction && onAction(`APPROVE:${payload.approvalId}`)}
            />
            <ActionButton
              label="Reject"
              variant="danger"
              icon="close"
              onPress={() => onAction && onAction(`REJECT:${payload.approvalId}`)}
            />
          </View>
        </View>
      )}

      {/* Footer: Source & Confidence & Undo */}
      <View style={[styles.contractFooter, { borderTopColor: theme.colors.border }]}>
        <View style={styles.footerItem}>
          <Text style={[styles.footerLabel, { color: theme.colors.textSecondary }]}>SOURCE</Text>
          <Text style={[styles.footerValue, { color: theme.colors.text }]}>{payload.source || 'Kernel Orchestrator'}</Text>
        </View>
        <View style={styles.footerItem}>
          <Text style={[styles.footerLabel, { color: theme.colors.textSecondary }]}>CONFIDENCE</Text>
          <Text style={[styles.footerValue, { color: payload.confidence && payload.confidence > 80 ? '#10B981' : theme.colors.accent }]}>
            {payload.confidence || 100}%
          </Text>
        </View>
        {payload.undoAvailable && (
          <TouchableOpacity style={styles.undoBtn} onPress={() => onAction && onAction('UNDO')}>
            <Ionicons name="arrow-undo" size={14} color={theme.colors.accent} />
            <Text style={[styles.undoText, { color: theme.colors.accent }]}>UNDO</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Instant Action portion */}
      {payload.actions && payload.actions.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <ActionButtons actions={payload.actions} onAction={onAction} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
    marginHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    overflow: 'hidden',
  },
  contractHeader: {
    marginBottom: 16,
  },
  intentLabel: {
    fontSize: 10,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 1,
    marginBottom: 4,
  },
  intentValue: {
    fontSize: 18,
    fontFamily: 'Fraunces_700Bold',
  },
  planSection: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderRadius: 12,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: 'DMSans_700Bold',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  planStep: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 10,
  },
  stepText: {
    fontSize: 13,
    fontFamily: 'DMSans_400Regular',
  },
  speechCard: {
    marginBottom: 16,
  },
  speechText: {
    fontSize: 16,
    fontFamily: 'DMSans_400Regular',
    lineHeight: 22,
  },
  uiWrapper: {
    marginBottom: 16,
  },
  changesSection: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,0,0,0.1)',
  },
  changesText: {
    fontSize: 13,
    fontFamily: 'DMSans_400Regular',
    fontStyle: 'italic',
  },
  contractFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
    marginTop: 8,
  },
  footerItem: {
    flex: 1,
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
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  undoText: {
    fontSize: 11,
    fontFamily: 'DMSans_700Bold',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  approvalSection: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  approvalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  approvalActions: {
    flexDirection: 'row',
    gap: 8,
  },
});
