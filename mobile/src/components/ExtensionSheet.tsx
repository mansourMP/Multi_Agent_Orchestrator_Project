import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Modal, 
  Dimensions, 
  Pressable 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/src/theme/useAppTheme';
const { height } = Dimensions.get('window');

interface Extension {
  id: string;
  label: string;
  icon: string;
  color: string;
  prompt: string;
}

const EXTENSIONS: Extension[] = [
  { id: 'nutrition', label: 'Nutrition', icon: 'restaurant', color: '#FF6B35', prompt: 'Log nutrition: ' },
  { id: 'sleep', label: 'Sleep', icon: 'moon', color: '#6C63FF', prompt: 'Log sleep: ' },
  { id: 'goals', label: 'Goals', icon: 'trophy', color: '#00C896', prompt: 'Update goal: ' },
  { id: 'study', label: 'Study', icon: 'book', color: '#FFD700', prompt: 'Start study session: ' },
  { id: 'finance', label: 'Finance', icon: 'wallet', color: '#4ECDC4', prompt: 'Log expense: ' },
  { id: 'focus', label: 'Focus', icon: 'stopwatch', color: '#FF4757', prompt: 'Start focus mode' },
  { id: 'brainstorm', label: 'Brainstorm', icon: 'bulb', color: '#FFA502', prompt: 'Brainstorm ideas for: ' },
  { id: 'email', label: 'Email Digest', icon: 'mail', color: '#747D8C', prompt: 'Summarize my emails' },
];

interface ExtensionSheetProps {
  isVisible: boolean;
  onClose: () => void;
  onSelectExtension: (prompt: string) => void;
}

export const ExtensionSheet: React.FC<ExtensionSheetProps> = ({ 
  isVisible, 
  onClose, 
  onSelectExtension 
}) => {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useStyles(theme, insets);
  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.dismissArea} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.handle} />
            <Text style={styles.title}>Extensions</Text>
          </View>
          
          <View style={styles.grid}>
            {EXTENSIONS.map((ext) => (
              <TouchableOpacity 
                key={ext.id} 
                style={styles.tile}
                onPress={() => {
                  onSelectExtension(ext.prompt);
                  onClose();
                }}
              >
                <View style={[styles.iconContainer, { backgroundColor: ext.color + '20' }]}>
                  <Ionicons name={ext.icon as any} size={24} color={ext.color} />
                </View>
                <Text style={styles.label}>{ext.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const useStyles = (theme: any, insets: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: insets.bottom + 20,
    minHeight: height * 0.4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.indicator,
    marginBottom: 12,
  },
  title: {
    color: theme.colors.text,
    fontSize: 18,
    fontFamily: 'Fraunces_700Bold',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
  },
  tile: {
    width: '25%',
    alignItems: 'center',
    marginVertical: 16,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontFamily: 'DMSans_500Medium',
    textAlign: 'center',
  },
});
