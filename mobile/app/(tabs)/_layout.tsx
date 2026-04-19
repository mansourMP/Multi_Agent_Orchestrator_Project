import { Tabs, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAppTheme } from "@/src/theme/useAppTheme";

export default function TabsLayout() {
  const theme = useAppTheme();
  const segments = useSegments();
  const rootSegment = segments.at(0);
  const sectionSegment = segments.at(1);
  const leafSegment = segments.at(2);
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
        tabBarActiveTintColor: theme.colors.text,
        tabBarInactiveTintColor: "#7A7D84",
        tabBarStyle: {
          display: hiddenTabBar ? "none" : "flex",
          position: "absolute",
          left: 10,
          right: 10,
          bottom: 2,
          height: 62,
          paddingTop: 5,
          paddingBottom: 5,
          paddingHorizontal: 6,
          backgroundColor: "#F3F4F6",
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          borderRadius: 22,
          shadowColor: "#121417",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.06,
          shadowRadius: 14,
          elevation: 5,
        },
        tabBarItemStyle: {
          paddingTop: 1,
          paddingBottom: 1,
          borderRadius: 16,
          marginHorizontal: 2,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontFamily: "DMSans_700Bold",
          marginTop: 1,
          paddingBottom: 0,
          letterSpacing: 0.1,
        },
        tabBarIconStyle: {
          marginTop: 0,
        },
        sceneStyle: {
          backgroundColor: theme.colors.background,
          paddingBottom: hiddenTabBar ? 0 : 72,
        },
        tabBarIcon: ({ color, size, focused }) => {
          const iconMap: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
            chats: { active: "sparkles", inactive: "sparkles-outline" },
            "apps/index": { active: "grid", inactive: "grid-outline" },
            "profile/index": { active: "person", inactive: "person-outline" },
          };
          const iconSet = iconMap[route.name];
          const icon = iconSet ? (focused ? iconSet.active : iconSet.inactive) : "ellipse";
          return <Ionicons name={icon} size={focused ? size + 1 : size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="home/index" options={{ href: null }} />
      <Tabs.Screen name="chats" options={{ title: "Agent" }} />
      <Tabs.Screen name="apps/index" options={{ title: "Applications" }} />
      <Tabs.Screen name="inbox/index" options={{ href: null }} />
      <Tabs.Screen name="profile/index" options={{ title: "Profile" }} />
      <Tabs.Screen name="kin" options={{ href: null }} />
      <Tabs.Screen name="today/index" options={{ href: null }} />
      <Tabs.Screen name="spaces/index" options={{ href: null }} />
    </Tabs>
  );
}
