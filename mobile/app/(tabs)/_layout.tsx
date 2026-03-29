import { Tabs, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAppTheme } from "@/src/theme/useAppTheme";

export default function TabsLayout() {
  const theme = useAppTheme();
  const segments = useSegments();
  const isChatThread = segments[0] === "(tabs)" && segments[1] === "chats" && segments[2] === "[id]";

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          display: isChatThread ? "none" : "flex",
          height: 64,
          paddingTop: 8,
          paddingBottom: 8,
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: "DMSans_500Medium",
        },
        sceneStyle: {
          backgroundColor: theme.colors.background,
        },
        tabBarIcon: ({ color, size, focused }) => {
          const iconMap: Record<
            string,
            { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }
          > = {
            chats: {
              active: "chatbubble-ellipses",
              inactive: "chatbubble-ellipses-outline",
            },
            "apps/index": {
              active: "grid",
              inactive: "grid-outline",
            },
            "today/index": {
              active: "sunny",
              inactive: "sunny-outline",
            },
            "spaces/index": {
              active: "folder",
              inactive: "folder-outline",
            },
          };
          const icon = iconMap[route.name];
          return <Ionicons name={icon ? (focused ? icon.active : icon.inactive) : "ellipse-outline"} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="chats" options={{ title: "Chats" }} />
      <Tabs.Screen name="apps/index" options={{ title: "Apps" }} />
      <Tabs.Screen name="today/index" options={{ title: "Today" }} />
      <Tabs.Screen name="spaces/index" options={{ title: "Spaces" }} />
    </Tabs>
  );
}
