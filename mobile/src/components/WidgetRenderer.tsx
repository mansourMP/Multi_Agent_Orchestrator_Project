import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

import { useAppTheme } from '@/src/theme/useAppTheme';
import { WidgetPayload } from '@/src/utils/widgetParser';
import { TextBlock } from './blocks/TextBlock';

// Wait for these to be created in the next steps
import { BarChartWidget } from './widgets/BarChartWidget';
import { QuickLogWidget } from './widgets/QuickLogWidget';
import { UniversalMetricsWidget, UniversalMetricsData } from './widgets/UniversalMetricsWidget';

interface WidgetRendererProps {
  payload: WidgetPayload;
  onAction?: (actionId: string, intentData?: any) => void;
}

export const WidgetRenderer: React.FC<WidgetRendererProps> = ({ payload, onAction }) => {
  const theme = useAppTheme();
  const styles = useStyles(theme);

  if (payload.type === 'text') {
    return <TextBlock role="agent" message={payload.message || "Unknown response"} />;
  }

  // Fallback for when we add a new widget type but haven't deployed the frontend yet
  const renderUnknownWidget = () => (
    <View style={styles.errorContainer}>
      <Text style={styles.errorTitle}>Update Required</Text>
      <Text style={styles.errorBody}>Your OS received a `{payload.widgetType}` payload but it is not supported in this version.</Text>
    </View>
  );

  const renderWidgetContent = () => {
    switch (payload.widgetType) {
      case 'UniversalMetrics':
        return <UniversalMetricsWidget data={payload.data as UniversalMetricsData} onAction={onAction} />;
      case 'BarChart':
        return <BarChartWidget data={payload.data} />;
      case 'QuickLog':
        return <QuickLogWidget data={payload.data} />;
      default:
        return renderUnknownWidget();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconBox}>
          <Text style={{ fontSize: 16 }}>✨</Text>
        </View>
        <Text style={styles.title}>{payload.title || "Interactive App"}</Text>
      </View>
      
      <View style={styles.content}>
        {renderWidgetContent()}
      </View>

      {payload.actions && payload.actions.length > 0 && (
        <View style={styles.actionsContainer}>
          {payload.actions.map((act) => {
            const isPrimary = act.theme === 'primary' || act.theme === 'success';
            return (
              <TouchableOpacity 
                key={act.id} 
                onPress={() => onAction && onAction(act.id, act.payload)}
                style={[
                  styles.button, 
                  isPrimary ? styles.buttonPrimary : styles.buttonSecondary
                ]}
              >
                <Text style={[
                  styles.buttonText, 
                  isPrimary ? styles.buttonTextPrimary : styles.buttonTextSecondary
                ]}>{act.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      )}
    </View>
  );
};

const useStyles = (theme: ReturnType<typeof useAppTheme>) => StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 12,
    backgroundColor: theme.colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.cardHover,
    gap: 12,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontFamily: 'DMSans_700Bold',
    color: theme.colors.text,
  },
  content: {
    padding: 16,
  },
  actionsContainer: {
    flexDirection: 'row',
    padding: 16,
    paddingTop: 0,
    gap: 8,
    justifyContent: 'flex-end',
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  buttonPrimary: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.border,
  },
  buttonText: {
    fontSize: 14,
    fontFamily: 'DMSans_700Bold',
  },
  buttonTextPrimary: {
    color: '#fff',
  },
  buttonTextSecondary: {
    color: theme.colors.text,
  },
  errorContainer: {
    padding: 16,
    backgroundColor: theme.isDark ? '#331111' : '#ffebeb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.isDark ? '#662222' : '#ffbaba',
  },
  errorTitle: {
    color: theme.isDark ? '#ff9999' : '#cc0000',
    fontFamily: 'DMSans_700Bold',
    marginBottom: 4,
  },
  errorBody: {
    color: theme.isDark ? '#ffcccc' : '#990000',
    fontSize: 13,
  }
});
