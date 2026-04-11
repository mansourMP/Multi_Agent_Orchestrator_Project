import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  TextInput,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useExtensionStore, Module } from '../../stores/extensionStore';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

export const ModuleCatalog = ({ onClose }: { onClose: () => void }) => {
  const theme = useAppTheme();
  const { installedModules, installModule, uninstallModule, togglePin } = useExtensionStore();
  const [search, setSearch] = useState('');

  const filtered = installedModules.filter(m => 
    m.name.toLowerCase().includes(search.toLowerCase()) || 
    m.description.toLowerCase().includes(search.toLowerCase())
  );

  const handleInstall = (module: Module) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    installModule(module);
  };

  const handleUninstall = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    uninstallModule(id);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <View>
          <Text style={[styles.title, { color: theme.colors.text }]}>App Catalog</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>Install apps to expand your OS</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.colors.surface }]}>
          <Ionicons name="close" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBox}>
        <View style={[styles.searchBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Ionicons name="search" size={18} color={theme.colors.textSecondary} />
          <TextInput 
            style={[styles.searchInput, { color: theme.colors.text }]}
            placeholder="Search apps..."
            placeholderTextColor={theme.colors.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Available Apps</Text>
        
        {filtered.map((module) => (
          <View key={module.id} style={[styles.moduleCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <View style={[styles.moduleIcon, { backgroundColor: theme.colors.accent + '15' }]}>
              <Ionicons name={module.icon as any} size={24} color={theme.colors.accent} />
            </View>
            
            <View style={styles.moduleInfo}>
              <View style={styles.moduleHeader}>
                <Text style={[styles.moduleName, { color: theme.colors.text }]}>{module.name}</Text>
                <View style={[styles.badge, { backgroundColor: theme.colors.surface }]}>
                  <Text style={[styles.badgeText, { color: theme.colors.textSecondary }]}>
                    {module.category === 'Hub' ? 'App' : module.category}
                  </Text>
                </View>
              </View>
              <Text style={[styles.moduleDesc, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                {module.description}
              </Text>
              
              <View style={styles.moduleFooter}>
                <Text style={[styles.versionText, { color: theme.colors.textSecondary }]}>v{module.version}</Text>
                <View style={styles.moduleActions}>
                  {module.status === 'installed' && (
                    <TouchableOpacity
                      onPress={() => togglePin(module.id)}
                      style={[styles.actionBtn, { borderColor: theme.colors.border, borderWidth: 1 }]}
                    >
                      <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>
                        {module.pinned ? 'Pinned' : 'Pin'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {module.status === 'installed' ? (
                    <TouchableOpacity 
                      onPress={() => handleUninstall(module.id)}
                      style={[styles.actionBtn, { borderColor: theme.colors.border, borderWidth: 1 }]}
                    >
                      <Text style={[styles.actionBtnText, { color: theme.colors.error || '#FF4B4B' }]}>Uninstall</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity 
                      onPress={() => handleInstall(module)}
                      style={[styles.actionBtn, { backgroundColor: theme.colors.accent }]}
                    >
                      <Text style={[styles.actionBtnText, { color: '#FFF' }]}>Install</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: 60,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Fraunces_700Bold',
  },
  subtitle: {
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
    marginTop: 4,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    padding: 20,
    paddingBottom: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'DMSans_400Regular',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'DMSans_700Bold',
    marginBottom: 16,
  },
  moduleCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 16,
    gap: 16,
  },
  moduleIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleInfo: {
    flex: 1,
  },
  moduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  moduleName: {
    fontSize: 16,
    fontFamily: 'DMSans_700Bold',
  },
  moduleDesc: {
    fontSize: 13,
    fontFamily: 'DMSans_400Regular',
    lineHeight: 18,
    marginBottom: 12,
  },
  moduleFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  moduleActions: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'DMSans_700Bold',
    textTransform: 'uppercase',
  },
  versionText: {
    fontSize: 11,
    fontFamily: 'DMSans_400Regular',
  },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  actionBtnText: {
    fontSize: 13,
    fontFamily: 'DMSans_700Bold',
  }
});
