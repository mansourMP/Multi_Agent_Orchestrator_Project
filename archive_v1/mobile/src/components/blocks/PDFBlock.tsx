import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '@/src/theme/useAppTheme';
interface PDFBlockProps {
  uri: string;
  title: string;
}

export const PDFBlock: React.FC<PDFBlockProps> = ({ uri, title }) => {
  const theme = useAppTheme();
  const styles = useStyles(theme);
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconContainer}>
          <Ionicons name="document-text" size={24} color="#fff" />
        </View>
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.subtitle}>PDF Document</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#666" />
      </View>
    </View>
  );
};

const useStyles = (theme: any) => StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    width: '100%',
    marginVertical: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: theme.colors.indicator,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  title: {
    color: theme.colors.text,
    fontSize: 16,
    fontFamily: 'DMSans_700Bold',
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
    marginTop: 2,
  },
});
