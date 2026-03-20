import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';

const StudyList = (props: any) => {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.accent }]}>{props.title || 'Study Session'}</Text>
      {props.items?.map((item: any, index: number) => (
        <View key={index} style={styles.item}>
          <Ionicons name="book-outline" size={16} color={colors.accent} />
          <Text style={[styles.itemText, { color: colors.text }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Fraunces_700Bold',
    marginBottom: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  itemText: {
    fontSize: 14,
    fontFamily: 'DMSans_400Regular',
  }
});

export default StudyList;
