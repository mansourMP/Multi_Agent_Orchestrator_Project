import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AgentResponse, UI_REGISTRY } from './generative/Registry';

export const RenderMessage = ({ item, onAction, theme }: { item: AgentResponse, onAction?: (cmd: string) => void, theme: any }) => (
  <View style={[styles.messageContainer, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
    <Text style={[styles.speechText, { color: theme.colors.text }]}>{item.speech}</Text>
    
    {item.ui && UI_REGISTRY[item.ui.type] ? (
      <View style={styles.uiContainer}>
        {React.createElement(UI_REGISTRY[item.ui.type], item.ui.props)}
      </View>
    ) : null}
    
    <View style={styles.actionRow}>
      {item.actions?.map((btn: { label: string; command: string }) => (
        <TouchableOpacity 
          key={btn.command}
          style={[styles.actionButton, { backgroundColor: theme.colors.accent }]}
          onPress={() => onAction && onAction(btn.command)}
        >
          <Text style={styles.actionButtonText}>{btn.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  </View>
);

const styles = StyleSheet.create({
  messageContainer: {
    marginVertical: 12,
    padding: 20,
    borderRadius: 24,
    marginHorizontal: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  speechText: {
    fontSize: 16,
    fontFamily: 'DMSans_400Regular',
    lineHeight: 22,
    marginBottom: 8,
  },
  uiContainer: {
    marginVertical: 10,
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: 14,
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'DMSans_700Bold'
  }
});
