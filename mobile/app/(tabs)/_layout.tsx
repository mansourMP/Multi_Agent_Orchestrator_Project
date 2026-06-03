import { Tabs, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/src/theme/useAppTheme";
import { MotionTabBarButton } from "@/src/components/navigation/MotionTabBarButton";

export default function TabsLayout() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const rootSegment = segments.at(0);
  const sectionSegment = segments.at(1);
  const leafSegment = segments.at(2);
  const tabBarBottomInset = Math.max(insets.bottom, theme.spacing.xs);
  const tabBarHeight = theme.spacing.xxl + theme.spacing.xl;
  const isChatThread =
    rootSegment === "(tabs)" &&
    (sectionSegment === "kin" || sectionSegment === "chats") &&
    leafSegment === "[id]";
  const hiddenTabBar = isChatThread;

  return (
    <Tabs
      screenListeners={{
        tabPress: () => {
          void Haptics.selectionAsync();
        },
      }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: theme.colors.text,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          display: hiddenTabBar ? "none" : "flex",
          position: "absolute",
          left: theme.spacing.sm,
          right: theme.spacing.sm,
          bottom: tabBarBottomInset,
          height: tabBarHeight,
          paddingTop: theme.spacing.xs,
          paddingBottom: theme.spacing.xs,
          paddingHorizontal: theme.spacing.xs,
          backgroundColor: theme.colors.card,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.xl,
          shadowColor: theme.colors.border,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0,
          shadowRadius: 0,
          elevation: 0,
        },
        tabBarItemStyle: {
          paddingTop: 0,
          paddingBottom: 0,
          borderRadius: theme.radii.md,
          marginHorizontal: 0,
        },
        tabBarLabelStyle: {
          fontSize: theme.typography.caption,
          fontFamily: "DMSans_700Bold",
          marginTop: 0,
          paddingBottom: 0,
          letterSpacing: 0,
        },
        tabBarIconStyle: {
          marginTop: 0,
        },
        tabBarButton: (props) => <MotionTabBarButton {...props} />,
        sceneStyle: {
          backgroundColor: theme.colors.background,
          paddingBottom: hiddenTabBar ? 0 : tabBarHeight + tabBarBottomInset + theme.spacing.sm,
        },
        tabBarIcon: ({ color, size, focused }) => {
          const iconMap: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
            chats: { active: "sparkles", inactive: "sparkles-outline" },
            kin: { active: "person-circle", inactive: "person-circle-outline" },
            "apps/index": { active: "apps", inactive: "apps-outline" },
            "discover/index": { active: "compass", inactive: "compass-outline" },
            "inbox/index": { active: "pulse", inactive: "pulse-outline" },
            "settings/index": { active: "settings", inactive: "settings-outline" },
          };
          const iconSet = iconMap[route.name];
          const icon = iconSet ? (focused ? iconSet.active : iconSet.inactive) : "ellipse";
          return <Ionicons name={icon} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="chats" options={{ title: "Sage" }} />
      <Tabs.Screen name="kin" options={{ title: "Agents", href: null }} />
      <Tabs.Screen name="apps/index" options={{ title: "Apps" }} />
      <Tabs.Screen name="discover/index" options={{ title: "Discover" }} />
      <Tabs.Screen name="inbox/index" options={{ title: "Activity" }} />
      <Tabs.Screen name="settings/index" options={{ title: "Settings" }} />
    </Tabs>
  );
}
