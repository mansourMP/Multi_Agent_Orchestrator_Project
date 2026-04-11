import React from 'react';
import { View, Text } from 'react-native';
import { useAppTheme } from '../../theme/useAppTheme';
import ProgressWidget from './ProgressWidget';
import FinancialGraph from './FinancialGraph';
import StudyList from './StudyList';

export type UIComponentType = 'ProgressCircle' | 'FinanceBar' | 'ArtifactCard' | 'ActionButtons';

export interface AgentResponse {
  intent: string;
  speech: string;
  ui?: {
    type: UIComponentType;
    props: any;
  };
  actions?: { label: string; command: string }[];
}

export const ArtifactCard = (props: any) => {
  const { colors } = useAppTheme();
  return (
    <View style={{ padding: 16, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
      <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 16 }}>{props.title}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 4 }}>{props.preview}</Text>
    </View>
  );
};

export const UI_REGISTRY: Record<string, React.FC<any>> = {
  ProgressCircle: (props) => <ProgressWidget {...props} />,
  FinanceBar: (props) => <FinancialGraph {...props} />,
  ArtifactCard: (props) => <ArtifactCard {...props} />,
  ActionButtons: (props) => <StudyList {...props} />, // Mapping StudyList to Artifact viewing in this context
};
