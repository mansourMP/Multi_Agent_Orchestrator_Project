import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/src/theme/useAppTheme';

export default function ExtensionScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Dynamic Header */}
      <View style={{ paddingTop: insets.top, backgroundColor: theme.colors.card, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
        <View style={{ height: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8, marginRight: 8 }}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: theme.colors.cardHover, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <Ionicons name="cube-outline" size={18} color={theme.colors.text} />
          </View>
          <Text style={{ fontSize: 20, fontFamily: 'Fraunces_700Bold', color: theme.colors.text }}>Extensions</Text>
        </View>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Ionicons name="lock-closed-outline" size={64} color={theme.colors.textMuted} />
        <Text style={{ color: theme.colors.text, fontSize: 18, marginTop: 16, fontFamily: 'DMSans_700Bold' }}>
          Extensions are disabled in V1
        </Text>
        <Text style={{ color: theme.colors.textSecondary, fontSize: 13, marginTop: 8, textAlign: 'center', fontFamily: 'DMSans_400Regular' }}>
          V1 uses the local core for all intelligence. Use the main Chat screen.
        </Text>
      </View>
    </View>
  );
}
